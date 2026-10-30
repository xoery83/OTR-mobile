import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { validateGuestAdoptionCancellationReceipt } from "../../src/domain/auth/guestAdoptionReceipt";
import {
  guestAdoptionStatusRequestSchema,
  type GuestAdoptionStatusRequest,
} from "../../src/domain/auth/guestAdoptionStatus";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import type { AuthenticatedUser } from "./app";
import { isNormalAccount } from "./authAccountQualification";

export type GuestAdoptionCancelPort = {
  cancel(
    actorAccountId: string,
    request: GuestAdoptionStatusRequest,
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

// Default closed and unmounted; only existing JWT middleware may supply user.
export async function guestAdoptionCancelBoundary(
  request: Request,
  user: AuthenticatedUser,
  port?: GuestAdoptionCancelPort,
) {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/auth/guest-adoptions/cancel")
    return failure(404, "GUEST_ADOPTION_NOT_FOUND");
  if (url.search) return failure(400, "GUEST_ADOPTION_CANCEL_INVALID");
  if (request.method !== "POST") return failure(405, "GUEST_ADOPTION_METHOD_NOT_ALLOWED");
  const actor = coreUuid.safeParse(user.id);
  if (!actor.success) return failure(401, "AUTHENTICATION_REQUIRED");
  if (!isNormalAccount(user)) return failure(403, "NORMAL_ACCOUNT_REQUIRED");
  const actorAccountId = actor.data;
  if (!port) return failure(503, "GUEST_ADOPTION_CANCEL_CLOSED");
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    const raw = await readBoundedJson(new Response(request.body), 8192, boundary);
    const parsed = guestAdoptionStatusRequestSchema.safeParse(raw);
    if (!parsed.success) return failure(400, "GUEST_ADOPTION_CANCEL_INVALID");
    const input = parsed.data;
    if (request.headers.get("Idempotency-Key") !== input.adoptionId)
      return failure(400, "GUEST_ADOPTION_CANCEL_INVALID");
    if (input.targetAccountId !== actorAccountId)
      return failure(403, "GUEST_ADOPTION_TARGET_MISMATCH");
    const rawReceipt = await boundary.run(() =>
      port.cancel(actorAccountId, structuredClone(input), boundary.signal),
    );

    const receipt = await boundary.run(() =>
      validateGuestAdoptionCancellationReceipt(rawReceipt, input, tripCoreSha256Hex),
    );
    if (new TextEncoder().encode(JSON.stringify(receipt)).byteLength > 1048576)
      return failure(503, "GUEST_ADOPTION_CANCEL_UNVERIFIED");
    boundary.assertCurrent();
    return reply(200, receipt);
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      if (error.code === "REQUEST_TIMEOUT")
        return failure(504, "GUEST_ADOPTION_CANCEL_TIMEOUT");
      if (error.code === "REQUEST_CANCELED") return failure(499, "REQUEST_CANCELED");
      return failure(
        error.code === "BODY_LIMIT" ? 413 : 400,
        "GUEST_ADOPTION_CANCEL_INVALID",
      );
    }
    return failure(
      503,
      error instanceof Error && error.message === "GUEST_ADOPTION_CANCEL_OUTCOME_UNKNOWN"
        ? "GUEST_ADOPTION_CANCEL_OUTCOME_UNKNOWN"
        : "GUEST_ADOPTION_CANCEL_UNAVAILABLE",
    );
  } finally {
    boundary.close();
  }
}
