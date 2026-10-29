import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import {
  guestAdoptionPreflightRequestSchema,
  guestAdoptionPreflightGrantSchema,
  type GuestAdoptionPreflightRequest,
} from "../../src/domain/auth/guestAdoptionPreflight";
import type { AuthenticatedUser } from "./app";
import { isNormalAccount } from "./authAccountQualification";

export type GuestAdoptionPreflightPort = {
  preflight(
    actorAccountId: string,
    request: GuestAdoptionPreflightRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });
const failure = (status: number, code: string) =>
  reply(status, { error: { code, message: code } });

// Closed candidate: not mounted in app/bootstrap. Only existing JWT middleware supplies user.
export async function guestAdoptionPreflightBoundary(
  request: Request,
  user: AuthenticatedUser,
  port?: GuestAdoptionPreflightPort,
) {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/auth/guest-adoptions/preflight")
    return failure(404, "GUEST_ADOPTION_NOT_FOUND");
  if (url.search) return failure(400, "GUEST_ADOPTION_PREFLIGHT_INVALID");
  if (request.method !== "POST") return failure(405, "GUEST_ADOPTION_METHOD_NOT_ALLOWED");
  const actor = coreUuid.safeParse(user.id);
  if (!actor.success) return failure(401, "AUTHENTICATION_REQUIRED");
  if (!isNormalAccount(user)) return failure(403, "NORMAL_ACCOUNT_REQUIRED");
  const actorAccountId = actor.data;
  if (!port) return failure(503, "GUEST_ADOPTION_PREFLIGHT_CLOSED");
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    const raw = await readBoundedJson(new Response(request.body), 8192, boundary);
    const parsed = guestAdoptionPreflightRequestSchema.safeParse(raw);
    if (
      !parsed.success ||
      request.headers.get("Idempotency-Key") !== parsed.data.adoptionId
    )
      return failure(400, "GUEST_ADOPTION_PREFLIGHT_INVALID");
    const input = parsed.data;
    if (input.targetAccountId !== actorAccountId)
      return failure(403, "GUEST_ADOPTION_TARGET_MISMATCH");
    const result = guestAdoptionPreflightGrantSchema.safeParse(
      await boundary.run(() =>
        port.preflight(actorAccountId, structuredClone(input), boundary.signal),
      ),
    );
    if (!result.success) return failure(503, "GUEST_ADOPTION_PREFLIGHT_UNVERIFIED");
    const grant = result.data;
    if (
      grant.adoptionId !== input.adoptionId ||
      grant.sourceGuestLocalId !== input.sourceGuestLocalId ||
      grant.targetAccountId !== actorAccountId ||
      grant.inventorySha256 !== input.inventorySha256 ||
      canonicalCoreJson(grant.resources as Json) !==
        canonicalCoreJson(input.resources as Json) ||
      Date.parse(grant.expiresAt) <= Date.now()
    )
      return failure(503, "GUEST_ADOPTION_PREFLIGHT_UNVERIFIED");
    boundary.assertCurrent();
    return reply(200, grant);
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      if (error.code === "REQUEST_TIMEOUT")
        return failure(504, "GUEST_ADOPTION_PREFLIGHT_TIMEOUT");
      if (error.code === "REQUEST_CANCELED") return failure(499, "REQUEST_CANCELED");
      return failure(
        error.code === "BODY_LIMIT" ? 413 : 400,
        "GUEST_ADOPTION_PREFLIGHT_INVALID",
      );
    }
    return failure(503, "GUEST_ADOPTION_PREFLIGHT_UNAVAILABLE");
  } finally {
    boundary.close();
  }
}
