import { ZodError } from "zod";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { claimResolutionRequestViewSchema, claimResolutionRequestIndexSchema, claimCreatePersonContextSchema, type ClaimResolutionAuthority } from "../../src/data/api/claimResolutionContracts";
import { claimProvisionalViewSchema } from "../../src/data/api/claimProvisionalContracts";
import {
  createClaimResolutionAdapter,
  ClaimResolutionReadUnavailable,
} from "./tripClaimResolutionAdapter";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";

const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
const failure = (status: number, code: string) => reply(status, { error: { code } });

// Mounted through the existing normal Auth getUser gateway; absent composition remains CLOSED.
export async function tripClaimResolutionBoundary(
  request: Request,
  user: AuthenticatedAccount,
  authority?: ClaimResolutionAuthority,
) {
  if (!isNormalAccount(user))
    return failure(403, "CLAIM_RESOLUTION_NORMAL_ACCOUNT_REQUIRED");
  const url = new URL(request.url);
  const index = /^\/v2\/trips\/([^/]+)\/claim-requests$/.exec(url.pathname);
  if (index) {
    const trip = coreUuid.safeParse(index[1]);
    const cursor = url.searchParams.get("after");
    if (!trip.success || [...url.searchParams.keys()].some(key => key !== "after") ||
        url.searchParams.getAll("after").length > 1 || (cursor !== null && !coreUuid.safeParse(cursor).success))
      return failure(400, "CLAIM_RESOLUTION_INVALID");
    if (request.method !== "GET") return failure(405, "METHOD_NOT_ALLOWED");
    if (!authority?.listRequests) return failure(503, "CLAIM_RESOLUTION_CLOSED");
    if (request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
    try {
      const parsed = claimResolutionRequestIndexSchema.nullable().safeParse(await authority.listRequests({ actorAccountId: user.id, tripId: trip.data }, cursor));
      if (!parsed.success || request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
      if (!parsed.data) return failure(403, "CLAIM_REQUEST_NOT_VISIBLE");
      if (parsed.data.accountId !== user.id || parsed.data.tripId !== trip.data) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
      return reply(200, parsed.data);
    } catch { return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE"); }
  }
  const read = /^\/v2\/trips\/([^/]+)\/claim-requests\/([^/]+)(\/(?:decision-view|create-person-context|provisional))?$/.exec(url.pathname);
  const write = /^\/v2\/trips\/([^/]+)\/claim-request-operations(\/recovery)?$/.exec(
    url.pathname,
  );
  const preview = read?.[2] === "preview" && !read[3];
  const trip = coreUuid.safeParse(read?.[1] ?? write?.[1]);
  const requestId = !preview && read ? coreUuid.safeParse(read[2]) : null;
  if (
    url.search ||
    (!read && !write) ||
    !trip.success ||
    (requestId && !requestId.success)
  )
    return failure(400, "CLAIM_RESOLUTION_INVALID");
  if (request.method !== (read && !preview ? "GET" : "POST"))
    return failure(405, "METHOD_NOT_ALLOWED");
  if (!authority) return failure(503, "CLAIM_RESOLUTION_CLOSED");
  if (request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
  const scope = { actorAccountId: user.id, tripId: trip.data };
  const adapter = createClaimResolutionAdapter(authority);
  try {
    if (read && !preview && requestId?.success) {
      if (read[3] === "/create-person-context" || read[3] === "/provisional") {
        const method = read[3] === "/create-person-context" ? authority.readCreatePersonContext : authority.readProvisionalView;
        if (!method) return failure(503, "CLAIM_RESOLUTION_CLOSED");
        try {
          const raw = await method(scope, requestId.data);
          const value = read[3] === "/create-person-context"
            ? claimCreatePersonContextSchema.nullable().parse(raw) : claimProvisionalViewSchema.nullable().parse(raw);
          if (request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
          if (value && (value.tripId !== scope.tripId || value.requestId !== requestId.data ||
              ("actorAccountId" in value ? value.actorAccountId : value.accountId) !== user.id))
            return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
          return value === null ? failure(404, "CLAIM_REQUEST_NOT_VISIBLE") : reply(200, value);
        } catch { return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE"); }
      }
      if (read[3]) {
        if (!authority.readRequestView) return failure(503, "CLAIM_RESOLUTION_CLOSED");
        const parsed = claimResolutionRequestViewSchema.nullable().safeParse(await authority.readRequestView(scope, requestId.data));
        if (!parsed.success) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
        const value = parsed.data;
        if (request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
        if (value && (value.accountId !== user.id || value.tripId !== trip.data || value.requestId !== requestId.data))
          return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
        return value === null ? failure(404, "CLAIM_REQUEST_NOT_VISIBLE") : reply(200, value);
      }
      const value = await adapter.read(scope, requestId.data);
      if (request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
      return value === null
        ? failure(404, "CLAIM_REQUEST_NOT_VISIBLE")
        : reply(200, value);
    }
    const boundary = createRequestBoundary(15000, request.signal);
    let raw: unknown;
    try {
      raw = await readBoundedJson(new Response(request.body), 8192, boundary);
    } catch {
      return failure(400, "CLAIM_RESOLUTION_INVALID");
    } finally {
      boundary.close();
    }
    if (request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
    if (preview) {
      const value = await adapter.preview(scope, raw);
      if (request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
      return value === null
        ? failure(404, "CLAIM_REQUEST_NOT_VISIBLE")
        : reply(200, value);
    }
    if (
      !raw ||
      typeof raw !== "object" ||
      !("operationId" in raw) ||
      request.headers.get("Idempotency-Key") !== raw.operationId
    )
      return failure(400, "CLAIM_RESOLUTION_INVALID");
    const result = write?.[2]
      ? await adapter.recover(scope, raw)
      : await adapter.execute(scope, raw);
    if (request.signal.aborted) return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
    const status =
      result.status === "CLOSED" || result.status === "UNAVAILABLE"
        ? 503
        : result.status === "DENIED"
          ? 403
          : result.status === "CONFLICT"
            ? 409
            : result.status === "ABSENT_UNCONFIRMED"
              ? 202
              : 200;
    return reply(status, result);
  } catch (error) {
    if (error instanceof ZodError) return failure(400, "CLAIM_RESOLUTION_INVALID");
    if (error instanceof ClaimResolutionReadUnavailable) return failure(503, error.code);
    return failure(503, "CLAIM_RESOLUTION_UNAVAILABLE");
  }
}
