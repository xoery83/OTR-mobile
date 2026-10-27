import { z } from "zod";
import { coreUuid } from "./tripCoreV2";
import { isTripCoverAssetId, parseTripPhotoCoverRef } from "./tripCoverAssets";
import { tripMetadataUpdateSchema } from "./tripMetadataContract";
import {
  localTripDestinationInputSchema,
  parseLocalTripDestinations,
} from "./localTripDestination";

const items = z
  .array(localTripDestinationInputSchema)
  .max(20)
  .transform(parseLocalTripDestinations);
export const localTripDestinationsChangeSchema = z
  .object({
    operationId: coreUuid,
    before: items,
    after: items,
  })
  .strict();
export type LocalTripDestinationsChange = z.infer<
  typeof localTripDestinationsChangeSchema
>;
// Local-only receipt. This payload must never be included in the Hosted metadata request.
export const localTripDestinationsReceiptSchema = z
  .object({
    metadata: tripMetadataUpdateSchema,
    cover: z
      .object({
        before: z.string().max(128).nullable(),
        after: z.string().max(128).nullable(),
      })
      .strict()
      .refine(
        (value) =>
          (value.before === null || /^[a-z0-9_-]{1,64}$/.test(value.before)) &&
          (value.after === null ||
            isTripCoverAssetId(value.after) ||
            !!parseTripPhotoCoverRef(value.after)),
      )
      .nullable(),
    destinations: localTripDestinationsChangeSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.metadata.operationId !== value.destinations.operationId &&
      value.metadata.after.destination === null &&
      (JSON.stringify(value.destinations.before) !==
        JSON.stringify(value.destinations.after) ||
        value.metadata.before.destination !== null),
  );
