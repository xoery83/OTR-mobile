import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { ClaimResolutionScope } from "./claimResolutionContracts";

const time = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const generalInviteIssueSchema = z.strictObject({
  operationId: coreUuid, expiresAt: time.nullable(), maxUses: z.number().int().min(1).max(2147483647).nullable(),
});
export const generalInviteReceiptSchema = z.strictObject({
  receiptVersion: z.literal(3), operationId: coreUuid, actorAccountId: coreUuid, tripId: coreUuid, inviteId: coreUuid,
  intentDigest: digest, sourceFingerprint: digest, purpose: z.literal("PERSON_CLAIM"), outcome: z.literal("GENERAL_INVITE_ISSUED"),
  expiresAt: time, maxUses: generalInviteIssueSchema.shape.maxUses, acceptedAt: time,
});
export const generalInviteResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("RECORDED"), receipt: generalInviteReceiptSchema }),
  z.strictObject({ status: z.literal("CONFLICT") }), z.strictObject({ status: z.literal("DENIED") }),
  z.strictObject({ status: z.literal("CLOSED") }), z.strictObject({ status: z.literal("UNAVAILABLE") }),
]);
export const generalInviteRecoverySchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("FOUND"), receipt: generalInviteReceiptSchema }),
  z.strictObject({ status: z.literal("ABSENT_UNCONFIRMED") }), z.strictObject({ status: z.literal("CONFLICT") }),
  z.strictObject({ status: z.literal("CLOSED") }), z.strictObject({ status: z.literal("UNAVAILABLE") }),
]);
export const generalInviteDeliverySchema = z.strictObject({
  accountId: coreUuid, tripId: coreUuid, operationId: coreUuid, inviteId: coreUuid, token: z.string().min(1), expiresAt: time,
});
export type GeneralInviteIssue = z.infer<typeof generalInviteIssueSchema>;
export function generalInviteReceiptForOriginal(scope: ClaimResolutionScope, original: GeneralInviteIssue, raw: unknown) {
  const receipt = generalInviteReceiptSchema.parse(raw);
  if (receipt.actorAccountId !== scope.actorAccountId || receipt.tripId !== scope.tripId || receipt.operationId !== original.operationId ||
      receipt.maxUses !== original.maxUses || (original.expiresAt !== null && Date.parse(receipt.expiresAt) !== Date.parse(original.expiresAt)))
    throw Error("GENERAL_INVITE_RECEIPT_BINDING");
  return receipt;
}
export interface GeneralInviteAuthority {
  issue(scope: ClaimResolutionScope, input: GeneralInviteIssue): Promise<z.infer<typeof generalInviteResultSchema>>;
  recover(scope: ClaimResolutionScope, operationId: string): Promise<z.infer<typeof generalInviteRecoverySchema>>;
  delivery(scope: ClaimResolutionScope, operationId: string): Promise<z.infer<typeof generalInviteDeliverySchema> | null>;
}
