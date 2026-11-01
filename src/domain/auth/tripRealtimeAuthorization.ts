import { z } from "zod";
import { coreUuid } from "../trip/tripCoreV2";

export const tripRealtimeLeaseSchema = z.strictObject({
  accountId: coreUuid,
  tripId: coreUuid,
  actorPersonId: coreUuid,
  leaseId: coreUuid,
  channel: z.string().min(1).max(256),
  authorizationRevision: z.number().int().nonnegative().safe(),
  expiresAt: z.number().int().positive().safe(),
});
export const tripRealtimeRevocationSchema = z.strictObject({
  accountId: coreUuid,
  tripId: coreUuid,
  receiptId: coreUuid,
  authorizationRevision: z.number().int().nonnegative().safe(),
});
export type TripRealtimeLease = z.infer<typeof tripRealtimeLeaseSchema>;
export type TripRealtimeRevocation = z.infer<typeof tripRealtimeRevocationSchema>;

const realtimeId = coreUuid.refine(
  (id) => id !== "00000000-0000-0000-0000-000000000000",
);
export const tripRealtimeMembershipTransitionSchema = z
  .strictObject({
    receiptId: realtimeId,
    operationId: realtimeId,
    accountId: realtimeId,
    tripId: realtimeId,
    actorPersonId: realtimeId,
    kind: z.enum(["REVOKED", "REGRANTED"]),
    previousGeneration: z.number().int().nonnegative().safe(),
    membershipGeneration: z.number().int().positive().safe(),
  })
  .refine((value) => value.membershipGeneration > value.previousGeneration);
export type TripRealtimeMembershipTransition = z.infer<
  typeof tripRealtimeMembershipTransitionSchema
>;
export const tripRealtimeCommittedTransitionSchema = z.strictObject({
  receipt: tripRealtimeMembershipTransitionSchema,
  receiptState: z.literal("COMMITTED"),
  enforcement: z.enum(["SERVER_GENERATION_FENCE_AND_DISCONNECT", "UNCONFIRMED"]),
});

// Only a trusted server result may reach this boundary; parsing never proves COMMIT.
export function tripRealtimeRevocationFromTransition(
  raw: unknown,
  expected: Pick<TripRealtimeLease, "accountId" | "tripId">,
): TripRealtimeRevocation {
  const { receipt } = tripRealtimeCommittedTransitionSchema.parse(raw);
  if (
    receipt.kind !== "REVOKED" ||
    receipt.accountId !== expected.accountId ||
    receipt.tripId !== expected.tripId
  )
    throw Error("TRIP_REALTIME_TRANSITION_SCOPE_MISMATCH");
  // Both numbers belong to Auth; no Core access revision is converted here.
  return Object.freeze({
    accountId: receipt.accountId,
    tripId: receipt.tripId,
    receiptId: receipt.receiptId,
    authorizationRevision: receipt.membershipGeneration,
  });
}
