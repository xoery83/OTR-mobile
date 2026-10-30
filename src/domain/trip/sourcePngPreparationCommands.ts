import { z } from "zod";
import type { ImportHash } from "./flightImportReview";
import { sourcePdfV2UploadCommandSchema } from "./sourcePdfV2Upload";
import { createPendingBinaryOriginalCommandProposals } from "./sourceBinaryOriginalCommands";

// Existing generic UPLOAD_ORIGINAL payload; no PDF producer binding or authority.
export const sourcePngOriginalUploadCommandSchema = sourcePdfV2UploadCommandSchema.extend(
  {
    payload: sourcePdfV2UploadCommandSchema.shape.payload.extend({
      mime_type: z.literal("image/png"),
      byte_count: z.number().int().positive().max(4194304),
    }),
  },
);
export async function createPendingPngCommandProposals(
  scope: { actorId: string; tripId: string },
  rawAcquisition: unknown,
  rawReceipt: unknown,
  hash: ImportHash,
) {
  const p = await createPendingBinaryOriginalCommandProposals(
    scope,
    rawAcquisition,
    rawReceipt,
    hash,
    "PNG",
  );
  return {
    prepare: p.prepare,
    upload: sourcePngOriginalUploadCommandSchema.parse(p.upload),
    verify: p.verify,
  };
}
