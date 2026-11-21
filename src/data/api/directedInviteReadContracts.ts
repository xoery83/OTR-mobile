import { z } from "zod";
import { coreText, coreUuid } from "@/domain/trip/tripCoreV2";

// Isolated reader candidate, not an installed authority or a public Account directory.
export const directedInviteRecipientsSchema = z
  .strictObject({
    version: z.literal(1),
    accountId: coreUuid,
    tripId: coreUuid,
    recipients: z
      .array(
        z.strictObject({
          accountId: coreUuid,
          // Only an already authorized co-travel/shared label, never another Account's private Global Profile.
          displayName: coreText(256).nullable(),
        }),
      )
      .max(100),
  })
  .superRefine((value, ctx) => {
    const ids = value.recipients.map((r) => r.accountId);
    if (new Set(ids).size !== ids.length || ids.includes(value.accountId))
      ctx.addIssue({ code: "custom" });
  });

export const directedInvitationDetailSchema = z.strictObject({
  version: z.literal(1),
  accountId: coreUuid,
  invitation: z.strictObject({
    inviteId: coreUuid,
    tripId: coreUuid,
    personId: coreUuid,
    tripName: coreText(256),
    personName: coreText(256),
    status: z.enum(["PENDING", "CLAIMED", "REVOKED", "EXPIRED"]),
    expiresAt: z.iso.datetime({ offset: true }),
  }),
});

// References only: the owning reader filters current pending invitations for this Account.
export const directedIncomingInvitationsSchema = z
  .strictObject({
    version: z.literal(1),
    accountId: coreUuid,
    invitations: z
      .array(z.strictObject({ tripId: coreUuid, inviteId: coreUuid }))
      .max(100),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.invitations.map((item) => item.inviteId)).size !==
      value.invitations.length
    )
      ctx.addIssue({ code: "custom" });
  });
