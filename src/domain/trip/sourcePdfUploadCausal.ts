import { z } from "zod";
import { coreHash } from "./tripCoreV2";
import {
  sourcePdfBetaBindingSchema,
  sourcePdfBetaAckSchema,
  sourcePdfBetaGetSchema,
} from "./sourcePdfUploadBeta";
export const PDF_UPLOAD_CAUSAL_V3 = {
  profileId: "PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3",
  profileSha256: "c8c017e4aab33ece1067ba3a063af2029e09edf5d6a5ba1b375c069a3268c00b",
  issuer: "otr-source-pdf-causal-producer/3",
} as const;
export const sourcePdfCausalBindingSchema = z
  .strictObject({
    ...sourcePdfBetaBindingSchema.shape,
    uploadVersion: z.literal(3),
    profileId: z.literal(PDF_UPLOAD_CAUSAL_V3.profileId),
    profileSha256: z.literal(PDF_UPLOAD_CAUSAL_V3.profileSha256),
  })
  .refine(
    (b) => b.objectKey === `v1/${b.tripId}/${b.sourceId}/${b.representationId}/payload`,
  );
const version = {
  uploadVersion: z.literal(3),
  issuer: z.literal(PDF_UPLOAD_CAUSAL_V3.issuer),
  binding: sourcePdfCausalBindingSchema,
};
export const sourcePdfCausalAckSchema = z.strictObject({
  ...sourcePdfBetaAckSchema.shape,
  ...version,
});
export const sourcePdfCausalGetSchema = z
  .strictObject({
    ...sourcePdfBetaGetSchema.shape,
    ...version,
    read: sourcePdfBetaGetSchema.shape.read.extend({ ackEvidenceSha256: coreHash }),
  })
  .superRefine((p, ctx) => {
    if (
      p.read.readId === p.dispatchId ||
      p.read.sha256 !== p.binding.sha256 ||
      p.read.byteCount !== p.binding.byteCount
    )
      ctx.addIssue({ code: "custom", message: "PDF_CAUSAL_GET_INVALID" });
  });
export type SourcePdfCausalAck = z.infer<typeof sourcePdfCausalAckSchema>;
export type SourcePdfCausalGet = z.infer<typeof sourcePdfCausalGetSchema>;
