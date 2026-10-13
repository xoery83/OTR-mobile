import { z } from "zod";
import { coreHash, coreUuid } from "./tripCoreV2";
import { sourcePdfUploadBindingSchema } from "./sourcePdfUploadAuthority";

export const PDF_UPLOAD_BETA_V2 = {
  profileId: "PDF_PRIVATE_UPLOAD_BETA_ACK_V2",
  profileSha256: "68bf77a7d1f6f0a88e1c2278917cf62609e7f1a03369bc3dcfb96e85cb8445cb",
  issuer: "otr-source-pdf-beta-producer/2",
} as const;
// Internal trusted producer attestations; DTO validation supplies no network authority.
export const sourcePdfBetaBindingSchema = z
  .strictObject({
    ...sourcePdfUploadBindingSchema.shape,
    uploadVersion: z.literal(2),
    profileId: z.literal(PDF_UPLOAD_BETA_V2.profileId),
    profileSha256: z.literal(PDF_UPLOAD_BETA_V2.profileSha256),
    producerId: coreUuid,
    providerInstanceSha256: coreHash,
  })
  .refine(
    (b) => b.objectKey === `v1/${b.tripId}/${b.sourceId}/${b.representationId}/payload`,
  );
const evidence = z.strictObject({
  uploadVersion: z.literal(2),
  issuer: z.literal(PDF_UPLOAD_BETA_V2.issuer),
  binding: sourcePdfBetaBindingSchema,
  ownerRun: coreUuid,
  ownerFence: z.number().int().positive().safe(),
  dispatchId: coreUuid,
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  evidenceSha256: coreHash,
});
export const sourcePdfBetaAckSchema = evidence.extend({
  response: z.strictObject({
    status: z.literal(200),
    transportComplete: z.literal(true),
    upsert: z.literal(false),
    body: z.string().min(1).max(4096),
    bodySha256: coreHash,
    bodyByteCount: z.number().int().min(1).max(4096),
  }),
});
export const sourcePdfBetaGetSchema = evidence
  .extend({
    read: z.strictObject({
      readId: coreUuid,
      sha256: coreHash,
      byteCount: z.number().int().min(1).max(65536),
      mimeType: z.literal("application/pdf"),
      cacheBypassed: z.literal(true),
    }),
  })
  .superRefine((p, ctx) => {
    if (
      p.read.readId === p.dispatchId ||
      p.read.sha256 !== p.binding.sha256 ||
      p.read.byteCount !== p.binding.byteCount
    )
      ctx.addIssue({ code: "custom", message: "PDF_BETA_GET_INVALID" });
  });
export type SourcePdfBetaAck = z.infer<typeof sourcePdfBetaAckSchema>;
export type SourcePdfBetaGet = z.infer<typeof sourcePdfBetaGetSchema>;
