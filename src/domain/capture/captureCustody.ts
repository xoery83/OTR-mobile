import { z } from "zod";
import { verifyUtf8TextFile } from "./utf8TextFile";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export const CAPTURE_CUSTODY_MAX_BYTES = 4 * 1024 * 1024;
export const captureCustodyBindingSchema = z
  .strictObject({
    version: z.literal(1),
    accountId: z.uuid(),
    batchId: z.uuid(),
    jobId: z.uuid(),
    inputId: z.uuid(),
    inputRevision: z.number().int().positive().safe(),
    captureId: z.uuid(),
    payloadId: z.uuid(),
    captureRevision: z.number().int().positive().safe(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteCount: z.number().int().positive().max(CAPTURE_CUSTODY_MAX_BYTES),
    mediaType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  })
  .refine((b) => b.batchId !== b.jobId);
export type CaptureCustodyBinding = z.infer<typeof captureCustodyBindingSchema>;
// Explicit Universal extension. The original v1 schema/serialization remains unchanged.
export const captureUniversalCustodyBindingSchema = z
  .strictObject({
    ...captureCustodyBindingSchema.shape,
    version: z.literal(2),
    originalFilename: z.string().min(1).max(255).nullable(),
    acquisitionSource: z.enum(["files", "photos", "camera", "magic_input", "clipboard"]),
    kind: z.enum(["FILE", "IMAGE", "TEXT"]),
    mediaType: z.enum(["application/pdf", "image/jpeg", "image/png", "text/plain"]),
  })
  .superRefine((b, ctx) => {
    if (
      b.batchId === b.jobId ||
      (b.kind === "TEXT" && b.mediaType !== "text/plain") ||
      (b.mediaType === "text/plain" && b.kind !== "TEXT" && b.kind !== "FILE") ||
      (b.kind === "TEXT" && b.originalFilename !== null) ||
      (b.kind === "FILE" &&
        b.mediaType === "text/plain" &&
        (!b.originalFilename || !/\.txt$/i.test(b.originalFilename))) ||
      (b.kind === "IMAGE" && b.mediaType === "application/pdf") ||
      (b.acquisitionSource === "magic_input") !== (b.kind === "TEXT") ||
      (b.mediaType === "text/plain" && b.byteCount > 262144) ||
      (["camera", "clipboard", "photos"].includes(b.acquisitionSource) &&
        b.kind !== "IMAGE") ||
      (b.acquisitionSource === "files" && b.kind !== "FILE")
    )
      ctx.addIssue({ code: "custom", message: "CAPTURE_CUSTODY_PROVENANCE_INVALID" });
  });
export const captureMaterialBindingSchema = z.union([
  captureCustodyBindingSchema,
  captureUniversalCustodyBindingSchema,
]);
export type CaptureMaterialBinding = z.infer<typeof captureMaterialBindingSchema>;
export const captureCustodyBindingJson = (raw: CaptureMaterialBinding) =>
  JSON.stringify(captureMaterialBindingSchema.parse(raw));

// Container signatures only; this grants no parser, semantic or Source admission.
export function captureCustodyMedia(
  bytes: Uint8Array,
): CaptureCustodyBinding["mediaType"] {
  if (bytes.length >= 5 && [37, 80, 68, 70, 45].every((v, n) => bytes[n] === v))
    return "application/pdf";
  if (
    bytes.length >= 5 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    // Preserve opaque bytes after EOI; identity always pins the entire original.
    bytes.some((value, index) => index >= 2 && value === 255 && bytes[index + 1] === 217)
  )
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, n) => bytes[n] === v)
  )
    return "image/png";
  throw new Error("CAPTURE_CUSTODY_MEDIA_INVALID");
}
export function assertCaptureCustodyBytes(
  binding: CaptureMaterialBinding,
  bytes: Uint8Array,
) {
  captureMaterialBindingSchema.parse(binding);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== binding.byteCount ||
    bytesToHex(sha256(bytes)) !== binding.sha256 ||
    (binding.mediaType === "text/plain"
      ? binding.version === 2 && binding.kind === "FILE"
        ? !validCaptureTextFile(binding, bytes)
        : !validCaptureText(bytes)
      : captureCustodyMedia(bytes) !== binding.mediaType)
  )
    throw new Error("CAPTURE_CUSTODY_BYTES_INVALID");
}
function validCaptureTextFile(
  binding: z.infer<typeof captureUniversalCustodyBindingSchema>,
  bytes: Uint8Array,
) {
  try {
    verifyUtf8TextFile(bytes, binding.originalFilename, "text/plain");
    return true;
  } catch {
    return false;
  }
}
function validCaptureText(bytes: Uint8Array) {
  try {
    // Strict UTF-8: preserve BOM and exact original bytes; NUL is not Source text.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return bytes.length <= 262144 && !text.includes("\0");
  } catch {
    return false;
  }
}
export type CaptureMaterialCustody = {
  put(binding: CaptureMaterialBinding, bytes: Uint8Array): Promise<void>;
  read(binding: CaptureMaterialBinding): Promise<Uint8Array | null>;
};

export const captureCustodyBatchSchema = z
  .strictObject({
    batchId: z.uuid(),
    jobId: z.uuid(),
    inputs: z.array(captureCustodyBindingSchema).length(2),
  })
  .refine(
    (b) =>
      b.inputs.length === 2 &&
      b.inputs.every(
        (i) =>
          i.batchId === b.batchId &&
          i.jobId === b.jobId &&
          i.accountId === b.inputs[0].accountId,
      ) &&
      b.inputs[0].inputId !== b.inputs[1].inputId,
  );
export type CaptureCustodyBatch = z.infer<typeof captureCustodyBatchSchema>;

export const captureUniversalCustodyBatchSchema = z
  .strictObject({
    version: z.literal(2),
    batchId: z.uuid(),
    jobId: z.uuid(),
    inputs: z.array(captureUniversalCustodyBindingSchema).min(1).max(64),
  })
  .superRefine((b, ctx) => {
    if (
      b.inputs.some(
        (i) =>
          i.batchId !== b.batchId ||
          i.jobId !== b.jobId ||
          i.accountId !== b.inputs[0].accountId,
      ) ||
      new Set(b.inputs.map((i) => i.inputId)).size !== b.inputs.length ||
      new Set(b.inputs.map((i) => i.captureId)).size !== b.inputs.length ||
      new Set(b.inputs.map((i) => i.payloadId)).size !== b.inputs.length
    )
      ctx.addIssue({ code: "custom", message: "CAPTURE_CUSTODY_BATCH_INVALID" });
  });
export const captureMaterialBatchSchema = z.union([
  captureCustodyBatchSchema,
  captureUniversalCustodyBatchSchema,
]);
export type CaptureMaterialBatch = z.infer<typeof captureMaterialBatchSchema>;
