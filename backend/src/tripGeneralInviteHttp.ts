import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { createRequestBoundary, readBoundedJson } from "../../src/data/api/requestBoundary";
import { generalInviteIssueSchema, generalInviteResultSchema, generalInviteRecoverySchema, generalInviteDeliverySchema,
  generalInviteReceiptForOriginal, type GeneralInviteAuthority } from "../../src/data/api/generalInviteContracts";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";
const response = (status: number, body: unknown) => Response.json(body, { status,
  headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
const failure = (status: number, code: string) => response(status, { error: { code } });

// Delivery is an explicit sensitive read, distinct from original-operation recovery and acceptance.
export async function tripGeneralInviteBoundary(request: Request, user: AuthenticatedAccount, authority?: GeneralInviteAuthority) {
  if (!isNormalAccount(user)) return failure(403, "GENERAL_INVITE_NORMAL_ACCOUNT_REQUIRED");
  const url = new URL(request.url), path = /^\/v2\/trips\/([^/]+)\/general-invite-operations(?:\/(recovery|delivery))?$/.exec(url.pathname);
  const trip = coreUuid.safeParse(path?.[1]);
  if (!path || !trip.success || url.search) return failure(400, "GENERAL_INVITE_INVALID");
  if (request.method !== "POST") return failure(405, "METHOD_NOT_ALLOWED");
  if (!authority) return path[2] === "delivery" ? failure(503, "GENERAL_INVITE_CLOSED") : response(503, { status: "CLOSED" });
  const scope = { actorAccountId: user.id, tripId: trip.data };
  const boundary = createRequestBoundary(15000, request.signal);
  let raw: unknown;
  try { raw = await readBoundedJson(new Response(request.body), 8192, boundary); }
  catch { return failure(400, "GENERAL_INVITE_INVALID"); }
  finally { boundary.close(); }
  const parsed = (path[2] ? z.strictObject({ operationId: coreUuid }) : generalInviteIssueSchema).safeParse(raw);
  if (!parsed.success || request.headers.get("Idempotency-Key") !== parsed.data.operationId) return failure(400, "GENERAL_INVITE_INVALID");
  try {
    if (request.signal.aborted) return failure(503, "GENERAL_INVITE_UNAVAILABLE");
    if (path[2] === "delivery") {
      const value = generalInviteDeliverySchema.nullable().parse(await authority.delivery(scope, parsed.data.operationId));
      if (request.signal.aborted) return failure(503, "GENERAL_INVITE_UNAVAILABLE");
      if (!value) return failure(403, "GENERAL_INVITE_NOT_DELIVERABLE");
      if (value.accountId !== user.id || value.tripId !== trip.data || value.operationId !== parsed.data.operationId)
        return failure(503, "GENERAL_INVITE_UNAVAILABLE");
      return response(200, value);
    }
    if (path[2] === "recovery") {
      const value = generalInviteRecoverySchema.parse(await authority.recover(scope, parsed.data.operationId));
      if (request.signal.aborted) return response(503, { status: "UNAVAILABLE" });
      if (value.status === "FOUND" && (value.receipt.actorAccountId !== user.id || value.receipt.tripId !== trip.data || value.receipt.operationId !== parsed.data.operationId))
        return response(503, { status: "UNAVAILABLE" });
      return response(value.status === "FOUND" ? 200 : value.status === "CONFLICT" ? 409 : value.status === "ABSENT_UNCONFIRMED" ? 202 : 503, value);
    }
    const input = generalInviteIssueSchema.parse(parsed.data), value = generalInviteResultSchema.parse(await authority.issue(scope, input));
    if (request.signal.aborted) return response(503, { status: "UNAVAILABLE" });
    if (value.status === "RECORDED") generalInviteReceiptForOriginal(scope, input, value.receipt);
    return response(value.status === "RECORDED" ? 200 : value.status === "DENIED" ? 403 : value.status === "CONFLICT" ? 409 : 503, value);
  } catch { return path[2] === "delivery" ? failure(503, "GENERAL_INVITE_UNAVAILABLE") : response(503, { status: "UNAVAILABLE" }); }
}
