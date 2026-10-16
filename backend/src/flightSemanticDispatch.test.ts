import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createFlightSemanticExecutor,
  flightSemanticMaterialBytes,
  type FlightSemanticMaterial,
} from "./flightSemanticDispatch";
import {
  bindFlightAssemblyModelTask,
  flightAssemblyModelProfile,
  modelTaskBindingSchema,
} from "./modelTaskProfile";
import { flightExecutorFixture } from "./__fixtures__/flightExecutor";
import { fixtureHash } from "./__fixtures__/flightRemote";
import {
  createClosedPersistenceGateway,
  verifiedCallContextSchema,
} from "./externalIntegrationPersistence";
import { parseReferenceFlightText } from "../../src/domain/trip/referenceFlightExtractor";
import { assembleFlightDocuments } from "../../src/domain/trip/flightAssembly";
import { buildFlightAssemblyRequest } from "../../src/domain/trip/flightSemanticAssembly";
async function fixture() {
  const f = await flightExecutorFixture();
  const text = "AB123 route=AKL -> NSN date=2030-12-14";
  const inputId = randomUUID();
  const documents = [{ inputId, text, parsed: parseReferenceFlightText(inputId, text) }];
  const request = buildFlightAssemblyRequest(
    documents,
    assembleFlightDocuments(documents),
  );
  const material: FlightSemanticMaterial = {
    version: "FLIGHT_ASSEMBLY_MATERIAL_V1",
    identity: {
      accountId: f.a.account_id,
      batchId: randomUUID(),
      jobId: randomUUID(),
      inputId,
      sourceId: null,
      originalSha256: "a".repeat(64),
    },
    request,
    image: null,
  };
  f.a.descriptor_snapshot = {
    version: 1,
    provider_class: "COMMERCIAL_REMOTE",
    replay_support: "UNSUPPORTED",
    capabilities: ["INTERPRET"],
    modalities: ["TEXT"],
    network_required: true,
  };
  const bytes = flightSemanticMaterialBytes(material);
  f.a.request_material_sha256 = await fixtureHash(bytes);
  const profile = flightAssemblyModelProfile("TEXT");
  const modelBinding = bindFlightAssemblyModelTask(
    {
      ...f.command.model_task_binding.request,
      consumer_version: 2,
      input: {
        reference: f.a.request_material_reference!,
        sha256: f.a.request_material_sha256,
        byte_count: bytes.length,
      },
      schema: {
        id: profile.output_schema_version,
        version: 1,
        dialect: "OTR_TYPED_V1",
        sha256: profile.output_schema_sha256,
      },
    },
    "TEXT",
  );
  const pins = {
    ...f.descriptor.remote,
    prompt_sha256: profile.prompt_sha256,
    envelope_sha256: profile.envelope_sha256,
    output_schema_sha256: profile.output_schema_sha256,
    minimizer_sha256: profile.minimizer_sha256,
    privacy_sha256: profile.privacy_sha256,
  };
  let call = { ...f.command.row },
    raw: unknown = null,
    retained: { reference: string; sha256: string; byteCount: number } | null = null;
  const gateway = createClosedPersistenceGateway({
    gatewayIdentity: "otr_external_integration_call_gateway",
    now: () => "2026-10-07T00:00:00Z",
    verify: async (r) =>
      verifiedCallContextSchema.parse({
        ...f.host,
        request_id: r.requestId,
        request_sha256: r.requestSha256,
        command_kind: r.command,
      }),
    execute: async (kind, _context, command) => {
      if (kind === "flight_activation_reserve_call") {
        expect(command.model_task_binding).toEqual(modelBinding);
        call = structuredClone(command.row) as typeof call;
        return call;
      }
      if (call.dispatch_state !== "RESERVED") throw new Error("CAS");
      call = {
        ...call,
        dispatch_state: "MAY_HAVE_STARTED",
        execution_certainty: "RUNNING",
        row_revision: 2,
      };
      return call;
    },
  });
  const fields = request.partB.fields;
  const proposal = {
    bookingGroups: [],
    segments: [
      {
        id: "s0",
        observationIds: ["o0"],
        fieldIds: fields.map((x) => x.id),
        evidenceIds: [...new Set(fields.flatMap((x) => x.evidenceIds))],
        bookingGroupId: "",
        basis: "Observed only",
      },
    ],
    unresolved: [],
    conflicts: [],
  };
  const send = vi.fn(async () => ({
    status: 200,
    redirected: false,
    body: (async function* () {
      yield Buffer.from(
        JSON.stringify({
          model: "deepseek-flash",
          choices: [
            { finish_reason: "stop", message: { content: JSON.stringify(proposal) } },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        }),
      );
    })(),
  }));
  const importId = randomUUID();
  const load = async () => ({
    material,
    modelBinding,
    pins,
    scope: {
      integration_version: 1,
      grant_revision: 1,
      trip_id: f.request.binding.trip_id,
      import_id: importId,
      currency: "USD",
    },
    imageTokenCeiling: null,
    host: f.host,
    signal: f.signal.signal,
    deadline: 1000,
  });
  const deps = {
    gateway,
    repo: {
      ...f.repo,
      snapshot: async () => ({
        task: {
          publication_fence: f.a.task_publication_fence,
          cancellation_disposition: "NONE" as const,
          current_attempt_id: f.a.attempt_id,
          work_disposition: "RUNNING" as const,
        },
      }),
    },
    stores: {
      custody: {
        ...f.deps.custody,
        verify: async (p) =>
          p.reference === f.a.request_material_reference &&
          p.sha256 === f.a.request_material_sha256 &&
          p.byteCount === bytes.length,
      },
      retained: {
        put: async (_a: unknown, pin: NonNullable<typeof retained>) => {
          if (retained && JSON.stringify(retained) !== JSON.stringify(pin))
            throw new Error("IMMUTABLE_INDEX");
          retained = pin;
        },
        read: async () => retained,
      },
      retainRaw: async (
        _account: string,
        _id: string,
        pin: unknown,
        binding: unknown,
      ) => {
        raw = { version: 1, pin, binding };
      },
      readRaw: async () => {
        if (!raw) throw Object.assign(new Error("NO_RAW"), { code: "ENOENT" });
        return raw as never;
      },
    },
    load,
    authorizeMaterial: async () => {},
    readCall: async () => call,
    resolver: f.deps.resolver,
    send,
    appendMeter: f.meter,
    hash: fixtureHash,
    id: randomUUID,
    now: () => "2026-10-07T00:00:00Z",
    monotonic: () => 1,
  } satisfies Parameters<typeof createFlightSemanticExecutor>[0];
  return {
    ...f,
    deps,
    executor: createFlightSemanticExecutor(deps),
    material,
    modelBinding,
    send,
    proposal,
    clearResult: () => {
      retained = null;
    },
  };
}
it("versioned model task cannot pass as registered remote-v2", async () => {
  const f = await fixture();
  expect(modelTaskBindingSchema.safeParse(f.modelBinding).success).toBe(false);
});
it("same CP15 reserve/mark and custody execute semantic response and recover without another call", async () => {
  const f = await fixture();
  expect(await f.executor.prepareUsage(f.context, f.a.attempt_id)).toBe("START_DURABLE");
  const report = await f.executor.execute(f.context, f.a.attempt_id);
  expect(report.execution_observation).toBe("TERMINAL");
  expect(report.reported_usage_summary?.total_tokens).toBe(120);
  const recovered = await f.executor.recover(f.context, f.a.attempt_id);
  expect(recovered.identity.sourceId).toBeNull();
  expect(
    (await f.executor.readTechnicalOutput(f.context, f.a.attempt_id))?.output,
  ).toEqual(f.proposal);
  expect(recovered.interpretation.validation.status).toBe("ACCEPTED");
  await f.executor.execute(f.context, f.a.attempt_id);
  expect(f.send).toHaveBeenCalledTimes(1);
  f.clearResult();
  const rawRecovered = await f.executor.recover(f.context, f.a.attempt_id);
  expect(rawRecovered.interpretation.validation.status).toBe("ACCEPTED");
  expect(f.send).toHaveBeenCalledTimes(1);
});
it("same strict validator rejects invented IDs yet technical output/usage stays inspectable", async () => {
  const f = await fixture();
  f.proposal.segments[0].fieldIds.push("invented");
  await f.executor.prepareUsage(f.context, f.a.attempt_id);
  await f.executor.execute(f.context, f.a.attempt_id);
  expect(
    (await f.executor.recover(f.context, f.a.attempt_id)).interpretation.validation,
  ).toMatchObject({ status: "REJECTED", reasonCodes: ["UNKNOWN_FIELD_ID"] });
});
it("changed immutable request fails before reserve or dispatch", async () => {
  const f = await fixture();
  f.material.identity.sourceId = randomUUID();
  await expect(f.executor.prepareUsage(f.context, f.a.attempt_id)).rejects.toThrow(
    "POLICY_BLOCKED",
  );
  expect(f.send).not.toHaveBeenCalled();
});
it("competing executions consume the existing local CAS only once", async () => {
  const f = await fixture();
  await f.executor.prepareUsage(f.context, f.a.attempt_id);
  const results = await Promise.allSettled([
    f.executor.execute(f.context, f.a.attempt_id),
    f.executor.execute(f.context, f.a.attempt_id),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(f.send).toHaveBeenCalledTimes(1);
});
it("missing credential denies before creating a provider reservation", async () => {
  const f = await fixture();
  f.deps.resolver.resolve = async () => null;
  const invoke = vi.spyOn(f.deps.gateway, "invoke");
  await expect(f.executor.prepareUsage(f.context, f.a.attempt_id)).rejects.toThrow(
    "AUTH_FAILED",
  );
  expect(invoke).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
});

it("uses the real SQLite continuation CAS revision and exact disclosure authorization", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { migrations } = await import("../../src/data/db/migrations");
  const { createIntelligenceContinuationRepository } =
    await import("../../src/data/repositories/intelligenceContinuationRepository");
  const { taskSchema, taskJsonColumns, attemptJsonColumns } =
    await import("../../src/domain/intelligence/persistence");
  const { persistenceDigest } = await import("./externalIntegrationPersistence");
  const f = await fixture();
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrations) sql.exec(migration.sql);
    const at = "2026-10-07T00:00:00Z";
    const task = taskSchema.parse({
      account_id: f.a.account_id,
      task_id: f.a.task_id,
      format_version: 1,
      import_id: f.material.identity.batchId,
      manifest_version: 1,
      manifest_sha256: "a".repeat(64),
      trip_id: f.context.tripId,
      stage: "INTERPRETATION",
      logical_request_id: randomUUID(),
      logical_idempotency_key: randomUUID(),
      input_pins: [],
      input_sha256: persistenceDigest([]),
      consumer_id: "import",
      consumer_version: 2,
      schema_id: "FLIGHT_ASSEMBLY_PROPOSAL_V1",
      schema_version: 1,
      schema_dialect: "OTR_TYPED_V1",
      schema_sha256: f.modelBinding.request.schema.sha256,
      capability_requirements: ["INTERPRET"],
      policy_snapshot: f.modelBinding.request.policy_snapshot,
      policy_sha256: f.modelBinding.request.policy_sha256,
      run_id: null,
      expected_run_generation: null,
      candidate_id: null,
      expected_candidate_sha256: null,
      event_id: null,
      expected_event_revision: null,
      created_at: at,
      creation_clock: "DEVICE_WALL",
      row_revision: 1,
      publication_fence: f.a.task_publication_fence,
      current_pass_complete: false,
      work_disposition: "RUNNING",
      wait_reason: null,
      wait_reasons: [],
      sync_operation_id: f.a.sync_operation_id,
      dependencies: [],
      current_attempt_id: f.a.attempt_id,
      cancellation_disposition: "NONE",
      safe_reason: null,
      publication_id: null,
      publication_sha256: null,
      result_sha256: null,
      updated_at: at,
      update_clock: "DEVICE_WALL",
      completed_at: null,
    });
    const insert = (
      table: string,
      object: Record<string, unknown>,
      jsonColumns: readonly string[],
    ) => {
      const values = Object.entries(object).map(([k, v]) =>
        jsonColumns.includes(k) && v !== null
          ? JSON.stringify(v)
          : typeof v === "boolean"
            ? Number(v)
            : v,
      );
      sql
        .prepare(
          `INSERT INTO ${table}(${Object.keys(object).join(",")}) VALUES(${values.map((v) => (typeof v === "number" ? "CAST(? AS INTEGER)" : "?")).join(",")})`,
        )
        .run(...(values as never[]));
    };
    sql.exec("BEGIN");
    sql
      .prepare(
        "INSERT INTO sync_operations(id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at) VALUES(?,?,?,'INTELLIGENCE_CONTINUATION',?,'CP14_CLOSED',?,'{}','PROCESSING',?,?)",
      )
      .run(
        f.a.sync_operation_id,
        f.a.account_id,
        f.context.tripId,
        f.a.task_id,
        randomUUID(),
        at,
        at,
      );
    insert(
      "intelligence_continuations",
      { ...task, current_attempt_id: null },
      taskJsonColumns,
    );
    insert("intelligence_continuation_attempts", f.a, attemptJsonColumns);
    sql
      .prepare(
        "UPDATE intelligence_continuations SET current_attempt_id=?,row_revision=row_revision+1 WHERE account_id=? AND task_id=?",
      )
      .run(f.a.attempt_id, f.a.account_id, f.a.task_id);
    sql.exec("COMMIT");
    const db = {
      async getFirstAsync<T>(q: string, ...p: unknown[]) {
        return (sql.prepare(q).get(...(p as never[])) ?? null) as T | null;
      },
      async getAllAsync<T>(q: string, ...p: unknown[]) {
        return sql.prepare(q).all(...(p as never[])) as T[];
      },
      async runAsync(q: string, ...p: unknown[]) {
        return sql.prepare(q).run(...(p as never[])) as never;
      },
      async withTransactionAsync(work: () => Promise<void>) {
        sql.exec("BEGIN");
        try {
          await work();
          sql.exec("COMMIT");
        } catch (e) {
          sql.exec("ROLLBACK");
          throw e;
        }
      },
    };
    const repo = createIntelligenceContinuationRepository(db, {
      getAccountId: async () => f.a.account_id,
      now: () => at,
      sha256: fixtureHash,
      validateAdmission: async () => {},
      validateAttemptAdmission: async () => {},
      eligibleWait: async () => true,
      verifyRecovery: async () => {},
    });
    const executor = createFlightSemanticExecutor({ ...f.deps, repo });
    await executor.prepareUsage(f.context, f.a.attempt_id);
    const report = await executor.execute(f.context, f.a.attempt_id);
    expect(report.execution_observation).toBe("TERMINAL");
    const current = await repo.readAttempt(f.context, f.a.attempt_id);
    expect(current.row_revision).toBe(f.a.row_revision + 1);
    await expect(repo.authorizeResultDisclosure(f.context, f.a)).rejects.toThrow(
      "INTELLIGENCE_RECOVERY_IDENTITY",
    );
    await repo.authorizeResultDisclosure(f.context, current);
    expect(f.send).toHaveBeenCalledTimes(1);
  } finally {
    sql.close();
  }
});

