import { z } from "zod";
import { coreHash, coreUuid } from "./tripCoreV2";
import {
  sourcePdfVerifyCommandSchema,
  sourcePdfVerifyReceiptSchema,
} from "./sourcePdfRegistration";

// Internal producer DTOs. Parsing describes a binding; it never certifies provider terminality.
export const PDF_UPLOAD_PROFILE_V1 = {
  profileId: "PDF_PRIVATE_UPLOAD_V1",
  profileSha256: "f5dccdd357e0a285a90e89707a70d531667313f2c07372b1c34f3c53871522c3",
  issuer: "otr-source-pdf-upload-producer/1",
  terminalHashPrefix: "otr-source-pdf-upload-terminal-v1",
  maxByteCount: 65536,
} as const;
const revision = z.number().int().positive().safe();
const byteCount = z.number().int().min(1).max(PDF_UPLOAD_PROFILE_V1.maxByteCount);
const operationKey = sourcePdfVerifyCommandSchema.shape.operation_key;
export const sourcePdfUploadCommandSchema = sourcePdfVerifyCommandSchema.extend({
  command: z.literal("UPLOAD_ORIGINAL"),
  payload: sourcePdfVerifyCommandSchema.shape.payload.extend({
    parent_operation_id: coreUuid,
    payload_sha256: coreHash,
    byte_count: byteCount,
    mime_type: z.literal("application/pdf"),
  }),
});
export const sourcePdfUploadReceiptSchema = sourcePdfVerifyReceiptSchema.extend({
  command: z.literal("UPLOAD_ORIGINAL"),
  result_remote_state: z.literal("PENDING").nullable(),
  result_verified_at: z.null(),
  result_action_id: z.null(),
});
export const sourcePdfUploadBindingSchema = z
  .strictObject({
    uploadVersion: z.literal(1),
    operationId: coreUuid,
    operationKey,
    operationSha256: coreHash,
    actorAccountId: coreUuid,
    tripId: coreUuid,
    sourceId: coreUuid,
    representationId: coreUuid,
    materialRevision: revision,
    sourceRowRevision: revision,
    representationRowRevision: revision,
    parentOperationId: coreUuid,
    attemptId: coreUuid,
    attemptGeneration: revision,
    executionPrincipal: z.literal("otr_trip_source_command_gateway"),
    resourceId: coreUuid,
    nodeId: coreUuid,
    resourceKey: coreHash,
    runToken: coreUuid,
    provider: z.literal("supabase_storage"),
    bucket: z.literal("trip-source-material"),
    objectKey: z.string().max(256),
    sha256: coreHash,
    byteCount,
    mimeType: z.literal("application/pdf"),
    profileId: z.literal(PDF_UPLOAD_PROFILE_V1.profileId),
    profileSha256: z.literal(PDF_UPLOAD_PROFILE_V1.profileSha256),
  })
  .refine(
    (b) => b.objectKey === `v1/${b.tripId}/${b.sourceId}/${b.representationId}/payload`,
  );
const objectObservation = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("MATCH"),
    sha256: coreHash,
    byteCount,
    mimeType: z.literal("application/pdf"),
  }),
  z.strictObject({
    kind: z.literal("MISSING"),
    sha256: z.null(),
    byteCount: z.null(),
    mimeType: z.null(),
  }),
  z.strictObject({
    kind: z.literal("MISMATCH"),
    sha256: coreHash,
    byteCount: z.number().int().nonnegative().safe(),
    mimeType: z.string().min(1).max(128),
  }),
]);
export const sourcePdfUploadTerminalSchema = z
  .strictObject({
    uploadVersion: z.literal(1),
    issuer: z.literal(PDF_UPLOAD_PROFILE_V1.issuer),
    binding: sourcePdfUploadBindingSchema,
    ownerRun: coreUuid,
    ownerFence: revision,
    dispatchId: coreUuid.nullable(),
    observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
    disposition: z.enum(["WRITER_TERMINAL", "NO_DISPATCH"]),
    object: objectObservation,
    evidenceSha256: coreHash,
  })
  .superRefine((p, ctx) => {
    if (
      (p.disposition === "NO_DISPATCH") !== (p.dispatchId === null) ||
      (p.disposition === "NO_DISPATCH" && p.object.kind !== "MISSING")
    )
      ctx.addIssue({ code: "custom", message: "INVALID_DISPATCH_TERMINAL_BINDING" });
    const same =
      p.object.sha256 === p.binding.sha256 &&
      p.object.byteCount === p.binding.byteCount &&
      p.object.mimeType === p.binding.mimeType;
    if ((p.object.kind === "MATCH" && !same) || (p.object.kind === "MISMATCH" && same))
      ctx.addIssue({ code: "custom", message: "INVALID_OBJECT_OBSERVATION" });
  });
export type SourcePdfUploadCommand = z.infer<typeof sourcePdfUploadCommandSchema>;
export type SourcePdfUploadBinding = z.infer<typeof sourcePdfUploadBindingSchema>;
export type SourcePdfUploadTerminal = z.infer<typeof sourcePdfUploadTerminalSchema>;
export type SourcePdfUploadReceipt = z.infer<typeof sourcePdfUploadReceiptSchema>;
