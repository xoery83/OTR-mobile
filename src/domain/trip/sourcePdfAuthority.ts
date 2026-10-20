import { z } from "zod";
import { coreUuid, coreHash } from "./tripCoreV2";
const revision = z.number().int().positive().safe();
export const sourcePdfSealRequestSchema = z.strictObject({
  derivativeVersion: z.literal(1),
  operationId: coreUuid,
  sourceId: coreUuid,
  sourceRevision: revision,
  sourceRowRevision: revision,
  originalRepresentationId: coreUuid,
  originalRowRevision: revision,
  derivedRepresentationId: coreUuid,
});
export type SourcePdfSealRequest = z.infer<typeof sourcePdfSealRequestSchema>;
export const sourcePdfSealSchema = z.strictObject({
  derivativeVersion: z.literal(1),
  request: sourcePdfSealRequestSchema,
  accountId: coreUuid,
  tripId: coreUuid,
  requestSha256: coreHash,
  profileId: z.literal("OTR_PDF_LITERAL_TEXT_V1"),
  profileSha256: coreHash,
  producer: z.literal("otr-source-pdf-verifier/1"),
  originalSha256: coreHash,
  originalByteCount: z.number().int().min(1).max(65536),
  textSha256: coreHash,
  textByteCount: z.number().int().min(1).max(2300),
  transformOptionsSha256: coreHash,
  pageMapSha256: coreHash,
  pages: z
    .array(
      z.strictObject({
        pageIndex: z.number().int().min(0).max(31),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(32),
});
export type SourcePdfSeal = z.infer<typeof sourcePdfSealSchema>;

export const sourcePdfReceiptSchema = z.strictObject({
  derivativeVersion: z.literal(1),
  operationId: coreUuid,
  sealSha256: coreHash,
  body: sourcePdfSealSchema,
});
export type SourcePdfReceipt = z.infer<typeof sourcePdfReceiptSchema>;
