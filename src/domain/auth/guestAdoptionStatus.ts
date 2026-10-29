import { z } from "zod";
import { coreUuid } from "../trip/tripCoreV2";

const binding = {
  contractVersion: z.literal(1),
  adoptionId: coreUuid,
  sourceGuestLocalId: coreUuid,
  targetAccountId: coreUuid,
  inventorySha256: z.string().regex(/^[0-9a-f]{64}$/),
};
export const guestAdoptionStatusRequestSchema = z.strictObject(binding);
const pointer = z.strictObject({
  receiptId: coreUuid,
  receiptSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const guestAdoptionStatusResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...binding,
    status: z.literal("IN_PROGRESS"),
    nextAction: z.literal("QUERY_SERVER_STATUS"),
  }),
  z.strictObject({
    ...binding,
    status: z.literal("NOT_FOUND"),
    nextAction: z.literal("QUERY_SERVER_STATUS"),
  }),
  z.strictObject({
    ...binding,
    status: z.literal("PUBLISHED"),
    nextAction: z.literal("READ_PUBLICATION_RECEIPT"),
    receipt: pointer,
  }),
  z.strictObject({
    ...binding,
    status: z.literal("CANCELLED"),
    nextAction: z.literal("READ_CANCELLATION_RECEIPT"),
    receipt: pointer,
  }),
]);
export type GuestAdoptionStatusRequest = z.infer<typeof guestAdoptionStatusRequestSchema>;
