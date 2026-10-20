import { z } from "zod";

export const CAPTURE_LIMITS = Object.freeze({
  binaryBytes: 10 * 1024 * 1024,
  textBytes: 1024 * 1024,
  accountBytes: 100 * 1024 * 1024,
  accountRows: 1000,
  deviceBytes: 500 * 1024 * 1024,
});
export type CaptureErrorCode =
  | "INVALID_INPUT"
  | "EMPTY_PAYLOAD"
  | "PAYLOAD_TOO_LARGE"
  | "READER_FAILURE"
  | "INVALID_UTF8"
  | "HASH_FAILURE"
  | "ROW_QUOTA"
  | "ACCOUNT_BYTE_QUOTA"
  | "DEVICE_BYTE_QUOTA"
  | "TRIP_ACCESS"
  | "NOT_FOUND"
  | "STALE_REVISION"
  | "INTEGRITY";
export class LocalCaptureError extends Error {
  constructor(readonly code: CaptureErrorCode) {
    super(`Local Capture: ${code}`);
    this.name = "LocalCaptureError";
  }
}
export const captureKindSchema = z.enum(["FILE", "IMAGE", "TEXT"]);
export type CaptureKind = z.infer<typeof captureKindSchema>;
export const captureIdSchema = z.string().min(1).max(128);
export const captureMetadataSchema = z
  .object({
    kind: captureKindSchema,
    originalFilename: z.string().max(1024).nullable().default(null),
    declaredContentType: z.string().max(255).nullable().default(null),
    tripId: captureIdSchema.nullable().default(null),
  })
  .strict();
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const captureRevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const localCaptureSchema = captureMetadataSchema
  .extend({
    id: captureIdSchema,
    accountId: captureIdSchema,
    payloadId: captureIdSchema,
    byteCount: z.number().int().min(1).max(CAPTURE_LIMITS.binaryBytes),
    sha256: sha256Schema,
    createdAt: z.iso.datetime(),
    state: z.enum(["INBOX", "ASSIGNED"]),
    revision: captureRevisionSchema,
  })
  .refine((c) => c.state === (c.tripId === null ? "INBOX" : "ASSIGNED"))
  .refine((c) => c.kind !== "TEXT" || c.byteCount <= CAPTURE_LIMITS.textBytes);
export type LocalCapture = z.infer<typeof localCaptureSchema>;
export type CaptureMetadata = z.input<typeof captureMetadataSchema>;
export function captureByteLimit(kind: CaptureKind) {
  return kind === "TEXT" ? CAPTURE_LIMITS.textBytes : CAPTURE_LIMITS.binaryBytes;
}
export function equalCaptureBytes(a: Uint8Array, b: Uint8Array) {
  return a.byteLength === b.byteLength && a.every((byte, i) => byte === b[i]);
}
