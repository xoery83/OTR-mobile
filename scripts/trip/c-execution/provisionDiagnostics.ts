/** Finite metadata only: never retain response bodies, messages, credentials or arbitrary headers. */
const codes = new Set([
  "bad_jwt",
  "not_admin",
  "unexpected_failure",
  "validation_failed",
  "email_exists",
  "user_already_exists",
  "email_address_invalid",
  "email_address_not_authorized",
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "weak_password",
  "signup_disabled",
  "request_timeout",
  "hook_timeout",
  "hook_timeout_after_retry",
]);
export type ProvisionDiagnostic = {
  attempt: number;
  outcome: "DISPATCHED_OUTCOME_UNKNOWN" | "HTTP_RESPONSE" | "TRANSPORT_EXCEPTION";
  httpStatus: number | null;
  category:
    | "UNKNOWN"
    | "AUTH_REJECTED"
    | "VALIDATION_REJECTED"
    | "RATE_LIMITED"
    | "SERVER_ERROR"
    | "HTTP_SUCCESS"
    | "TRANSPORT_FAILURE";
  providerRequestId: string | null;
  sdkCode: string | null;
};
export async function fetchProvisionWithReceipt(
  request: Request,
  receipt: ProvisionDiagnostic,
  transport: typeof fetch = fetch,
): Promise<Response> {
  try {
    const response = await transport(request);
    receipt.outcome = "HTTP_RESPONSE";
    receipt.httpStatus = response.status;
    receipt.category =
      response.status >= 200 && response.status < 300
        ? "HTTP_SUCCESS"
        : [401, 403].includes(response.status)
          ? "AUTH_REJECTED"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status >= 500
              ? "SERVER_ERROR"
              : response.status >= 400
                ? "VALIDATION_REJECTED"
                : "UNKNOWN";
    for (const header of ["sb-request-id", "x-request-id"]) {
      const value = response.headers.get(header);
      if (
        value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ) {
        receipt.providerRequestId = value;
        break;
      }
    }
    return response;
  } catch {
    receipt.outcome = "TRANSPORT_EXCEPTION";
    receipt.category = "TRANSPORT_FAILURE";
    throw new Error("C_AUTH_TRANSPORT_OUTCOME_UNKNOWN");
  }
}
export function retainProvisionSdkCode(
  receipt: ProvisionDiagnostic | undefined,
  error: unknown,
) {
  if (!receipt || !error || typeof error !== "object") return;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && codes.has(code)) receipt.sdkCode = code;
}
export function reserveProvisionDispatch(
  attemptedEmails: Set<string>,
  email: string,
  diagnostics: ProvisionDiagnostic[],
): ProvisionDiagnostic {
  if (attemptedEmails.size >= 2 || attemptedEmails.has(email))
    throw new Error("C_PROVISION_RETRY_OR_BUDGET_FORBIDDEN");
  attemptedEmails.add(email);
  const receipt: ProvisionDiagnostic = {
    attempt: attemptedEmails.size,
    outcome: "DISPATCHED_OUTCOME_UNKNOWN",
    httpStatus: null,
    category: "UNKNOWN",
    providerRequestId: null,
    sdkCode: null,
  };
  diagnostics.push(receipt);
  return receipt;
}
