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
    repo: f.repo,
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
      readRaw: async () => raw as never,
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
