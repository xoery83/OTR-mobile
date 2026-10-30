import { z } from "zod";
import { sourcePdfSealRequestSchema, sourcePdfSealSchema } from "./sourcePdfAuthority";
import { sourcePdfRegistrationRequestSchema } from "./sourcePdfRegistration";
import { coreUuid, coreHash } from "./tripCoreV2";
import { PDF_UPLOAD_QPDF_V4 } from "./sourcePdfV2Upload";

// Versioned local implementation candidate; never accepted by existing /1 writers.
export const PDF_V2_OPTIONS_SHA =
  "71804d69ac7011fc3b27231d7f6942cb696edb7ced9e696c083d4ce05fdd9ee5";
export const sourcePdfV2SealRequestSchema = sourcePdfSealRequestSchema.extend({
  derivativeVersion: z.literal(2),
});
export const sourcePdfV2RegistrationRequestSchema =
  sourcePdfRegistrationRequestSchema.extend({ derivativeVersion: z.literal(2) });
export const sourcePdfV2SealSchema = sourcePdfSealSchema.extend({
  derivativeVersion: z.literal(2),
  request: sourcePdfV2SealRequestSchema,
  profileId: z.literal(PDF_UPLOAD_QPDF_V4.decoderProfileId),
  profileSha256: z.literal(PDF_UPLOAD_QPDF_V4.decoderProfileSha256),
  producer: z.literal("otr-source-pdf-qpdf-poppler/2"),
  transformOptionsSha256: z.literal(PDF_V2_OPTIONS_SHA),
  originalByteCount: z.number().int().positive().max(PDF_UPLOAD_QPDF_V4.maxByteCount),
  textByteCount: z.number().int().positive().max(262144),
});
export const sourcePdfV2RegistrationBodySchema = sourcePdfV2SealSchema.extend({
  request: sourcePdfV2RegistrationRequestSchema,
});
export const sourcePdfV2RegistrationReceiptSchema = z.strictObject({
  derivativeVersion: z.literal(2),
  operationId: coreUuid,
  registrationSha256: coreHash,
  body: sourcePdfV2RegistrationBodySchema,
});
export const sourcePdfV2ReceiptSchema = z.strictObject({
  derivativeVersion: z.literal(2),
  operationId: coreUuid,
  sealSha256: coreHash,
  body: sourcePdfV2SealSchema,
});
export type SourcePdfV2SealRequest = z.infer<typeof sourcePdfV2SealRequestSchema>;
export type SourcePdfV2RegistrationRequest = z.infer<
  typeof sourcePdfV2RegistrationRequestSchema
>;