it.each(["cancel", "deadline"])(
  "recovers a durable raw response after %s without replacing the immutable UNKNOWN index or resending",
  async (mode) => {
    const f = await fixture();
    let clock = 1;
    f.deps.monotonic = () => clock;
    const retainRaw = f.deps.stores.retainRaw;
    f.deps.stores.retainRaw = async (...args) => {
      await retainRaw(...args);
      if (mode === "cancel") f.signal.abort();
      else clock = 2000;
    };
    const put = f.deps.stores.custody.put;
    f.deps.stores.custody.put = async (p) => {
      const old = f.blobs.get(p.reservationId);
      if (
        old &&
        (old.sha256 !== p.sha256 ||
          Buffer.compare(Buffer.from(old.bytes), Buffer.from(p.bytes)))
      )
        throw new Error("IMMUTABLE_CUSTODY");
      return put(p);
    };
    await f.executor.prepareUsage(f.context, f.a.attempt_id);
    const unknown = await f.executor.execute(f.context, f.a.attempt_id);
    expect(unknown.execution_observation).toBe("UNKNOWN");
    const index = await f.deps.stores.retained.read();
    const recovered = await f.executor.recover(f.context, f.a.attempt_id);
    expect(recovered.report.execution_observation).toBe("TERMINAL");
    expect(recovered.report.reported_usage_summary).toMatchObject({
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
    });
    expect(recovered.interpretation.validation.status).toBe("ACCEPTED");
    expect(await f.deps.stores.retained.read()).toEqual(index);
    const count = f.blobs.size;
    const again = await f.executor.recover(f.context, f.a.attempt_id);
    expect(again.report.response_material_reference).toBe(
      recovered.report.response_material_reference,
    );
    expect(f.blobs.size).toBe(count);
    expect(f.send).toHaveBeenCalledTimes(1);
  },
);
it("missing raw keeps the original UNKNOWN and never retries the paid call", async () => {
  const f = await fixture();
  f.deps.send = vi.fn(async () => {
    throw new Error("CONNECTION_LOST");
  });
  const executor = createFlightSemanticExecutor(f.deps);
  await executor.prepareUsage(f.context, f.a.attempt_id);
  expect((await executor.execute(f.context, f.a.attempt_id)).execution_observation).toBe(
    "UNKNOWN",
  );
  expect(
    (await executor.recover(f.context, f.a.attempt_id)).report.execution_observation,
  ).toBe("UNKNOWN");
  await executor.execute(f.context, f.a.attempt_id);
  expect(f.deps.send).toHaveBeenCalledTimes(1);
});
it("rechecks owning task cancellation after the real dispatch handoff", async () => {
  const f = await fixture();
  let cancelled = false;
  f.deps.repo.snapshot = async () => ({
    task: {
      publication_fence: f.a.task_publication_fence,
      cancellation_disposition: cancelled ? ("REQUESTED" as never) : "NONE",
      current_attempt_id: f.a.attempt_id,
      work_disposition: "RUNNING",
    },
  });
  const admit = f.deps.repo.admitExecution;
  f.deps.repo.admitExecution = vi.fn(async (context, a, handoff) =>
    admit(context, a, () => {
      cancelled = true;
      handoff();
    }),
  );
  await f.executor.prepareUsage(f.context, f.a.attempt_id);
  expect(
    (await f.executor.execute(f.context, f.a.attempt_id)).execution_observation,
  ).toBe("UNKNOWN");
  expect(f.send).not.toHaveBeenCalled();
});

