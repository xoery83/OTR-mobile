import { z } from "zod";
import { coreUuid } from "../trip/tripCoreV2";

export const guestAdoptionResourceCountsSchema = z.strictObject({
  trips: z.number().int().nonnegative().safe(),
  people: z.number().int().nonnegative().safe(),
  items: z.number().int().nonnegative().safe(),
  files: z.number().int().nonnegative().safe(),
  fileBytes: z.number().int().nonnegative().safe(),
  liveDrafts: z.number().int().nonnegative().safe(),
});
const binding = {
  contractVersion: z.literal(1),
  adoptionId: coreUuid,
  sourceGuestLocalId: coreUuid,
  targetAccountId: coreUuid,
  inventorySha256: z.string().regex(/^[0-9a-f]{64}$/),
  resources: guestAdoptionResourceCountsSchema,
};
export const guestAdoptionPreflightRequestSchema = z.strictObject(binding);
export const guestAdoptionPreflightGrantSchema = z.strictObject({
  ...binding,
  status: z.literal("GRANTED"),
  grantId: coreUuid,
  policyVersion: z.string().min(1).max(128),
  expiresAt: z.iso.datetime(),
});
export type GuestAdoptionPreflightRequest = z.infer<
  typeof guestAdoptionPreflightRequestSchema
>;
export type GuestAdoptionPreflightGrant = z.infer<
  typeof guestAdoptionPreflightGrantSchema
>;
