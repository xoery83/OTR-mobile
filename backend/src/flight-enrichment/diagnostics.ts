// Fixed operational enums only. Never log an error object, message, stack or request.
const stages = [
  "LOAD_OPT_IN",
  "LOAD_RUNTIME",
  "LOAD_GUARD",
  "LOAD_OPEN",
  "LOAD_PARSE",
  "LOAD_CUSTODY",
  "AVAILABLE_GUARD",
  "AVAILABLE_GATEWAY",
  "AVAILABLE_KEY",
  "AVAILABLE_PORT",
  "GATEWAY_VERIFY",
  "GATEWAY_EXECUTE",
  "SCOPE_AUTH",
  "SCOPE_GATEWAY",
  "SCOPE_PARSE",
] as const;
export type EnrichmentDiagnosticStage = (typeof stages)[number];
const reasons = new Set([
  "ENRICHMENT_RUNTIME_DISABLED",
  "ENRICHMENT_RUNTIME_METADATA",
  "ENRICHMENT_RUNTIME_HASH",
  "ENRICHMENT_RUNTIME_CLOSED",
  "ENRICHMENT_ACCEPTANCE_SCOPE",
  "ENRICHMENT_ACTOR_SCOPE",
  "ENRICHMENT_COMMAND_CLOSED",
  "ENRICHMENT_AUTH_CHANGED",
  "ENRICHMENT_CREDENTIAL_CLOSED",
  "ENRICHMENT_SCOPE_REQUEST",
  "ENRICHMENT_TRIP_ACCESS",
  "ENRICHMENT_SCOPE_CLOSED",
  "ENRICHMENT_ACCOUNT_CLOSED",
  "ENRICHMENT_CONFIG_CLOSED",
  "ENRICHMENT_PROVIDER_CLOSED",
  "ENRICHMENT_PRICE_CLOSED",
  "CP14_CONTEXT_FORBIDDEN",
  "CP14_SCOPE_FORBIDDEN",
  "CP14_REQUEST_DIGEST",
  "CORE_PRINCIPAL_UNAVAILABLE",
  "CORE_CONNECTION_TIMEOUT",
  "CORE_CONNECTION_RETIRED",
  "REQUEST_CANCELED",
]);
const states = new Set([
  "42501",
  "28P01",
  "28000",
  "42883",
  "42P01",
  "42703",
  "42702",
  "P0001",
  "57014",
  "08006",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOENT",
]);
export function reportEnrichmentDiagnostic(
  stage: EnrichmentDiagnosticStage,
  error: unknown,
) {
  // Diagnostics must not change the caller's fail-closed behavior, even for hostile properties/loggers.
  try {
    if (!stages.includes(stage)) return;
    const value = error as { message?: unknown; code?: unknown; name?: unknown } | null;
    const message = value?.message,
      state = value?.code,
      name = value?.name;
    const code =
      typeof message === "string" && reasons.has(message)
        ? message
        : typeof state === "string" && states.has(state)
          ? `STATE_${state}`
          : name === "ZodError"
            ? "SCHEMA_REJECTED"
            : "UNCLASSIFIED";
    console.info(`FLIGHT_ENRICHMENT_DIAGNOSTIC:${stage}:${code}`);
  } catch {
    /* A diagnostic cannot grant capability or disrupt closing. */
  }
}
