import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import {
  createFlightDevExecutor,
  flightReservationCommand,
  flightRemoteRequestMaterial,
} from "../flightDevDispatch";
import { fixtureHash, remoteFixture } from "./flightRemote";
import {
  createClosedPersistenceGateway,
  verifiedCallContextSchema,
} from "../externalIntegrationPersistence";
import {
  attemptSchema,
  type Attempt,
} from "../../../src/domain/intelligence/persistence";
import {
  assertAccountRequestGeneration,
  captureAccountRequestContext,
} from "../../../src/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "../../../src/data/auth/accountGeneration";
const h = "a".repeat(64),
  at = "2026-10-07T00:00:00Z";
export async function flightExecutorFixture(
  mode = "success",
  text?: string,
  override?: Awaited<ReturnType<typeof remoteFixture>>,
) {
  const f = override ?? (await remoteFixture(text));
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
    deps,
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
