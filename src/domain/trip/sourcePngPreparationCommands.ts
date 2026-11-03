import { z } from "zod";
import type { ImportHash } from "./flightImportReview";
import { sourcePdfV2UploadCommandSchema } from "./sourcePdfV2Upload";
import { sourcePdfPrepareCommandSchema } from "./sourcePdfPreparation";
import { sourcePdfVerifyCommandSchema } from "./sourcePdfRegistration";
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

export const sourcePngPreparationCommandSchema = z.union([
  sourcePdfPrepareCommandSchema,
  sourcePngOriginalUploadCommandSchema,
  sourcePdfVerifyCommandSchema,
]);

export const sourcePngPendingReplySchema = sourcePdfVerifyCommandSchema
  .pick({
    contract_version: true,
    operation_id: true,
    operation_key: true,
    operation_sha256: true,
  })
  .extend({
    phase: z.enum(["ADMITTED", "IO_ACTIVE", "IO_UNKNOWN", "IO_QUIESCENT"]),
    attempt_generation: z.number().int().nonnegative().safe(),
  })
  .refine((reply) => reply.phase === "ADMITTED" || reply.attempt_generation > 0, {
    message: "Claimed Source operation requires a positive generation",
    path: ["attempt_generation"],
  });
