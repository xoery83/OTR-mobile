import { z } from "zod";
import {
  sourcePdfVerifyCommandSchema,
  sourcePdfVerifyReceiptSchema,
} from "./sourcePdfRegistration";

// Frozen owning PREPARE tuple; not a synthetic parent or an upload receipt.
export const sourcePdfPrepareCommandSchema = sourcePdfVerifyCommandSchema.extend({
  command: z.literal("PREPARE_REPRESENTATION"),
});
export const sourcePdfPrepareReceiptSchema = sourcePdfVerifyReceiptSchema.extend({
  command: z.literal("PREPARE_REPRESENTATION"),
});

// Journal projection only; no custody/Source receipt or permission to dispatch.
export const sourcePdfUploadStatusSchema = z.enum([
  "NO_ACTIVE_ATTEMPT",
  "RESERVED",
  "STAGED",
  "DISPATCH_RECORDED",
  "ACK_OBSERVED",
  "READ_OBSERVED",
  "UNKNOWN",
  "RECOVERY_REQUIRED",
]);

export const PDF_CAPTURE_ORIGINAL_PROFILE = "OTR_PDF_CAPTURE_ORIGINAL_V1" as const;
