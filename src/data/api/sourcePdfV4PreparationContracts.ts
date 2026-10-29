import { sourcePdfPrepareReceiptSchema } from "../../domain/trip/sourcePdfPreparation";
import { z } from "zod";
import { sourcePdfUploadReceiptSchema } from "../../domain/trip/sourcePdfUploadAuthority";

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

// Only the command observations can carry an existing owning Source receipt.
export const sourcePdfV4CommandObservationSchema = sourcePdfV4PreparationIdentitySchema
  .extend({
    observation: z.enum(["RESERVATION_OBSERVED", "FINISH_OBSERVED"]),
    receipt: sourcePdfUploadReceiptSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.observation === "FINISH_OBSERVED" && !value.receipt)
      context.addIssue({ code: "custom", message: "SOURCE_RECEIPT_REQUIRED" });
  });

export const sourcePdfV4PrepareObservationSchema =
  sourcePdfV4PreparationIdentitySchema.extend({
    observation: z.literal("PREPARE_OBSERVED"),
    receipt: sourcePdfPrepareReceiptSchema,
  });
