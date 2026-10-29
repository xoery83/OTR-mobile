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
