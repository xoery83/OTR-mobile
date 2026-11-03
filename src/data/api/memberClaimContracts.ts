import { z } from "zod";
import { coreUuid } from "../../domain/trip/tripCoreV2";

export const memberClaimTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("REGISTERED_ACCOUNT"), accountId: coreUuid }),
  z.strictObject({ kind: z.literal("UNREGISTERED_PERSON") }),
]);
export const memberClaimCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ISSUE_TARGETED_INVITE"),
    operationId: coreUuid,
    tripId: coreUuid,
    personId: coreUuid,
    target: memberClaimTargetSchema,
  }),
  z.strictObject({
    kind: z.literal("CLAIM_PERSON"),
    operationId: coreUuid,
    tripId: coreUuid,
    personId: coreUuid,
    inviteId: coreUuid,
    explicitConsent: z.literal(true),
  }),
  z.strictObject({
    kind: z.literal("REVOKE_UNCLAIMED_INVITE"),
    operationId: coreUuid,
    tripId: coreUuid,
    personId: coreUuid,
    inviteId: coreUuid,
  }),
]);
export type MemberClaimCommand = z.infer<typeof memberClaimCommandSchema>;

export const memberClaimOutcomeSchema = z.strictObject({
  status: z.enum(["ISSUED", "LINKED", "ALREADY_LINKED", "INVITE_REVOKED"]),
  personId: coreUuid,
  inviteId: coreUuid,
  currentAccess: z.enum(["NONE", "READ", "COLLABORATE", "ORGANIZER"]),
});
export const memberClaimRecoverySchema = z.union([
  memberClaimOutcomeSchema,
  z.strictObject({ status: z.literal("ABSENT_UNCONFIRMED") }),
]);
