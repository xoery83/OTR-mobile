import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
const id = z.uuid(),
  label = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  digest = z.string().regex(/^[a-f0-9]{64}$/);
export const verifiedCallContextSchema = z.strictObject({
  version: z.literal(1),
  principal_kind: z.enum([
    "OTR_USER",
    "OTR_ADMIN",
    "EXTERNAL_CLIENT",
    "TRUSTED_WORKLOAD",
  ]),
  verified_actor_id: id,
  verified_client_identity: id.nullable(),
  verified_external_subject: z
    .strictObject({ issuer_namespace: label, subject_digest: digest })
    .nullable(),
  verified_account_id: id.nullable(),
  verified_environment: z.enum(["TEST", "DEV", "PRODUCTION"]),
  auth_source: label,
  auth_config_version: z.number().int().positive().safe(),
  auth_session_reference: z
    .string()
    .regex(/^vault:[A-Za-z0-9/_-]{1,128}$/)
    .nullable(),
  verified_at: z.iso.datetime(),
  expires_at: z.iso.datetime(),
  revoked: z.boolean(),
  request_id: id,
  request_sha256: digest,
  command_kind: label,
  gateway_identity: z.enum([
    "otr_external_integration_admin_gateway",
    "otr_external_integration_call_gateway",
    "otr_external_integration_inbound_gateway",
    "otr_external_integration_reporting_gateway",
    "otr_external_integration_recovery_gateway",
  ]),
});
export type VerifiedCallContextV1 = z.infer<typeof verifiedCallContextSchema>;
export const protectedCommands = [
  "flight_activation_runtime",
  "flight_activation_select",
  "flight_activation_account_grant",
  "flight_activation_reserve_call",
  "external_integration_configure",
  "external_integration_set_kill",
  "intelligence_provider_config_append",
  "external_integration_price_append",
  "external_integration_health_observe",
  "external_integration_reserve_call",
  "external_integration_mark_dispatch",
  "external_integration_usage_append",
  "external_integration_observe_call",
  "external_client_authorize_grant",
  "external_client_revoke_grant",
  "inbound_ai_reserve_package",
  "inbound_ai_attach_material",
  "inbound_ai_reserve_invocation",
  "inbound_ai_complete_invocation",
  "inbound_ai_reserve_review",
  "inbound_ai_observe_review",
  "inbound_ai_status",
  "external_integration_admin_report",
  "external_integration_recover_exact",
] as const;
export type ProtectedCommand = (typeof protectedCommands)[number];
const canonical = (value: unknown) => canonicalEventJson(value as Json);
export const persistenceDigest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const commandDigest = (command: Record<string, unknown>) => {
  const { request_sha256: _, ...body } = command;
  void _;
  return persistenceDigest({ domain: "otr-cp14-command-v1", command: body });
};
// Injectable trusted verifier and fixed dedicated SQL connection. No credential resolver or live factory.
export function createClosedPersistenceGateway(deps: {
  gatewayIdentity: VerifiedCallContextV1["gateway_identity"];
  verify(request: {
    requestId: string;
    requestSha256: string;
    environment: VerifiedCallContextV1["verified_environment"];
    command: ProtectedCommand;
  }): Promise<VerifiedCallContextV1 | null>;
  // Trusted future custody assertion, outside SQL transactions; never a caller auth flag.
  verifyCustody?(
    context: Readonly<VerifiedCallContextV1>,
    material: {
      reservationId: string;
      packageId: string;
      reference: string;
      sha256: string;
      admissionSha256: string | null;
    },
  ): Promise<boolean>;
  execute(
    command: ProtectedCommand,
    context: VerifiedCallContextV1,
    body: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  now(): string;
}) {
  return {
    async invoke(kind: ProtectedCommand, raw: Record<string, unknown>) {
      if (!protectedCommands.includes(kind)) throw new Error("CP14_COMMAND_FORBIDDEN");
      // Snapshot BEFORE async verification; callers cannot mutate the command after request binding.
      const command = structuredClone(raw);
      for (const key of Object.keys(command))
        if (
          key.startsWith("verified_") ||
          key.startsWith("auth_") ||
          ["context", "verified", "trusted", "gateway_identity"].includes(key)
        )
          throw new Error("CP14_CALLER_AUTH_FORBIDDEN");
      const request = z
        .strictObject({
          version: z.literal(1),
          request_id: id,
          request_sha256: digest,
          environment: z.enum(["TEST", "DEV", "PRODUCTION"]),
        })
        .parse({
          version: command.version,
          request_id: command.request_id,
          request_sha256: command.request_sha256,
          environment: command.environment,
        });
      if (commandDigest(command) !== request.request_sha256)
        throw new Error("CP14_REQUEST_DIGEST");
      const verified = await deps.verify({
        requestId: request.request_id,
        requestSha256: request.request_sha256,
        environment: request.environment,
        command: kind,
      });
      if (!verified) throw new Error("CP14_VERIFIER_UNAVAILABLE");
      const context = verifiedCallContextSchema.parse(verified);
      if (
        context.gateway_identity !== deps.gatewayIdentity ||
        context.command_kind !== kind ||
        context.request_id !== request.request_id ||
        context.request_sha256 !== request.request_sha256 ||
        context.verified_environment !== request.environment ||
        context.revoked ||
        Date.parse(context.expires_at) <= Date.parse(deps.now()) ||
        Date.parse(context.verified_at) > Date.parse(deps.now())
      )
        throw new Error("CP14_CONTEXT_FORBIDDEN");
      for (const [field, bound] of [
        ["actor_id", context.verified_actor_id],
        ["account_id", context.verified_account_id],
        ["client_identity_id", context.verified_client_identity],
      ] as const)
        if (Object.hasOwn(command, field) && command[field] !== bound)
          throw new Error("CP14_SCOPE_FORBIDDEN");
      if (kind === "inbound_ai_attach_material" || kind === "inbound_ai_reserve_review") {
        const review =
          kind === "inbound_ai_reserve_review"
            ? z.record(z.string(), z.unknown()).parse(command.row)
            : null;
        const material = z
          .strictObject({
            reservationId: id,
            packageId: id,
            reference: id,
            sha256: digest,
            admissionSha256: digest.nullable(),
          })
          .parse({
            reservationId: review?.reservation_id ?? command.reservation_id,
            packageId: command.package_id,
            reference: review?.review_material_reference ?? command.material_reference,
            sha256: review?.review_material_sha256 ?? command.material_sha256,
            admissionSha256:
              kind === "inbound_ai_attach_material"
                ? command.material_admission_sha256
                : null,
          });
        if (
          !deps.verifyCustody ||
          !(await deps.verifyCustody(Object.freeze(context), Object.freeze(material)))
        )
          throw new Error("CP14_CUSTODY_UNAVAILABLE");
      }
      return deps.execute(kind, Object.freeze(context), Object.freeze(command));
    },
  };
}
// Future custody implementations must enforce these pins before accepting or returning bytes.
// This validator creates no store, bucket, route or device bridge.
export const custodyPinSchema = z.strictObject({
  accountId: id,
  reservationId: id,
  sha256: digest,
  byteCount: z.number().int().positive().safe().max(4194304),
});
export function assertCustodyPayload(
  raw: z.infer<typeof custodyPinSchema>,
  bytes: Uint8Array,
) {
  const pin = custodyPinSchema.parse(raw);
  if (
    bytes.byteLength !== pin.byteCount ||
    createHash("sha256").update(bytes).digest("hex") !== pin.sha256
  )
    throw new Error("CP14_CUSTODY_INTEGRITY");
  return Object.freeze(pin);
}
export type PrivateMaterialCustody = {
  put(input: {
    accountId: string;
    reservationId: string;
    sha256: string;
    byteCount: number;
    bytes: Uint8Array;
  }): Promise<{ reference: string }>;
  verify(input: {
    accountId: string;
    reference: string;
    sha256: string;
    byteCount: number;
  }): Promise<boolean>;
  read(input: {
    accountId: string;
    reference: string;
    sha256: string;
    byteCount: number;
  }): Promise<Uint8Array>;
  release(input: {
    accountId: string;
    reference: string;
    responsibilityClosureSha256: string;
  }): Promise<void>;
};
export const callCorrelationSchema = z.strictObject({
  account_id: id,
  task_id: id,
  attempt_id: id,
  attempt_sequence: z.number().int().positive().safe(),
  call_id: id,
  integration_id: label,
  request_id: id,
  request_sha256: digest,
  configuration_sha256: digest,
  config_version: z.number().int().positive().safe(),
  provider_config_id: id.nullable(),
  input_sha256: digest,
  schema_sha256: digest,
  publication_fence: z.number().int().positive().safe(),
  fallback_chain_id: id,
  shadow: z.boolean(),
  shadow_of_call_id: id.nullable(),
});
export type CallCorrelation = z.infer<typeof callCorrelationSchema>;
export function verifyCallCorrelation(
  local: {
    account_id: string;
    task_id: string;
    attempt_id: string;
    attempt_sequence: number;
    usage_correlation_id: string | null;
    integration_id: string | null;
    request_id: string;
    request_sha256: string;
    configuration_sha256: string | null;
    config_version: string | null;
    provider_config_id: string | null;
    fallback_chain_id: string;
    shadow: boolean;
  },
  raw: CallCorrelation,
) {
  const server = callCorrelationSchema.parse(raw);
  for (const key of [
    "account_id",
    "task_id",
    "attempt_id",
    "attempt_sequence",
    "integration_id",
    "request_id",
    "request_sha256",
    "configuration_sha256",
    "fallback_chain_id",
    "shadow",
  ] as const)
    if (local[key] !== server[key]) throw new Error("CP14_CORRELATION_MISMATCH");
  if (
    local.config_version !== String(server.config_version) ||
    local.provider_config_id !== server.provider_config_id
  )
    throw new Error("CP14_CONFIG_CORRELATION");
  if (local.usage_correlation_id !== server.call_id)
    throw new Error("CP14_CALL_MISMATCH");
  return server;
}
export function verifyPublicationCorrelation(
  task: {
    task_id: string;
    account_id: string;
    input_sha256: string;
    schema_sha256: string;
    publication_fence: number;
  },
  attempt: Parameters<typeof verifyCallCorrelation>[0] & {
    task_publication_fence: number;
    response_sha256: string | null;
  },
  call: CallCorrelation,
  observations: readonly {
    call_id: string;
    response_sha256: string | null;
    publication_sha256: string | null;
  }[],
  publication: { result_sha256: string; publication_sha256: string },
) {
  const verified = verifyCallCorrelation(attempt, call);
  if (
    task.task_id !== verified.task_id ||
    task.account_id !== verified.account_id ||
    task.input_sha256 !== verified.input_sha256 ||
    task.schema_sha256 !== verified.schema_sha256 ||
    task.publication_fence !== verified.publication_fence ||
    attempt.task_publication_fence !== verified.publication_fence ||
    attempt.shadow ||
    attempt.response_sha256 !== publication.result_sha256
  )
    throw new Error("CP14_PUBLICATION_CORRELATION");
  for (const observation of observations)
    if (
      observation.call_id !== verified.call_id ||
      (observation.response_sha256 !== null &&
        observation.response_sha256 !== publication.result_sha256) ||
      (observation.publication_sha256 !== null &&
        observation.publication_sha256 !== publication.publication_sha256)
    )
      throw new Error("CP14_USAGE_CORRELATION");
  return verified;
}
// Exact rational pricing, one final ceiling; no binary floating point, FX or historical repricing.
export function calculateScheduledCost(
  units: readonly {
    quantity: bigint | null;
    quantityPerRate: bigint;
    rate: string;
    relationship: "DISJOINT" | "INCLUDED" | "AMBIGUOUS";
    billable: boolean;
  }[],
): string | null {
  let numerator = 0n,
    denominator = 1n;
  const gcd = (a: bigint, b: bigint): bigint => {
    while (b) {
      [a, b] = [b, a % b];
    }
    return a;
  };
  for (const u of units) {
    if (u.relationship === "AMBIGUOUS" || (u.billable && u.quantity === null))
      return null;
    if (!u.billable || u.relationship === "INCLUDED") continue;
    if (
      u.quantity === null ||
      u.quantity < 0n ||
      u.quantityPerRate <= 0n ||
      !/^\d+(?:\.\d{1,18})?$/.test(u.rate)
    )
      throw new Error("CP14_PRICE_INVALID");
    const [whole, fraction = ""] = u.rate.split("."),
      scale = 10n ** BigInt(fraction.length),
      rate = BigInt(whole) * scale + BigInt(fraction || "0");
    const d = u.quantityPerRate * scale;
    numerator = numerator * d + u.quantity * rate * denominator;
    denominator *= d;
    const g = gcd(numerator, denominator);
    numerator /= g;
    denominator /= g;
  }
  return ((numerator + denominator - 1n) / denominator).toString();
}
