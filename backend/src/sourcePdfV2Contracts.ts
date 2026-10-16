import { z } from "zod";
import {
  sourcePdfSealRequestSchema,
  sourcePdfSealSchema,
} from "../../src/domain/trip/sourcePdfAuthority";
import { sourcePdfRegistrationRequestSchema } from "../../src/domain/trip/sourcePdfRegistration";
import { coreUuid, coreHash } from "../../src/domain/trip/tripCoreV2";
import { profile } from "../../scripts/source-pdf-v2-linux/profile.mjs";
import { SOURCE_PDF_V2_LINUX_PROFILE_SHA } from "./sourcePdfV2LinuxVerifier";
import { createHash } from "node:crypto";

// Versioned local implementation candidate; never accepted by existing /1 writers.
export const PDF_V2_OPTIONS_SHA = createHash("sha256")
  .update(profile.textPolicy)
  .digest("hex");
export const sourcePdfV2SealRequestSchema = sourcePdfSealRequestSchema.extend({
  derivativeVersion: z.literal(2),
});
export const sourcePdfV2RegistrationRequestSchema =
  sourcePdfRegistrationRequestSchema.extend({ derivativeVersion: z.literal(2) });
export const sourcePdfV2SealSchema = sourcePdfSealSchema.extend({
  derivativeVersion: z.literal(2),
  request: sourcePdfV2SealRequestSchema,
  profileId: z.literal(profile.id),
  profileSha256: z.literal(SOURCE_PDF_V2_LINUX_PROFILE_SHA),
  producer: z.literal(profile.producer),
  transformOptionsSha256: z.literal(PDF_V2_OPTIONS_SHA),
  originalByteCount: z.number().int().positive().max(profile.maxOriginalBytes),
  textByteCount: z.number().int().positive().max(profile.maxTextBytes),
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