it("normal semantic appendMeter uses the real gateway builder and honestly leaves recovered UNKNOWN usage pending its contract gate", async () => {
  const { createFlightSemanticUsageAppender } = await import("./flightUsage");
  const f = await fixture();
  let stored:
    | ReturnType<(typeof import("./flightUsage"))["flightSemanticUsageCommand"]>["row"]
    | null = null;
  let inserts = 0;
  const gateway = createClosedPersistenceGateway({
    gatewayIdentity: "otr_external_integration_call_gateway",
    now: () => "2026-10-07T00:00:00Z",
    verify: async (r) =>
      verifiedCallContextSchema.parse({
        ...f.host,
        request_id: r.requestId,
        request_sha256: r.requestSha256,
        command_kind: r.command,
      }),
    execute: async (kind, _context, command) => {
      expect(kind).toBe("external_integration_usage_append");
      if (stored && JSON.stringify(stored) !== JSON.stringify(command.row))
        throw new Error("CP14_CHANGED_OBSERVATION");
      if (!stored) {
        stored = command.row as NonNullable<typeof stored>;
        inserts++;
      }
      return stored;
    },
  });
  const appendMeter = createFlightSemanticUsageAppender({
    gateway,
    authorize: async (a) => {
      const { task } = await f.deps.repo.snapshot();
      if (
        task.cancellation_disposition !== "NONE" ||
        task.publication_fence !== a.task_publication_fence
      )
        throw new Error("POLICY_BLOCKED");
    },
    loadPrice: async () => ({
      pins: f.descriptor.remote,
      schedule: {
        id: f.descriptor.remote.price_schedule_id,
        sha256: f.descriptor.remote.price_sha256,
        currency: "USD",
        units: [
          {
            measurement_unit: "input_tokens",
            unit_quantity: 1000000,
            price_per_quantity: "0.3",
            relationship: "DISJOINT",
            billable: true,
          },
          {
            measurement_unit: "output_tokens",
            unit_quantity: 1000000,
            price_per_quantity: "1.2",
            relationship: "DISJOINT",
            billable: true,
          },
        ],
      },
    }),
    readCompletion: async () => stored,
    id: randomUUID,
    now: () => "2026-10-07T00:00:00Z",
  });
  const retained = f.deps.stores.retainRaw;
  f.deps.stores.retainRaw = async (...args) => {
    await retained(...args);
    f.signal.abort();
  };
  const executor = createFlightSemanticExecutor({ ...f.deps, appendMeter });
  await executor.prepareUsage(f.context, f.a.attempt_id);
  const unknown = await executor.execute(f.context, f.a.attempt_id);
  expect(unknown.execution_observation).toBe("UNKNOWN");
  expect(unknown.metering_disposition).toBe("COMPLETE");
  const recovered = await executor.recover(f.context, f.a.attempt_id);
  expect(recovered.report.execution_observation).toBe("TERMINAL");
  expect(recovered.report.reported_usage_summary.total_tokens).toBe(120);
  expect(recovered.report.metering_disposition).toBe("COMPLETION_PENDING");
  expect(inserts).toBe(1);
  expect(stored).toMatchObject({
    status: "UNKNOWN",
    usage_quality: "UNKNOWN",
    cost_quality: "UNKNOWN",
    cost_nanos: null,
  });
  expect(f.send).toHaveBeenCalledTimes(1);
});
