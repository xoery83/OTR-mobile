import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  guestAdoptionPreflightRequestSchema,
  guestAdoptionPreflightGrantSchema,
} from "../../src/domain/auth/guestAdoptionPreflight";
import { validateGuestAdoptionReceipt } from "../../src/domain/auth/guestAdoptionReceipt";
import {
  guestAdoptionStageRequestSchema,
  guestAdoptionStageResultSchema,
  guestAdoptionPublicationRequestSchema,
  guestAdoptionTargetConfirmationHeader,
} from "../../src/data/api/guestAdoptionContracts";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";
import {
  guestAdoptionPreflightBoundary,
  type GuestAdoptionPreflightPort,
} from "./guestAdoptionPreflight";
import { guestAdoptionStatusBoundary } from "./guestAdoptionStatus";
import { guestAdoptionReceiptBoundary } from "./guestAdoptionReceipt";
import { guestAdoptionCancelBoundary } from "./guestAdoptionCancel";
import { createGuestAdoptionTerminalPg } from "./guestAdoptionTerminalPg";
import { stageGuestAdoptionComposite } from "./guestAdoptionCompositeStage";
import { publishGuestAdoptionPg } from "./guestAdoptionPublicationPg";
import {
  withCorePgStorageTransaction,
  type CorePgConnection,
} from "./tripCoreV2PgStorage";
import type { z } from "zod";

type StageRequest = z.infer<typeof guestAdoptionStageRequestSchema>;
type PublicationRequest = z.infer<typeof guestAdoptionPublicationRequestSchema>;
export type GuestAdoptionHttpPorts = ReturnType<typeof createGuestAdoptionTerminalPg> &
  GuestAdoptionPreflightPort & {
    stage(
      user: AuthenticatedAccount,
      request: StageRequest,
      signal: AbortSignal,
    ): Promise<unknown>;
    publish(
      user: AuthenticatedAccount,
      request: PublicationRequest,
      signal: AbortSignal,
    ): Promise<unknown>;
  };
const paths = new Set(["preflight", "stage", "publish", "status", "receipt", "cancel"]);
export function guestAdoptionBodyLimit(pathname: string) {
  const match = /^\/v1\/auth\/guest-adoptions\/([^/]+)$/.exec(pathname);
  return match && paths.has(match[1]) ? (match[1] === "stage" ? 1048576 : 8192) : null;
}
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

