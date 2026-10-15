import { z } from "zod";
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
export const captureCustodyBindingJson = (raw: CaptureCustodyBinding) =>
  JSON.stringify(captureCustodyBindingSchema.parse(raw));

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
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
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
  binding: CaptureCustodyBinding,
  bytes: Uint8Array,
) {
  captureCustodyBindingSchema.parse(binding);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== binding.byteCount ||
    bytesToHex(sha256(bytes)) !== binding.sha256 ||
    captureCustodyMedia(bytes) !== binding.mediaType
  )
    throw new Error("CAPTURE_CUSTODY_BYTES_INVALID");
}
export type CaptureMaterialCustody = {
  put(binding: CaptureCustodyBinding, bytes: Uint8Array): Promise<void>;
  read(binding: CaptureCustodyBinding): Promise<Uint8Array | null>;
};

export const captureCustodyBatchSchema = z
  .strictObject({
    batchId: z.uuid(),
    jobId: z.uuid(),
    inputs: z.array(captureCustodyBindingSchema).length(2),
  })
  .refine(
    (b) =>
      b.inputs.every(
        (i) =>
          i.batchId === b.batchId &&
          i.jobId === b.jobId &&
          i.accountId === b.inputs[0].accountId,
      ) && b.inputs[0].inputId !== b.inputs[1].inputId,
  );
export type CaptureCustodyBatch = z.infer<typeof captureCustodyBatchSchema>;
