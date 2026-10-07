import { persistenceDigest } from "./externalIntegrationPersistence";
import type {
  createFlightPrivateCustody,
  FlightStoreIdentity,
} from "./flightPrivateCustody";
import { parseDeepSeekFlightResponse } from "./deepSeekFlight";
import { assertAccountRequestGeneration } from "../../src/data/auth/accountRequestContext";
import { rebindFlightRemoteOutput } from "../../src/domain/intelligence/remoteFlightText";
import { z } from "zod";
import type { createFlightDevExecutor } from "./flightDevDispatch";
import {
  type createClosedPersistenceGateway,
  verifiedCallContextSchema,
} from "./externalIntegrationPersistence";

export const FLIGHT_MODEL_CONFORMANCE = Object.freeze({
  version: "deepseek-flash-live0-20261007-v1",
  requested_model: "deepseek-flash",
  expected_family: "DeepSeek-V4.1-Flash",
  // Exact returned identifiers only. This witnesses an alias, not immutable weights.
  accepted_returned_models: Object.freeze(["deepseek-flash", "DeepSeek-V4.1-Flash"]),
  source: "https://api-docs.deepseek.com/api/create-chat-completion/",
  requires_live1_official_revalidation: true,
});
export const acceptanceSchema = z.strictObject({
  session_id: z.uuid(),
  account_id: z.uuid(),
  task_id: z.uuid(),
  attempt_id: z.uuid(),
  call_id: z.uuid(),
  request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type FlightAcceptance = z.infer<typeof acceptanceSchema>;
export type FlightEnvironment = (key: string) => string | undefined;
const callGateway = "otr_external_integration_call_gateway";
export const validateHost = (raw: unknown, account: string) => {
  const h = verifiedCallContextSchema.parse(raw);
  if (
    h.verified_environment !== "DEV" ||
    h.principal_kind !== "TRUSTED_WORKLOAD" ||
    h.gateway_identity !== callGateway ||
    h.verified_account_id !== account ||
    h.verified_actor_id !== account ||
    !h.auth_session_reference ||
    h.revoked ||
    Date.parse(h.expires_at) <= Date.now() ||
    Date.parse(h.verified_at) > Date.now()
  )
    throw new Error("LIVE_HOST_CLOSED");
  return h;
};

type ExecutorDeps = Parameters<typeof createFlightDevExecutor>[0];
type GatewayDeps = Parameters<typeof createClosedPersistenceGateway>[0];
// Issuer and exact dedicated SQL connector are provisioned trusted host dependencies.
// No credentials/session, synthetic verifier or service-role fallback is supplied here.
export type FlightLiveProvisioning = {
  custody: {
    identity: FlightStoreIdentity;
    requiredRequest: {
      accountId: string;
      reference: string;
      sha256: string;
      byteCount: number;
    };
  };
  verify: GatewayDeps["verify"];
  session: {
    identity(): Promise<{
      session_user: string;
      environment: "DEV";
      primary: true;
      session_reference: string;
    }>;
    execute: GatewayDeps["execute"];
  };
  workflow: Pick<
    ExecutorDeps,
    "repo" | "load" | "readStart" | "interpret" | "appendMeter"
  >;
};

// Shared witness/recovery logic contains no credential/transport/capability constructor.
export function flightModelWitness(model: unknown) {
  const returned =
    typeof model === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(model) ? model : null;
  return {
    policy: FLIGHT_MODEL_CONFORMANCE.version,
    returned_model: returned,
    accepted:
      returned !== null &&
      FLIGHT_MODEL_CONFORMANCE.accepted_returned_models.includes(returned),
  };
}
type RecoveryState = {
  factory: ReturnType<typeof createFlightDevExecutor>;
  stores: Awaited<ReturnType<typeof createFlightPrivateCustody>>;
  provisioning: FlightLiveProvisioning;
  acceptance: FlightAcceptance;
  hash(bytes: Uint8Array): Promise<string>;
};
export async function recoverFlightRaw(
  state: RecoveryState,
  context: Parameters<RecoveryState["factory"]["recover"]>[0],
) {
  const { factory, stores, provisioning, acceptance, hash } = state;
  const a = await provisioning.workflow.repo.readAttempt(context, acceptance.attempt_id);
  if (await stores.retained.read(a)) return factory.recover(context, a.attempt_id);
  const start = await provisioning.workflow.readStart(a);
  if (
    !start.start_durable ||
    start.call_id !== acceptance.call_id ||
    start.request_sha256 !== acceptance.request_sha256 ||
    !["MAY_HAVE_STARTED", "UNKNOWN", "TERMINAL"].includes(start.dispatch_state)
  )
    throw new Error("OUTBOUND_RECOVERY_REQUIRED");
  const raw = await stores.readRaw(acceptance.account_id, acceptance.call_id);
  const { loaded } = await factory.loadRetainedAttempt(context, a.attempt_id);
  const binding = z
    .object({
      acceptance: acceptanceSchema,
      envelope_sha256: z.string(),
      execution_pins: z.unknown(),
      status: z.number().int().min(100).max(599),
    })
    .parse(raw.binding);
  if (
    loaded.envelope.binding.descriptor.boundary_version !== "otr-flight-remote-v2" ||
    persistenceDigest(binding.acceptance) !== persistenceDigest(acceptance) ||
    binding.envelope_sha256 !== loaded.envelope.envelope_sha256 ||
    persistenceDigest(binding.execution_pins) !==
      persistenceDigest(loaded.envelope.binding.descriptor.remote)
  )
    throw new Error("CUSTODY_INTEGRITY");
  const bytes = await stores.custody.read({ accountId: a.account_id, ...raw.pin });
  await provisioning.workflow.repo.authorizeResultDisclosure(context, a);
  assertAccountRequestGeneration(context);
  let result = parseDeepSeekFlightResponse(
    bytes,
    binding.status,
    null,
    flightModelWitness,
  );
  let interpretation: unknown | null = null;
  if (result.status === "SUCCEEDED") {
    try {
      interpretation = await provisioning.workflow.interpret(
        loaded.request,
        await rebindFlightRemoteOutput(
          result.output,
          loaded.envelope,
          loaded.request,
          hash,
        ),
      );
    } catch {
      result = { ...result, status: "FAILED", error: "SEMANTIC_INVALID" };
    }
  }
  await factory.retainRecoveredResponse(context, a.attempt_id, result, interpretation);
  return factory.recover(context, a.attempt_id);
}
export async function readFlightHostStatus(
  state: Omit<RecoveryState, "hash">,
  context: Parameters<RecoveryState["factory"]["recover"]>[0],
  sent: boolean,
) {
  const { factory, stores, provisioning, acceptance } = state;
  const stored = await factory.recover(context, acceptance.attempt_id);
  const a = await provisioning.workflow.repo.readAttempt(context, acceptance.attempt_id);
  const rawPin = await stores
    .readRaw(acceptance.account_id, acceptance.call_id)
    .catch(() => null);
  await provisioning.workflow.repo.authorizeResultDisclosure(context, a);
  assertAccountRequestGeneration(context);
  return {
    raw_response_sha256: rawPin?.pin.sha256 ?? null,
    raw_response_byte_count: rawPin?.pin.byteCount ?? null,
    call_id: acceptance.call_id,
    attempt_id: acceptance.attempt_id,
    execution_observation: stored.report.execution_observation,
    execution_outcome: stored.report.execution_outcome,
    metering_disposition: stored.report.metering_disposition,
    result_custody_sha256: stored.report.response_material_sha256,
    result_install_disposition: a.result_install_disposition,
    publication_sha256: a.publication_sha256,
    provider_request_id: stored.result.provider_request_id,
    model_witness: stored.result.model_witness
      ? {
          ...stored.result.model_witness,
          returned_model: stored.result.model_witness.accepted
            ? stored.result.model_witness.returned_model
            : null,
        }
      : null,
    safe_failure_class: stored.result.status === "SUCCEEDED" ? null : stored.result.error,
    usage: stored.report.reported_usage_summary,
    send_count_this_process: sent ? 1 : 0,
  };
}
