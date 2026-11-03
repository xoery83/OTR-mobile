import {
  reportEnrichmentDiagnostic,
  type EnrichmentDiagnosticStage,
} from "./diagnostics";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { universalFiniteConfigSchema } from "../universalFiniteConfig";
import { createModelTaskPgConnection } from "../tripCoreV2PgConnection";
import { universalPgTransaction } from "../universalPg";
import { createClosedPersistenceGateway } from "../externalIntegrationPersistence";
import { createFlightPrivateCustody } from "../flightPrivateCustody";
import { createFlightHttpsSend } from "../flightHttpsTransport";
import { createConfiguredFlightEnrichmentService } from "./runtime";
import {
  createPersistentFlightEnrichmentPorts,
  flightEnrichmentInputVerifier,
} from "./persistentPorts";
import { registeredFlightEnrichmentProfile as profile } from "./registeredProfile";
import type { TrustedContext } from "./ports";

export const flightEnrichmentRuntimePath = "/run/otr/flight-enrichment-runtime.json";
export const flightEnrichmentRuntimeConfigSchema = z.strictObject({
  version: z.literal(1),
  environment: z.literal("DEV"),
  project: z.literal("tuqigdxrvrerfewsxqgm"),
  integrationId: z.literal("otr-flight-enrichment-v1"),
  accountId: z.uuid(),
  acceptanceTripId: z.uuid(),
  credentialReference: z.literal(profile.credential_reference),
  directory: z.literal("/var/lib/otr/flight-enrichment"),
  identity: universalFiniteConfigSchema.shape.identity,
  pg: universalFiniteConfigSchema.shape.taskPg,
});
const commands = [
  "flight_enrichment_request_claim",
  "flight_enrichment_request_finish",
  "flight_enrichment_runtime_scope",
  "flight_enrichment_reserve_step",
  "flight_enrichment_mark_dispatch",
  "flight_enrichment_step_receipt",
  "external_integration_usage_append",
  "external_integration_observe_call",
] as const;
const settlement = new Set<string>([
  "flight_enrichment_request_finish",
  "flight_enrichment_step_receipt",
  "external_integration_usage_append",
  "external_integration_observe_call",
]);

