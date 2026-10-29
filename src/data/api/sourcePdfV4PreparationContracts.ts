import { z } from "zod";

// Transport observations only; never Source receipts, custody proof or Admission.
export const sourcePdfV4PreparationIdentitySchema = z.strictObject({
  sourceId: z.uuid(),
  representationId: z.uuid(),
  operationId: z.uuid(),
});
export type SourcePdfV4PreparationIdentity = z.infer<
  typeof sourcePdfV4PreparationIdentitySchema
>;
export const sourcePdfV4PreparationObservationSchema =
  sourcePdfV4PreparationIdentitySchema.extend({
    observation: z.enum(["STAGED", "DISPATCH_OBSERVED", "READ_OBSERVED"]),
  });
