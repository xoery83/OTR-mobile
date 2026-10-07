import { randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import {
  createFlightDevExecutor,
  flightReservationCommand,
  flightRemoteRequestMaterial,
} from "./flightDevDispatch";
import { flightUsageCommand, flightOperationalFacts } from "./flightUsage";
import { fixtureHash, remoteFixture } from "./__fixtures__/flightRemote";
import {
  createClosedPersistenceGateway,
  verifiedCallContextSchema,
  persistenceDigest,
  commandDigest,
} from "./externalIntegrationPersistence";
import { attemptSchema, type Attempt } from "../../src/domain/intelligence/persistence";
import {
  assertAccountRequestGeneration,
  captureAccountRequestContext,
} from "../../src/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "../../src/data/auth/accountGeneration";
const h = "a".repeat(64),
  at = "2026-10-07T00:00:00Z";
async function fixture(mode = "success") {
  const f = await remoteFixture();
  const pins = f.descriptor.remote;
  const a = attemptSchema.parse({
    account_id: f.request.binding.account_id,
    attempt_id: pins.attempt_id,
    task_id: randomUUID(),
    attempt_sequence: 1,
    format_version: 1,
    request_id: f.request.binding.request_id,
    idempotency_key: f.request.binding.idempotency_key,
    request_sha256: pins.request_sha256,
    request_material_reference: randomUUID(),
    request_material_sha256: f.envelope.envelope_sha256,
    predecessor_attempt_id: null,
    predecessor_request_id: null,
    integration_id: "cp15-flight",
    provider_id: "DeepSeek",
    model_id: "deepseek-flash",
    model_version: "DeepSeek-V4.1-Flash",
    adapter_version: "deepseek-flight-v1",
    provider_config_id: pins.provider_config_id,
    config_version: "1",
    configuration_sha256: h,
    descriptor_snapshot: {
      version: 2,
      provider_class: "COMMERCIAL_REMOTE",
      replay_support: "UNSUPPORTED",
      capabilities: ["EXTRACT"],
      modalities: ["TEXT"],
      network_required: true,
      remote_run: f.descriptor,
    },
    policy_admission: { version: 1, policy_sha256: h, allowed: true },
    policy_admission_sha256: h,
    task_publication_fence: 1,
    sync_operation_id: randomUUID(),
    usage_correlation_id: pins.call_id,
    fallback_chain_id: randomUUID(),
    shadow: false,
    shadow_of_attempt_id: null,
    created_at: at,
    creation_clock: "DEVICE_WALL",
    row_revision: 2,
    execution_observation: "RUNNING",
    execution_outcome: null,
    result_install_disposition: "NONE",
    metering_disposition: "START_DURABLE",
    safe_failure_code: null,
    response_material_reference: null,
    response_material_sha256: null,
    response_sha256: null,
    publication_sha256: null,
    started_at: at,
    ended_at: null,
    latency_ms: null,
    reported_usage_summary: null,
    updated_at: at,
    update_clock: "DEVICE_WALL",
  });
  const command = flightReservationCommand(a, f.envelope, {
    integration_version: 1,
    grant_revision: 1,
    trip_id: f.request.binding.trip_id,
    import_id: randomUUID(),
    currency: "USD",
  });
  a.request_material_sha256 = await fixtureHash(
    flightRemoteRequestMaterial(f.request, f.envelope),
  );
  const signal = new AbortController();
  let state = "RESERVED",
    cas = false,
    secretRevoked = false;
  const order: string[] = [],
    blobs = new Map<string, { accountId: string; sha256: string; bytes: Uint8Array }>();
  let retained: { reference: string; sha256: string; byteCount: number } | null = null;
  const send = vi.fn(async () => {
    order.push("transport");
    return {
      status: 200,
      redirected: false,
      body: (async function* () {
        yield new TextEncoder().encode(
          JSON.stringify({
            id: "chatcmpl-fixture",
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content:
                    mode === "malformed"
                      ? '{"account_id":"PRIVATE_DO_NOT_RETAIN"}'
                      : JSON.stringify(f.output),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
          }),
        );
      })(),
    };
  });
  const gateway = createClosedPersistenceGateway({
    gatewayIdentity: "otr_external_integration_call_gateway",
    now: () => at,
    verify: async (r) =>
      verifiedCallContextSchema.parse({
        ...f.host,
        request_id: r.requestId,
        request_sha256: r.requestSha256,
        command_kind: r.command,
      }),
    execute: async (kind, _context) => {
      if (kind === "flight_activation_reserve_call") {
        order.push("reserve");
        return command.row;
      }
      order.push("mark");
      if (
        mode === "kill" ||
        mode === "grant" ||
        mode === "budget" ||
        mode === "config" ||
        mode === "scope" ||
        mode === "trip"
      )
        throw new Error("CLOSED");
      if (state !== "RESERVED") throw new Error("CAS");
      state = "MAY_HAVE_STARTED";
      if (mode === "lost-ack") throw new Error("ACK_LOST");
      if (mode === "account-aba") {
        advanceAccountGeneration(); // A → B
        advanceAccountGeneration(); // B → A still invalidates the captured generation.
      }
      if (mode === "secret-revoke") secretRevoked = true;
      return {
        ...command.row,
        dispatch_state: state,
        execution_certainty: "RUNNING",
        row_revision: 2,
      };
    },
  });
  const context = await captureAccountRequestContext(
    f.request.binding.trip_id,
    async () => a.account_id,
  );
  const repo = {
    admitExecution: vi.fn(async (_context: unknown, _a: unknown, execute: () => void) => {
      if (cas) throw new Error("LOCAL_CAS");
      cas = true;
      order.push("local-COMMIT-release");
      execute();
    }),
    readAttempt: vi.fn(async () => a),
    authorizeResultDisclosure: vi.fn(async (context) =>
      assertAccountRequestGeneration(context),
    ),
    installResult: vi.fn(async () => a),
  };
  const custody = {
    put: async (p: {
      accountId: string;
      reservationId: string;
      sha256: string;
      byteCount: number;
      bytes: Uint8Array;
    }) => {
      blobs.set(p.reservationId, {
        accountId: p.accountId,
        sha256: p.sha256,
        bytes: p.bytes,
      });
      return { reference: p.reservationId };
    },
    verify: async (p: {
      accountId: string;
      reference: string;
      sha256: string;
      byteCount: number;
    }) =>
      p.reference === a.request_material_reference &&
      p.accountId === a.account_id &&
      p.sha256 === a.request_material_sha256 &&
      p.byteCount === flightRemoteRequestMaterial(f.request, f.envelope).length,
    read: async (p: {
      accountId: string;
      reference: string;
      sha256: string;
      byteCount: number;
    }) => {
      const b = blobs.get(p.reference)!;
      if (b.accountId !== p.accountId || b.sha256 !== p.sha256) throw new Error("SCOPE");
      return b.bytes;
    },
    release: async () => {},
  };
  const meter = vi.fn(async () => {
    order.push("meter");
    if (mode === "meter-loss") throw new Error("LOST");
  });
  const deps = {
    gateway,
    repo,
    custody,
    hash: fixtureHash,
    id: randomUUID,
    now: () => at,
    monotonic: () => 1,
    resolver: {
      resolve: async () =>
        mode === "missing-secret"
          ? null
          : {
              value: "FAKE_NOT_SECRET",
              assertCurrent: async () => {
                if (secretRevoked) throw new Error("REVOKED");
              },
            },
    },
    transport: { kind: "NETWORK_DISABLED_FIXTURE" as const, send },
    load: async () => ({
      request: f.request,
      envelope: f.envelope,
      command,
      host: f.host,
      signal: signal.signal,
      deadline: 1000,
    }),
    retained: {
      put: async (_a: Readonly<Attempt>, p: NonNullable<typeof retained>) => {
        retained = p;
        order.push("retain");
      },
      read: async () => retained,
    },
    readStart: async () => ({
      call_id: pins.call_id,
      request_sha256: a.request_sha256,
      admission_sha256: command.request_sha256,
      start_sha256: command.start.observation_sha256,
      dispatch_state: state,
      start_durable: true,
    }),
    interpret: async (_request: unknown, response: unknown) => ({
      version: 1,
      status: "SUCCEEDED",
      response,
    }),
    appendMeter: meter,
  };
  const factory = createFlightDevExecutor(
    deps as Parameters<typeof createFlightDevExecutor>[0],
  );
  return {
    ...f,
    a,
    command,
    context,
    factory,
    send,
    order,
    repo,
    blobs,
    signal,
    meter,
    state: () => state,
  };
}
describe("CP15B dispatch responsibility on existing C2 seam", () => {
  it("local COMMIT/release → protected ACK → one transport → private retain → meter", async () => {
    const f = await fixture();
    await f.factory.executor(f.context).prepareUsage(f.a);
    const report = await f.factory.executor(f.context).execute(f.a);
    expect(report).toMatchObject({
      execution_observation: "TERMINAL",
      execution_outcome: "SUCCEEDED",
      metering_disposition: "COMPLETE",
    });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.order).toEqual([
      "reserve",
      "local-COMMIT-release",
      "mark",
      "transport",
      "retain",
      "meter",
    ]);
    const recovered = await f.factory.recover(f.context, f.a.attempt_id);
    expect(recovered.report.response_sha256).toBe(report.response_sha256);
    expect(recovered.descriptor).toEqual(f.a.descriptor_snapshot);
  });
  it.each([
    "lost-ack",
    "account-aba",
    "secret-revoke",
    "kill",
    "grant",
    "budget",
    "config",
    "scope",
    "trip",
  ])(
    "%s after local handoff retains UNKNOWN with zero fetch and no replay",
    async (mode) => {
      const f = await fixture(mode);
      const report = await f.factory.executor(f.context).execute(f.a);
      expect(report.execution_observation).toBe("UNKNOWN");
      expect(f.send).not.toHaveBeenCalled();
      await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow();
      expect(f.send).not.toHaveBeenCalled();
      if (mode === "account-aba")
        await expect(f.factory.recover(f.context, f.a.attempt_id)).rejects.toThrow();
      const fresh = await captureAccountRequestContext("", async () => f.a.account_id);
      const stored = await f.factory.recover(fresh, f.a.attempt_id);
      expect(stored.report.execution_observation).toBe("UNKNOWN");
    },
  );
  it.each([
    "prompt_sha256",
    "envelope_sha256",
    "minimizer_sha256",
    "privacy_sha256",
    "policy_sha256",
    "adapter_version",
    "output_schema_sha256",
    "provider_config_sha256",
    "price_sha256",
    "envelope_version",
    "minimizer_version",
    "privacy_profile",
  ] as const)(
    "F3 changed command executing pin %s is denied before any transport",
    async (key) => {
      const f = await fixture();
      f.command.execution_pins[key] = "wrong";
      f.command.execution_pins_sha256 = persistenceDigest(f.command.execution_pins);
      f.command.request_sha256 = commandDigest(f.command);
      await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow(
        "POLICY_BLOCKED",
      );
      expect(f.send).not.toHaveBeenCalled();
    },
  );
  it("concurrent local/remote CAS loser executes zero, winner once", async () => {
    const f = await fixture();
    const ex = f.factory.executor(f.context);
    const reports = await Promise.allSettled([ex.execute(f.a), ex.execute(f.a)]);
    expect(reports.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("missing secret denies before reserve/hold", async () => {
    const f = await fixture("missing-secret");
    await expect(f.factory.executor(f.context).prepareUsage(f.a)).rejects.toThrow(
      "AUTH_FAILED",
    );
    expect(f.order).toEqual([]);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("meter loss preserves recoverable result without redispatch", async () => {
    const f = await fixture("meter-loss");
    const report = await f.factory.executor(f.context).execute(f.a);
    expect(report.metering_disposition).toBe("COMPLETION_PENDING");
    expect(report.execution_outcome).toBe("SUCCEEDED");
    expect(
      (await f.factory.recover(f.context, f.a.attempt_id)).report.response_sha256,
    ).toBe(report.response_sha256);
    await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow();
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("semantic invalid payload is discarded; measured usage survives", async () => {
    const f = await fixture("malformed");
    const report = await f.factory.executor(f.context).execute(f.a);
    expect(report.execution_outcome).toBe("FAILED");
    expect(report.reported_usage_summary?.input_tokens).toBe(100);
    const retained = await f.factory.recover(f.context, f.a.attempt_id);
    expect(JSON.stringify(retained)).not.toContain("PRIVATE_DO_NOT_RETAIN");
  });
  it("changed retained envelope cannot dispatch", async () => {
    const f = await fixture();
    f.envelope.spans[0].raw = "invented";
    await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow(
      "POLICY_BLOCKED",
    );
    expect(f.send).not.toHaveBeenCalled();
  });
  it("immutable rational nanos: cache slices disjoint, reasoning included, unknown never zero", async () => {
    const f = await fixture();
    const report = await f.factory.executor(f.context).execute(f.a);
    const result = {
      status: "SUCCEEDED" as const,
      output: {},
      provider_request_id: "safe-id",
      latency_ms: 5,
      usage: {
        input_tokens: 20,
        output_tokens: 10,
        total_tokens: 30,
        cached_input_tokens: 5,
        reasoning_tokens: 2,
        provider_extension: { prompt_cache_miss_tokens: 15 },
        usage_quality: "ACTUAL_REPORTED" as const,
      },
    };
    const schedule = {
      id: f.descriptor.remote.price_schedule_id,
      sha256: h,
      currency: "USD",
      units: [
        {
          measurement_unit: "input_tokens" as const,
          unit_quantity: 1000,
          price_per_quantity: "1",
          relationship: "DISJOINT" as const,
          billable: true,
        },
        {
          measurement_unit: "cached_input_tokens" as const,
          unit_quantity: 1000,
          price_per_quantity: "0.5",
          relationship: "DISJOINT" as const,
          billable: true,
        },
        {
          measurement_unit: "output_tokens" as const,
          unit_quantity: 1000,
          price_per_quantity: "2",
          relationship: "DISJOINT" as const,
          billable: true,
        },
        {
          measurement_unit: "reasoning_tokens" as const,
          unit_quantity: 1000,
          price_per_quantity: "2",
          relationship: "INCLUDED" as const,
          billable: false,
        },
      ],
    };
    const c = flightUsageCommand(f.a, result, report, schedule, {
      id: randomUUID(),
      request_id: randomUUID(),
      at,
    });
    expect(c.row.cost_nanos).toBe("37500000");
    expect(c.row.cost_quality).toBe("ESTIMATED");
    expect(c.row.usage_quality).toBe("ACTUAL_REPORTED");
    expect(
      flightUsageCommand(
        f.a,
        result,
        report,
        { ...schedule, billing_applicability: "UNRESOLVED" },
        { id: randomUUID(), request_id: randomUUID(), at },
      ).row,
    ).toMatchObject({
      cost_nanos: null,
      cost_quality: "UNKNOWN",
      usage_quality: "ACTUAL_REPORTED",
    });
    expect(c.row.input_tokens).toBe(20);
    expect(c.row.output_tokens).toBe(10);
    expect(c.row.provider_request_id).toBe("safe-id");
    expect(c.row.currency).toBe("USD");
    const replay = { id: randomUUID(), request_id: randomUUID(), at };
    expect(flightUsageCommand(f.a, result, report, schedule, replay)).toEqual(
      flightUsageCommand(f.a, result, report, schedule, replay),
    );
    expect(
      flightUsageCommand(
        f.a,
        { ...result, status: "FAILED", error: "SEMANTIC_INVALID" },
        report,
        schedule,
        replay,
      ).row,
    ).toMatchObject({
      cost_nanos: "37500000",
      cost_quality: "ESTIMATED",
      usage_quality: "ACTUAL_REPORTED",
      status: "FAILED",
    });
    expect(() =>
      flightUsageCommand(f.a, result, report, { ...schedule, id: randomUUID() }, replay),
    ).toThrow("POLICY_BLOCKED");

    expect(
      flightUsageCommand(
        f.a,
        {
          ...result,
          usage: { ...result.usage, usage_quality: "UNKNOWN", input_tokens: null },
        },
        report,
        schedule,
        { id: randomUUID(), request_id: randomUUID(), at },
      ).row,
    ).toMatchObject({ cost_nanos: null, cost_quality: "UNKNOWN", input_tokens: null });
    const facts = flightOperationalFacts(
      f.descriptor,
      result,
      { fields: 4, supported: 2, missing: 1, contradictory: 1 },
      { changes: 2, decision: "DEFER", cp13a: "PENDING" },
    );
    expect(JSON.stringify(facts)).not.toContain("output");
    expect(JSON.stringify(facts)).not.toContain(f.a.account_id);
    expect(persistenceDigest(facts)).toMatch(/^[a-f0-9]{64}$/);
  });
});