// Only the existing verified JWT middleware may pass user. No mount by default.
export async function guestAdoptionHttpBoundary(
  request: Request,
  user: AuthenticatedAccount,
  ports?: GuestAdoptionHttpPorts,
): Promise<Response | null> {
  const url = new URL(request.url),
    maximum = guestAdoptionBodyLimit(url.pathname);
  if (maximum === null) return null;
  const route = url.pathname.split("/").at(-1)!;
  if (!isNormalAccount(user)) return failure(403, "NORMAL_ACCOUNT_REQUIRED");
  const actor = coreUuid.parse(user.id),
    trusted = Object.freeze({ id: actor, accountClass: "NORMAL_ACCOUNT" as const });
  if (route === "preflight") {
    if (request.headers.get(guestAdoptionTargetConfirmationHeader) !== actor)
      return failure(403, "GUEST_ADOPTION_TARGET_CONFIRMATION_REQUIRED");
    return guestAdoptionPreflightBoundary(request, trusted, ports);
  }
  if (route === "status") return guestAdoptionStatusBoundary(request, trusted, ports);
  if (route === "receipt") return guestAdoptionReceiptBoundary(request, trusted, ports);
  if (route === "cancel") return guestAdoptionCancelBoundary(request, trusted, ports);
  if (url.search) return failure(400, "GUEST_ADOPTION_REQUEST_INVALID");
  if (request.method !== "POST") return failure(405, "GUEST_ADOPTION_METHOD_NOT_ALLOWED");
  if (!ports) return failure(503, "GUEST_ADOPTION_CLOSED");
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    const raw = await readBoundedJson(new Response(request.body), maximum, boundary);
    if (route === "stage") {
      const parsed = guestAdoptionStageRequestSchema.safeParse(raw);
      if (!parsed.success) return failure(400, "GUEST_ADOPTION_REQUEST_INVALID");
      const input = parsed.data,
        g = input.grant;
      if (g.targetAccountId !== actor)
        return failure(403, "GUEST_ADOPTION_TARGET_MISMATCH");
      if (request.headers.get("Idempotency-Key") !== g.adoptionId)
        return failure(400, "GUEST_ADOPTION_REQUEST_INVALID");
      const result = guestAdoptionStageResultSchema.parse(
        await boundary.run(() =>
          ports.stage(trusted, structuredClone(input), boundary.signal),
        ),
      );
      if (
        result.adoptionId !== g.adoptionId ||
        result.sourceGuestLocalId !== g.sourceGuestLocalId ||
        result.targetAccountId !== actor ||
        result.inventorySha256 !== g.inventorySha256 ||
        result.grantId !== g.grantId ||
        result.preparationSha256 !== input.preparation.sha256
      )
        return failure(503, "GUEST_ADOPTION_STAGE_UNVERIFIED");
      boundary.assertCurrent();
      return reply(200, result);
    }
    const parsed = guestAdoptionPublicationRequestSchema.safeParse(raw);
    if (!parsed.success) return failure(400, "GUEST_ADOPTION_REQUEST_INVALID");
    const input = parsed.data;
    if (input.targetAccountId !== actor)
      return failure(403, "GUEST_ADOPTION_TARGET_MISMATCH");
    if (request.headers.get("Idempotency-Key") !== input.adoptionId)
      return failure(400, "GUEST_ADOPTION_REQUEST_INVALID");
    const { planSha256, ...binding } = input;
    const receipt = await boundary.run(async () =>
      validateGuestAdoptionReceipt(
        await ports.publish(trusted, structuredClone(input), boundary.signal),
        binding,
        tripCoreSha256Hex,
      ),
    );
    if (
      receipt.outcome !== "PUBLISHED" ||
      receipt.planSha256 !== planSha256 ||
      new TextEncoder().encode(JSON.stringify(receipt)).byteLength > 1048576
    )
      return failure(503, "GUEST_ADOPTION_PUBLICATION_UNVERIFIED");
    boundary.assertCurrent();
    return reply(200, receipt);
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      if (error.code === "REQUEST_TIMEOUT")
        return failure(504, "GUEST_ADOPTION_REQUEST_TIMEOUT");
      if (error.code === "REQUEST_CANCELED") return failure(499, "REQUEST_CANCELED");
      return failure(
        error.code === "BODY_LIMIT" ? 413 : 400,
        "GUEST_ADOPTION_REQUEST_INVALID",
      );
    }
    const unknown = [
      "GUEST_ADOPTION_STAGE_OUTCOME_UNKNOWN",
      "GUEST_ADOPTION_PUBLICATION_OUTCOME_UNKNOWN",
    ];
    return failure(
      503,
      error instanceof Error && unknown.includes(error.message)
        ? error.message
        : "GUEST_ADOPTION_UNAVAILABLE",
    );
  } finally {
    boundary.close();
  }
}

// Host supplies its EXISTING shared Core connection after the protected Gate.
// This factory reads no credential file, creates no driver or alternate authority.
export function createGuestAdoptionHttpPorts(
  connection: CorePgConnection,
): GuestAdoptionHttpPorts {
  return {
    ...createGuestAdoptionTerminalPg(connection),
    async preflight(actor, raw, signal) {
      const request = guestAdoptionPreflightRequestSchema.parse(raw);
      if (request.targetAccountId !== actor)
        throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
      const current = () => {
        if (signal.aborted) throw Error("REQUEST_CANCELED");
      };
      current();
      return withCorePgStorageTransaction(
        connection,
        tripCoreSha256Hex,
        async (context) => {
          current();
          const grant = guestAdoptionPreflightGrantSchema.parse(
            (
              await context.lease.query(
                "SELECT otr_auth_guest_composite.confirm_and_issue($1::uuid,$2::jsonb,true) AS result",
                [actor, JSON.stringify(request)],
              )
            ).rows[0]?.result,
          );
          current();
          return grant;
        },
      );
    },
    async stage(user, input, signal) {
      const plan = await stageGuestAdoptionComposite(
        connection,
        user,
        { grant: input.grant, preparationSha256: input.preparation.sha256 },
        input.preparation,
        signal,
      );
      const {
        resources: _resources,
        status: _status,
        policyVersion: _policy,
        expiresAt: _expires,
        ...binding
      } = input.grant;
      return {
        ...binding,
        status: "STAGED",
        preparationSha256: input.preparation.sha256,
        planSha256: plan.sha256,
      };
    },
    publish: (user, input, signal) =>
      publishGuestAdoptionPg(connection, user, input, signal),
  };
}
