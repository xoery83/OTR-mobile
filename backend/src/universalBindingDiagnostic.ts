// Finite diagnostic values only; never forward messages, SQL, identities or object names.
export function universalBindingDiagnostic(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as { name?: unknown; message?: unknown; code?: unknown })
      : {};
  return {
    kind:
      ["Error", "TypeError", "ZodError", "AbortError", "TimeoutError"].find(
        (kind) => kind === value.name,
      ) ?? "UNKNOWN",
    code:
      [
        "SOURCE_ACCESS_DENIED",
        "UNIVERSAL_AUTH_REJECTED",
        "UNIVERSAL_BINDING_SCOPE",
        "UNIVERSAL_SOURCE_CLOSED",
        "UNIVERSAL_CONTINUOUS_CLOSED",
        "CORE_CONNECTION_BUSY",
        "CORE_CONNECTION_TIMEOUT",
        "CORE_CONNECTION_RETIRED",
        "CORE_PRINCIPAL_UNAVAILABLE",
        "CORE_TRANSACTION_UNFINISHED",
      ].find((code) => code === value.message) ??
      (value.message === "Query read timeout" ? "PG_QUERY_TIMEOUT" : "UNKNOWN"),
    sqlState: [
      "42501",
      "25P03",
      "57014",
      "55P03",
      "53300",
      "40001",
      "40P01",
      "28P01",
      "28000",
      "42703",
      "42883",
      "42P01",
      "08001",
      "08006",
    ].find((state) => state === value.code),
  };
}
