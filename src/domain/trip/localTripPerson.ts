import { z } from "zod";
import { coreText, coreUuid } from "./tripCoreV2";

export const localPersonCreateKind = "TRIP_PERSON_CREATE";
export const localPersonCreateSchema = z.strictObject({
  version: z.literal(1),
  operationId: coreUuid,
  personId: coreUuid,
  tripId: coreUuid,
  accountId: coreUuid,
  tripCreateOperationId: coreUuid,
  displayName: coreText(256).refine(
    (value) => value.trim() === value && value.length > 0,
  ),
});
export type LocalPersonCreate = z.infer<typeof localPersonCreateSchema>;

export const localPersonNameSlotSchema = z.strictObject({
  operationId: coreUuid,
  personId: coreUuid,
  displayName: coreText(256),
});
export type LocalPersonNameSlot = z.infer<typeof localPersonNameSlotSchema>;