// Normal request Auth supplies the context; the private mount supplies only workload SQL/custody configuration.
export async function loadDevFlightEnrichmentRuntime(
  env: Record<string, string | undefined>,
) {
  if (env.OTR_DEV_FLIGHT_ENRICHMENT_HOST !== "enabled") {
    reportEnrichmentDiagnostic("LOAD_OPT_IN", Error("ENRICHMENT_RUNTIME_DISABLED"));
    return undefined;
  }
  if (
    env.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
    env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
  ) {
    reportEnrichmentDiagnostic("LOAD_GUARD", Error("ENRICHMENT_RUNTIME_CLOSED"));
    throw Error("ENRICHMENT_RUNTIME_CLOSED");
  }
  let file;
  try {
    file = await open(
      flightEnrichmentRuntimePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    reportEnrichmentDiagnostic("LOAD_OPEN", error);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw Error("ENRICHMENT_RUNTIME_CLOSED");
  }
  let config: z.infer<typeof flightEnrichmentRuntimeConfigSchema>;
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 999 ||
      (stat.mode & 0o777) !== 0o440 ||
      stat.nlink !== 1 ||
      stat.size > 65536
    )
      throw Error("ENRICHMENT_RUNTIME_METADATA");
    const body = await file.readFile("utf8");
    if (
      Buffer.byteLength(body) > 65536 ||
      createHash("sha256").update(body).digest("hex") !==
        env.OTR_DEV_FLIGHT_ENRICHMENT_RUNTIME_SHA256
    )
      throw Error("ENRICHMENT_RUNTIME_HASH");
    config = flightEnrichmentRuntimeConfigSchema.parse(JSON.parse(body));
  } catch (error) {
    reportEnrichmentDiagnostic("LOAD_PARSE", error);
    throw Error("ENRICHMENT_RUNTIME_CLOSED");
  } finally {
    await file.close();
  }
  const stores = await createFlightPrivateCustody(
    config.directory,
    config.identity,
  ).catch((error) => {
    reportEnrichmentDiagnostic("LOAD_CUSTODY", error);
    throw error;
  });
  let closed = false;
  const configHash = env.OTR_DEV_FLIGHT_ENRICHMENT_RUNTIME_SHA256;
  const guard = () => {
    if (
      closed ||
      env.OTR_DEV_FLIGHT_ENRICHMENT_HOST !== "enabled" ||
      env.OTR_DEV_FLIGHT_ENRICHMENT_RUNTIME_SHA256 !== configHash ||
      env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
      env.OTR_DEV_BACKEND_NETWORK_MODE !== "host"
    )
      throw Error("ENRICHMENT_RUNTIME_CLOSED");
  };
  const gateways = new WeakMap<
    TrustedContext,
    ReturnType<typeof createClosedPersistenceGateway>
  >();
  function gateway(context: TrustedContext) {
    if (
      context.accountId !== config.accountId ||
      context.actorId !== config.accountId ||
      context.tripId !== config.acceptanceTripId
    )
      throw Error("ENRICHMENT_ACCEPTANCE_SCOPE");
    let value = gateways.get(context);
    if (value) return value;
    const actor = z.uuid().parse(context.actorId),
      account = z.uuid().parse(context.accountId);
    const trip = z.uuid().parse(context.tripId);
    if (actor !== account) throw Error("ENRICHMENT_ACTOR_SCOPE");
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    const authReference = `vault:otr/dev/enrichment-request/${randomUUID()}`;
    const connection = createModelTaskPgConnection(config.pg);
    value = createClosedPersistenceGateway({
      gatewayIdentity: "otr_external_integration_call_gateway",
      now: () => new Date().toISOString(),
      verifyEnrichmentInput: flightEnrichmentInputVerifier(stores.custody),
      async verify(request) {
        try {
          if (
            !commands.includes(request.command as (typeof commands)[number]) ||
            request.environment !== "DEV" ||
            Date.now() >= Date.parse(expiresAt)
          )
            throw Error("ENRICHMENT_COMMAND_CLOSED");
          // Only already-admitted costs/results may settle after request cancellation; SQL proves the historical child binding.
          if (!settlement.has(request.command)) {
            guard();
            await context.assertCurrent();
          }
          if (
            context.accountId !== account ||
            context.actorId !== actor ||
            context.tripId !== trip
          )
            throw Error("ENRICHMENT_AUTH_CHANGED");
          return {
            version: 1,
            principal_kind: "TRUSTED_WORKLOAD",
            verified_actor_id: actor,
            verified_account_id: account,
            verified_client_identity: null,
            verified_external_subject: null,
            verified_environment: "DEV",
            auth_source: "SUPABASE_DEV_USER",
            auth_config_version: 1,
            auth_session_reference: authReference,
            verified_at: new Date().toISOString(),
            expires_at: expiresAt,
            revoked: false,
            request_id: request.requestId,
            request_sha256: request.requestSha256,
            command_kind: request.command,
            gateway_identity: "otr_external_integration_call_gateway",
          };
        } catch (error) {
          reportEnrichmentDiagnostic("GATEWAY_VERIFY", error);
          throw error;
        }
      },
      async execute(kind, verified, command) {
        if (!commands.includes(kind as (typeof commands)[number]))
          throw Error("ENRICHMENT_COMMAND_CLOSED");
        if (!settlement.has(kind)) guard();
        return universalPgTransaction(
          connection,
          async (lease) =>
            (
              await lease.query(`SELECT public.${kind}($1::jsonb,$2::jsonb) AS value`, [
                JSON.stringify(verified),
                JSON.stringify(command),
              ])
            ).rows[0]?.value,
        ).catch((error) => {
          reportEnrichmentDiagnostic("GATEWAY_EXECUTE", error);
          throw error;
        });
      },
    });
    gateways.set(context, value);
    return value;
  }
  const ports = createPersistentFlightEnrichmentPorts({
    gateway,
    stores,
    now: () => new Date().toISOString(),
    async resolveCredential(reference, context) {
      guard();
      gateway(context);
      await context.assertCurrent();
      if (reference !== config.credentialReference)
        throw Error("ENRICHMENT_CREDENTIAL_SCOPE");
      const secret = env.OTR_DEV_DEEPSEEK_API_KEY;
      if (!secret || !/^[\x21-\x7e]{1,4096}$/.test(secret))
        throw Error("ENRICHMENT_CREDENTIAL_CLOSED");
      return {
        reference,
        value: secret,
        async assertCurrent() {
          guard();
          if (env.OTR_DEV_DEEPSEEK_API_KEY !== secret)
            throw Error("ENRICHMENT_CREDENTIAL_CHANGED");
        },
      };
    },
  });
  const service = createConfiguredFlightEnrichmentService({
    gateway,
    ...ports,
    send: createFlightHttpsSend(fetch, "FLIGHT_ENRICHMENT_V1"),
  });
  return {
    service,
    async available(context: TrustedContext) {
      let stage: EnrichmentDiagnosticStage = "AVAILABLE_GUARD";
      try {
        guard();
        stage = "AVAILABLE_GATEWAY";
        gateway(context);
        stage = "AVAILABLE_KEY";
        if (
          !env.OTR_DEV_DEEPSEEK_API_KEY ||
          !/^[\x21-\x7e]{1,4096}$/.test(env.OTR_DEV_DEEPSEEK_API_KEY)
        ) {
          reportEnrichmentDiagnostic(
            "AVAILABLE_KEY",
            Error("ENRICHMENT_CREDENTIAL_CLOSED"),
          );
          return false;
        }
        stage = "AVAILABLE_PORT";
        return await ports.available(context);
      } catch (error) {
        reportEnrichmentDiagnostic(stage, error);
        return false;
      }
    },
    async close() {
      closed = true;
      await stores.close();
    },
  };
}
