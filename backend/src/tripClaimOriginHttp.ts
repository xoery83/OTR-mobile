import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { claimOriginVerificationInputSchema, claimOriginVerificationSchema, claimGeneralInitialPersonsInputSchema, claimGeneralInitialPersonsSchema, type ClaimOriginAuthority } from "../../src/data/api/claimOriginContracts";
import { createRequestBoundary, readBoundedJson } from "../../src/data/api/requestBoundary";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";

const response = (status: number, body: unknown) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
});
const failure = (status: number, code: string) => response(status, { error: { code } });

// Normal-Auth boundary. Never log, echo, checkpoint or receipt the presented bearer.
export async function tripClaimOriginBoundary(request: Request, user: AuthenticatedAccount, authority?: ClaimOriginAuthority) {
  if (!isNormalAccount(user)) return failure(403, "CLAIM_ORIGIN_NORMAL_ACCOUNT_REQUIRED");
  const url = new URL(request.url);
  const people = /^\/v2\/trips\/([^/]+)\/claim-origins\/([^/]+)\/requests\/([^/]+)\/people$/.exec(url.pathname);
  if (people) {
    const trip = coreUuid.safeParse(people[1]);
    const input = claimGeneralInitialPersonsInputSchema.safeParse({ inviteId: people[2], requestId: people[3], afterPersonId: url.searchParams.get("after") });
    if (!trip.success || !input.success || [...url.searchParams.keys()].some(k => k !== "after") || url.searchParams.getAll("after").length > 1)
      return failure(400, "CLAIM_ORIGIN_INVALID");
    if (request.method !== "GET") return failure(405, "METHOD_NOT_ALLOWED");
    if (!authority?.initialPersons) return failure(503, "CLAIM_ORIGIN_CLOSED");
    try {
      if (request.signal.aborted) return failure(503, "CLAIM_ORIGIN_UNAVAILABLE");
      const value = claimGeneralInitialPersonsSchema.nullable().parse(await authority.initialPersons({ actorAccountId: user.id, tripId: trip.data }, input.data));
      if (request.signal.aborted) return failure(503, "CLAIM_ORIGIN_UNAVAILABLE");
      if (!value) return failure(404, "CLAIM_ORIGIN_NOT_VISIBLE");
      if (value.accountId !== user.id || value.tripId !== trip.data || value.inviteId !== input.data.inviteId || value.requestId !== input.data.requestId ||
          value.persons.some((p, i) => (input.data.afterPersonId !== null && p.personId <= input.data.afterPersonId) || (i > 0 && p.personId <= value.persons[i - 1].personId)))
        return failure(503, "CLAIM_ORIGIN_UNAVAILABLE");
      return response(200, value);
    } catch { return failure(503, "CLAIM_ORIGIN_UNAVAILABLE"); }
  }
  const path = /^\/v2\/trips\/([^/]+)\/claim-origins\/verify$/.exec(url.pathname);
  const trip = coreUuid.safeParse(path?.[1]);
  if (!path || !trip.success || url.search) return failure(400, "CLAIM_ORIGIN_INVALID");
  if (request.method !== "POST") return failure(405, "METHOD_NOT_ALLOWED");
  if (!authority) return failure(503, "CLAIM_ORIGIN_CLOSED");
  if (request.signal.aborted) return failure(503, "CLAIM_ORIGIN_UNAVAILABLE");
  const boundary = createRequestBoundary(15000, request.signal);
  let raw: unknown;
  try { raw = await readBoundedJson(new Response(request.body), 8192, boundary); }
  catch { return failure(400, "CLAIM_ORIGIN_INVALID"); }
  finally { boundary.close(); }
  const input = claimOriginVerificationInputSchema.safeParse(raw);
  if (!input.success) return failure(400, "CLAIM_ORIGIN_INVALID");
  try {
    const result = claimOriginVerificationSchema.nullable().safeParse(await authority.verify({ actorAccountId: user.id, tripId: trip.data }, input.data));
    if (request.signal.aborted || !result.success) return failure(503, "CLAIM_ORIGIN_UNAVAILABLE");
    if (!result.data) return failure(403, "CLAIM_ORIGIN_NOT_VERIFIED");
    const value = result.data;
    if (value.accountId !== user.id || value.tripId !== trip.data || value.requestId !== input.data.requestId || value.inviteId !== input.data.inviteId)
      return failure(503, "CLAIM_ORIGIN_UNAVAILABLE");
    // This confirms only a request-bound invitation source, not a membership, role or Item grant.
    return response(200, value);
  } catch { return failure(503, "CLAIM_ORIGIN_UNAVAILABLE"); }
}
