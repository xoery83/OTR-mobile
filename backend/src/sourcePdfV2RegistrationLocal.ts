import { createHash } from "node:crypto";
import { z } from "zod";
import { sourcePdfSealRequestSchema } from "../../src/domain/trip/sourcePdfAuthority";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import type { SourcePdfCustodyReader } from "./sourcePdfAuthority";
import {
  createSourcePdfV2LocalVerifier,
  PDF_V2_LOCAL_PROFILE,
  type PdfV2IndependentDecoder,
} from "./sourcePdfV2Local";

// Local preparation only; /1 receipt, SQL and seal consumers remain unchanged.
const requestSchema = sourcePdfSealRequestSchema.extend({
  derivativeVersion: z.literal(2),
});
const originalSchema = z.strictObject({
  source_id: z.uuid(),
  id: z.uuid(),
  role: z.literal("ORIGINAL"),
  material_kind: z.literal("BINARY"),
  mime_type: z.literal("application/pdf"),
  storage_provider: z.literal("supabase_storage"),
  storage_bucket: z.literal("trip-source-material"),
  object_key: z.string(),
  payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byte_count: z.number().int().positive().max(PDF_V2_LOCAL_PROFILE.maxOriginalBytes),
  row_revision: z.number().int().positive().safe(),
  retention_state: z.literal("RETAINED"),
});
const inputSchema = z.strictObject({
  accountId: z.uuid(),
  tripId: z.uuid(),
  request: requestSchema,
  original: originalSchema,
});
export type SourcePdfV2RegistrationLocalInput = z.infer<typeof inputSchema>;

// Supplied metadata is checked, never treated as authorization or a VERIFIED receipt.
// Future composition must obtain it from the existing authenticated owning context.
export function createSourcePdfV2RegistrationLocalPreparation(
  readOriginal: SourcePdfCustodyReader,
  decode: PdfV2IndependentDecoder,
) {
  const verify = createSourcePdfV2LocalVerifier(readOriginal, decode);
  return async (input: SourcePdfV2RegistrationLocalInput) => {
    let current: SourcePdfV2RegistrationLocalInput;
    try {
      current = structuredClone(inputSchema.parse(input));
    } catch {
      throw new Error("PDF_V2_REGISTRATION_INPUT_INVALID");
    }
    const { accountId, tripId, request, original } = current;
    if (
      original.source_id !== request.sourceId ||
      original.id !== request.originalRepresentationId ||
      original.row_revision !== request.originalRowRevision ||
      request.originalRepresentationId === request.derivedRepresentationId ||
      original.object_key !==
        `v1/${tripId}/${request.sourceId}/${request.originalRepresentationId}/payload`
    )
      throw new Error("PDF_V2_REGISTRATION_SCOPE_MISMATCH");
    const result = await verify({
      accountId,
      tripId,
      sourceId: request.sourceId,
      representationId: request.originalRepresentationId,
      sha256: original.payload_sha256,
      byteCount: original.byte_count,
    });
    const body = {
      derivativeVersion: 2 as const,
      accountId,
      tripId,
      request,
      profileId: result.profileId,
      profileSha256: result.profileSha256,
      originalSha256: result.originalSha256,
      originalByteCount: result.originalByteCount,
      textSha256: result.textSha256,
      textByteCount: result.textByteCount,
      pageMapSha256: result.pageMapSha256,
      pages: result.pages,
    };
    return {
      status: "LOCAL_PREPARATION_ONLY" as const,
      grantsSourceAuthority: false as const,
      body,
      // Domain-separated candidate digest is deliberately not a registration/seal hash.
      preparationSha256: createHash("sha256")
        .update("otr-source-pdf-v2-local-preparation\0")
        .update(canonicalCoreJson(body))
        .digest("hex"),
      text: result.text,
      runtimeStatus: result.runtimeStatus,
      requiredBeforeRegistration: [
        "TRUSTED_V2_PRODUCER_PROFILE",
        "CURRENT_SOURCE_CONTEXT_AND_VERIFY_RECEIPT",
        "V2_REGISTRATION_AND_SEAL_WRITERS",
      ] as const,
    };
  };
}
