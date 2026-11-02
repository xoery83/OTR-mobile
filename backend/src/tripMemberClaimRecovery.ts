import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  memberClaimCommandSchema,
  memberClaimIntentDigest,
  type MemberClaimAuthorityPort,
  type MemberClaimResult,
} from "./tripMemberClaimAuthority";

const receiptSchema = z.strictObject({
  tripId: coreUuid,
  actorAccountId: coreUuid,
  operationId: coreUuid,
  personId: coreUuid,
  intentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  outcome: z.enum(["ISSUED", "LINKED", "ALREADY_LINKED", "INVITE_REVOKED"]),
  inviteId: coreUuid,
});
const accessSchema = z.enum(["NONE", "READ", "COLLABORATE", "ORGANIZER"]);
export {
  receiptSchema as memberClaimReceiptSchema,
  accessSchema as memberClaimAccessSchema,
};

// Dormant recovery only: no route/permission install, command replay or new identity.
export async function recoverMemberClaimReceipt(
  originalCommand: unknown,
  authenticatedActorAccountId: string,
  port?: MemberClaimAuthorityPort,
): Promise<MemberClaimResult | { status: "ABSENT_UNCONFIRMED" }> {
  const parsed = memberClaimCommandSchema.safeParse(originalCommand);
  if (!parsed.success || !coreUuid.safeParse(authenticatedActorAccountId).success)
    return { status: "INVALID" };
  if (!port) return { status: "UNAVAILABLE" };
  const command = parsed.data;
  try {
    return await port.atomic(
      { tripId: command.tripId, actorAccountId: authenticatedActorAccountId },
      async (tx) => {
        const access = accessSchema.safeParse(
          await tx.currentEffectiveAccess(authenticatedActorAccountId),
        );
        if (!access.success) return { status: "UNAVAILABLE" };
        const raw = await tx.receipt(command.operationId);
        // Absence is an observation, never permission to allocate/replay another operation.
        if (raw === null) return { status: "ABSENT_UNCONFIRMED" };
        const receipt = receiptSchema.safeParse(raw);
        if (!receipt.success) return { status: "UNAVAILABLE" };
        const prior = receipt.data;
        if (
          prior.tripId !== command.tripId ||
          prior.actorAccountId !== authenticatedActorAccountId ||
          prior.operationId !== command.operationId ||
          prior.personId !== command.personId ||
          prior.intentDigest !== memberClaimIntentDigest(command) ||
          (command.kind !== "ISSUE_TARGETED_INVITE" &&
            prior.inviteId !== command.inviteId)
        )
          return { status: "CONFLICT" };
        const compatible =
          command.kind === "ISSUE_TARGETED_INVITE"
            ? prior.outcome === "ISSUED"
            : command.kind === "REVOKE_UNCLAIMED_INVITE"
              ? prior.outcome === "INVITE_REVOKED"
              : prior.outcome === "LINKED" || prior.outcome === "ALREADY_LINKED";
        if (!compatible) return { status: "UNAVAILABLE" };
        return {
          status: prior.outcome,
          personId: prior.personId,
          inviteId: prior.inviteId,
          currentAccess: access.data,
        };
      },
    );
  } catch {
    return { status: "UNAVAILABLE" };
  }
}
