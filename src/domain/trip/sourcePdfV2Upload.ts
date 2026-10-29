import { z } from "zod";
import {
  sourcePdfCausalBindingSchema,
  sourcePdfCausalAckSchema,
  sourcePdfCausalGetSchema,
} from "./sourcePdfUploadCausal";
import { sourcePdfUploadCommandSchema } from "./sourcePdfUploadAuthority";

// Additive local implementation candidate. Existing upload versions 1–3 stay frozen.
// Parsing this DTO does not issue a resource permit, terminal evidence or Source proof.
export const PDF_UPLOAD_QPDF_V4 = {
  profileId: "PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4",
  profileSha256: "2a9b397d3f8368144517e0a3bf73595e71b6cba7b37341045eceef47ef059f3d",
  issuer: "otr-source-pdf-qpdf-poppler-upload/4",
  terminalHashPrefix: "otr-source-pdf-qpdf-poppler-upload-terminal-v4",
  decoderProfileId: "OTR_PDF_QPDF_POPPLER_V2",
  decoderProfileSha256:
    "ca5a7b63bda8ed5c5b9018b82fbbd14c1a01f054a37b1c2ed76445152b36539c",
  maxByteCount: 10485760,
} as const;
const byteCount = z.number().int().positive().max(PDF_UPLOAD_QPDF_V4.maxByteCount);
export const sourcePdfV2UploadCommandSchema = sourcePdfUploadCommandSchema.extend({
  payload: sourcePdfUploadCommandSchema.shape.payload.extend({ byte_count: byteCount }),
});
export const sourcePdfV2UploadBindingSchema = z
  .strictObject({
    ...sourcePdfCausalBindingSchema.shape,
    uploadVersion: z.literal(4),
    profileId: z.literal(PDF_UPLOAD_QPDF_V4.profileId),
    profileSha256: z.literal(PDF_UPLOAD_QPDF_V4.profileSha256),
    byteCount,
  })
  .refine(
    (b) => b.objectKey === `v1/${b.tripId}/${b.sourceId}/${b.representationId}/payload`,
  );
const version = {
  uploadVersion: z.literal(4),
  issuer: z.literal(PDF_UPLOAD_QPDF_V4.issuer),
  binding: sourcePdfV2UploadBindingSchema,
};
export const sourcePdfV2UploadAckSchema = z.strictObject({
  ...sourcePdfCausalAckSchema.shape,
  ...version,
});
export const sourcePdfV2UploadGetSchema = z
  .strictObject({
    ...sourcePdfCausalGetSchema.shape,
    ...version,
    read: sourcePdfCausalGetSchema.shape.read.extend({ byteCount }),
  })
  .superRefine((p, ctx) => {
    if (
      p.read.readId === p.dispatchId ||
      p.read.sha256 !== p.binding.sha256 ||
      p.read.byteCount !== p.binding.byteCount
    )
      ctx.addIssue({ code: "custom", message: "PDF_V2_CAUSAL_GET_INVALID" });
  });
export type SourcePdfV2UploadBinding = z.infer<typeof sourcePdfV2UploadBindingSchema>;
