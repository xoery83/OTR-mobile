// Fixed metadata only: never return an exception message, stack, URL, headers or arbitrary native fields.
const safeNames = [
  "TypeError",
  "Error",
  "AbortError",
  "FetchError",
  "FetchException",
  "FetchUnknownException",
  "FetchRequestCanceledException",
  "FetchRedirectException",
] as const;
export type SafeFetchName = (typeof safeNames)[number];
export type NativeFetchDiagnostic = {
  errorName?: SafeFetchName;
  thrownType: "STRING" | "OBJECT" | "OTHER";
  fetchClass:
    | "REDIRECT_DISALLOWED"
    | "TLS"
    | "NETWORK"
    | "INVALID_INIT"
    | "ABORTED"
    | "UNCLASSIFIED";
  nativeDomain?: "NSURLErrorDomain";
  nativeCode?: number;
};
function field(value: unknown, name: string): unknown {
  try {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)[name]
      : undefined;
  } catch {
    return undefined;
  }
}
const urlCodes = new Set([
  -999, -1000, -1001, -1002, -1003, -1004, -1005, -1006, -1007, -1008, -1009, -1011,
  -1012, -1013, -1014, -1015, -1016, -1017, -1018, -1019, -1020, -1021, -1022, -1200,
  -1201, -1202, -1203, -1204, -1205, -1206,
]);
export function nativeFetchDiagnostic(error: unknown): NativeFetchDiagnostic {
  const result: NativeFetchDiagnostic = {
    thrownType:
      typeof error === "string"
        ? "STRING"
        : error !== null && typeof error === "object"
          ? "OBJECT"
          : "OTHER",
    fetchClass: "UNCLASSIFIED",
  };
  const cause = field(error, "cause");
  for (const value of [error, cause, field(cause, "cause")]) {
    const name = field(value, "name");
    if (!result.errorName && safeNames.includes(name as SafeFetchName))
      result.errorName = name as SafeFetchName;
    const raw = typeof value === "string" ? value : field(value, "message");
    const text = typeof raw === "string" ? raw.slice(0, 8192) : "";
    const domain = field(value, "domain"),
      code = field(value, "code");
    const parsed = text.match(/\bNSURLErrorDomain\s+Code=(-\d{3,4})\b/);
    const nativeCode =
      domain === "NSURLErrorDomain" && typeof code === "number"
        ? code
        : parsed
          ? Number(parsed[1])
          : undefined;
    if (nativeCode !== undefined && urlCodes.has(nativeCode)) {
      result.nativeDomain = "NSURLErrorDomain";
      result.nativeCode = nativeCode;
      result.fetchClass =
        (nativeCode <= -1200 && nativeCode >= -1206) || nativeCode === -1022
          ? "TLS"
          : nativeCode === -999
            ? "ABORTED"
            : [-1000, -1002].includes(nativeCode)
              ? "INVALID_INIT"
              : "NETWORK";
    }
    if (
      text.includes("Redirect is not allowed when redirect mode is 'error'") ||
      name === "FetchRedirectException"
    )
      result.fetchClass = "REDIRECT_DISALLOWED";
    else if (
      text.includes("Unsupported BodyInit type") ||
      (text.includes("Cannot cast") &&
        ["field 'redirect'", "field 'method'", "NativeRequestInit"].some((marker) =>
          text.includes(marker),
        ))
    )
      result.fetchClass = "INVALID_INIT";
    else if (
      text.includes("The operation was aborted.") ||
      text.includes("Fetch request has been canceled") ||
      name === "FetchRequestCanceledException" ||
      name === "AbortError"
    )
      result.fetchClass = "ABORTED";
    else if (
      text.includes("An SSL error has occurred") ||
      text.includes("The certificate for this server is invalid")
    )
      result.fetchClass = "TLS";
    else if (
      text.includes("The Internet connection appears to be offline") ||
      text.includes("A server with the specified hostname could not be found") ||
      text.includes("The network connection was lost")
    )
      result.fetchClass = "NETWORK";
  }
  return result;
}
