import { z } from "zod";
import { coreUuid } from "./tripCoreV2";
import { structuredTripMetadataSchema } from "./tripStructuredDestinationContract";
const fields = {
  localActionVersion: z.literal(1),
  actionId: coreUuid,
  operationId: coreUuid,
  tripId: coreUuid,
  before: structuredTripMetadataSchema,
  after: structuredTripMetadataSchema,
  cover: z
    .strictObject({
      before: z.string().max(256).nullable(),
      after: z.string().max(256).nullable(),
    })
    .optional(),
};
export const deferredTripMetadataSchema = z
  .strictObject(fields)
  .refine((v) => v.actionId !== v.operationId);
export const retainedDeferredTripMetadataSchema = z
  .strictObject({ ...fields, dependencyOperationId: coreUuid })
  .refine((v) => v.actionId !== v.operationId);
export type DeferredTripMetadata = z.infer<typeof deferredTripMetadataSchema>;
