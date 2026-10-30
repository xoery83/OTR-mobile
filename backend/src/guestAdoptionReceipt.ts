import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  guestAdoptionReceiptRequestSchema,
  validateGuestAdoptionReceipt,
  type GuestAdoptionReceiptRequest,
} from "../../src/domain/auth/guestAdoptionReceipt";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import type { AuthenticatedUser } from "./app";
import { isNormalAccount } from "./authAccountQualification";

export type GuestAdoptionReceiptPort = {
  readReceipt(
    actorAccountId: string,
    request: GuestAdoptionReceiptRequest,
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
export async function guestAdoptionReceiptBoundary(
  request: Request,
  user: AuthenticatedUser,
  port?: GuestAdoptionReceiptPort,
) {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/auth/guest-adoptions/receipt")
    return failure(404, "GUEST_ADOPTION_NOT_FOUND");
  if (url.search) return failure(400, "GUEST_ADOPTION_RECEIPT_INVALID");
  if (request.method !== "POST") return failure(405, "GUEST_ADOPTION_METHOD_NOT_ALLOWED");
  const actor = coreUuid.safeParse(user.id);
  if (!actor.success) return failure(401, "AUTHENTICATION_REQUIRED");
  if (!isNormalAccount(user)) return failure(403, "NORMAL_ACCOUNT_REQUIRED");
  const actorAccountId = actor.data;
  if (!port) return failure(503, "GUEST_ADOPTION_RECEIPT_CLOSED");
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    const raw = await readBoundedJson(new Response(request.body), 8192, boundary);
    const parsed = guestAdoptionReceiptRequestSchema.safeParse(raw);
    if (!parsed.success) return failure(400, "GUEST_ADOPTION_RECEIPT_INVALID");
    const input = parsed.data;
    if (input.targetAccountId !== actorAccountId)
      return failure(403, "GUEST_ADOPTION_TARGET_MISMATCH");
    const rawReceipt = await boundary.run(() =>
      port.readReceipt(actorAccountId, structuredClone(input), boundary.signal),
    );
    const { receiptId, receiptSha256, ...expected } = input;
    const receipt = await boundary.run(() =>
      validateGuestAdoptionReceipt(rawReceipt, expected, tripCoreSha256Hex),
    );
    if (receipt.receiptId !== receiptId || receipt.receiptSha256 !== receiptSha256)
      return failure(503, "GUEST_ADOPTION_RECEIPT_UNVERIFIED");
    if (new TextEncoder().encode(JSON.stringify(receipt)).byteLength > 1048576)
      return failure(503, "GUEST_ADOPTION_RECEIPT_UNVERIFIED");
    boundary.assertCurrent();
    return reply(200, receipt);
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      if (error.code === "REQUEST_TIMEOUT")
        return failure(504, "GUEST_ADOPTION_RECEIPT_TIMEOUT");
      if (error.code === "REQUEST_CANCELED") return failure(499, "REQUEST_CANCELED");
      return failure(
        error.code === "BODY_LIMIT" ? 413 : 400,
        "GUEST_ADOPTION_RECEIPT_INVALID",
      );
    }
    return failure(503, "GUEST_ADOPTION_RECEIPT_UNAVAILABLE");
  } finally {
    boundary.close();
  }
}
