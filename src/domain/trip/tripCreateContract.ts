import { z } from "zod";
import { coreUuid } from "./tripCoreV2";
import { validateCalendarDate } from "./dayReadModel";

const calendar = z.string().refine((value) => {
  try {
    validateCalendarDate(value);
    return true;
  } catch {
    return false;
  }
});
export const tripCreateRequestSchema = z
  .strictObject({
    operationId: coreUuid,
    tripId: coreUuid,
    name: z.string().trim().min(1).max(256),
    destination: z.string().trim().max(256).nullable(),
    startDate: calendar.nullable(),
    endDate: calendar.nullable(),
  })
  .refine(
    (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
  );
export type TripCreateRequest = z.infer<typeof tripCreateRequestSchema>;
export type TripCreateTarget = Pick<TripCreateRequest, "operationId" | "tripId"> & {
  accountId: string;
};
export const tripCreateResultSchema = z.strictObject({
  operationId: coreUuid,
  tripId: coreUuid,
  actorAccountId: coreUuid,
  ownerPersonId: coreUuid,
  coreEpoch: coreUuid,
  coreRevision: z.number().int().positive().safe(),
  coreAccessRevision: z.number().int().positive().safe(),
  name: z.string().min(1).max(256),
  destination: z.string().nullable(),
  startDate: calendar.nullable(),
  endDate: calendar.nullable(),
});
export type TripCreateResult = z.infer<typeof tripCreateResultSchema>;
