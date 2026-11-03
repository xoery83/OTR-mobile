import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";
import {
  executeMemberClaim,
  memberClaimCommandSchema,
  type MemberClaimAuthorityPort,
} from "./tripMemberClaimAuthority";
import { recoverMemberClaimReceipt } from "./tripMemberClaimRecovery";

const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
const failure = (status: number, code: string) => reply(status, { error: { code } });
function reportUnavailable(stage: "PORT_SELECTION" | "OWNING_AUTHORITY") {
  try {
    console.info(
      JSON.stringify({
        event: "member_claim_unavailable",
        stage,
        code:
          stage === "PORT_SELECTION" ? "MEMBER_CLAIM_CLOSED" : "MEMBER_CLAIM_UNAVAILABLE",
      }),
    );
  } catch {
    /* Diagnostics must not replace the original response. */
  }
}

// Unmounted candidate. The host must authenticate the bearer using its existing gateway.
export async function tripMemberClaimBoundary(
  request: Request,
  user: AuthenticatedAccount,
  port?: MemberClaimAuthorityPort,
) {
  if (!isNormalAccount(user)) return failure(403, "MEMBER_NORMAL_ACCOUNT_REQUIRED");
  const url = new URL(request.url);
  const path = /^\/v2\/trips\/([^/]+)\/member-claim-operations(\/recovery)?$/.exec(
    url.pathname,
  );
  const trip = coreUuid.safeParse(path?.[1]);
  if (!path || !trip.success || url.search) return failure(400, "MEMBER_CLAIM_INVALID");
  if (request.method !== "POST") return failure(405, "METHOD_NOT_ALLOWED");
  if (!port) {
    reportUnavailable("PORT_SELECTION");
    return failure(503, "MEMBER_CLAIM_CLOSED");
  }
  const boundary = createRequestBoundary(15000, request.signal);
  let raw: unknown;
  try {
    raw = await readBoundedJson(new Response(request.body), 8192, boundary);
  } catch {
    return failure(400, "MEMBER_CLAIM_INVALID");
  } finally {
    boundary.close();
  }
  const command = memberClaimCommandSchema.safeParse(raw);
  if (
    !command.success ||
    command.data.tripId !== trip.data ||
    request.headers.get("Idempotency-Key") !== command.data.operationId
  )
    return failure(400, "MEMBER_CLAIM_INVALID");
  if (request.signal.aborted) return failure(503, "MEMBER_CLAIM_UNAVAILABLE");
  // A claimant may have no Trip access yet; the owning transaction authorizes the exact invite.
  const result = path[2]
    ? await recoverMemberClaimReceipt(command.data, user.id, port)
    : await executeMemberClaim(command.data, user.id, port);
  if (result.status === "UNAVAILABLE") reportUnavailable("OWNING_AUTHORITY");
  const status =
    result.status === "INVALID"
      ? 400
      : result.status === "UNAVAILABLE"
        ? 503
        : result.status === "DENIED"
          ? 403
          : result.status === "CONFLICT"
            ? 409
            : result.status === "ABSENT_UNCONFIRMED"
              ? 202
              : result.status === "ISSUED" && !path[2]
                ? 201
                : 200;
  return reply(status, result);
}
