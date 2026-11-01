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
