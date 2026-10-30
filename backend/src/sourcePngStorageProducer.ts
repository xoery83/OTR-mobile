import { createHash } from "node:crypto";
import { z } from "zod";
import { sourcePdfUploadBindingSchema } from "../../src/domain/trip/sourcePdfUploadAuthority";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
import {
  createOriginalStorageProducer,
  type PdfSourceRequestIoGuard,
  type PdfStorageConfig,
} from "./sourcePdfStorageProducer";

export const SOURCE_PNG_SANDBOX_IMAGE =
  "sha256:e2c5719ffd22cf60a68d79a53d83c01820db8384611201c68b917463c0f16b92";
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
// Internal Source reservation pins; no PDF version, profile or authority is borrowed.
export const sourcePngStorageBindingSchema = z
  .strictObject({ ...sourcePdfUploadBindingSchema.shape })
  .omit({ uploadVersion: true })
  .extend({
    mimeType: z.literal("image/png"),
    profileId: z.literal("PNG_STATIC_RGB8_RGBA8_V1"),
    profileSha256: z.literal(PNG_DEV_X64_EXECUTION_PROFILE_SHA256),
    byteCount: z.number().int().positive().max(1048576),
  })
  .refine(
    (b) => b.objectKey === `v1/${b.tripId}/${b.sourceId}/${b.representationId}/payload`,
  );
export type SourcePngStorageBinding = z.infer<typeof sourcePngStorageBindingSchema>;
const positive = z.number().int().positive().safe();
const sandboxResultSchema = z.strictObject({
  imageId: z.literal(SOURCE_PNG_SANDBOX_IMAGE),
  terminated: z.literal(true),
  result: z.strictObject({
    protocol_version: z.literal(1),
    profile_version: z.literal(1),
    profile_sha256: z.literal(PNG_DEV_X64_EXECUTION_PROFILE_SHA256),
    input_token: z.string().regex(/^[a-f0-9]{32}$/),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byte_count: positive.max(1048576),
    actual_mime: z.literal("image/png"),
    format: z.literal("PNG"),
    facts: z.strictObject({
      width: positive.max(2048),
      height: positive.max(2048),
      pixels: positive.max(1048576),
      frames: z.literal(1),
      channels: z.union([z.literal(3), z.literal(4)]),
      bit_depth: z.literal(8),
      interlace: z.literal(0),
      decoded_byte_count: positive.max(4194304),
    }),
    status: z.literal("PARSE_PASS"),
  }),
});
export type SourcePngSandbox = (bytes: Uint8Array) => Promise<unknown>;

// Unmounted until the owning Source/Host Gate. Observations never finalize a Source.
export function createSourcePngStorageProducer(
  config: PdfStorageConfig,
  runSandbox: SourcePngSandbox,
  custodyScope: { accountId: string; tripId: string },
  requestGuard: PdfSourceRequestIoGuard,
) {
  return createOriginalStorageProducer(
    config,
    sourcePngStorageBindingSchema,
    async (bytes) => verifySourcePngSandboxObservation(bytes, await runSandbox(bytes)),
    1048576,
    "PNG_STATIC_RGB8_RGBA8_V1",
    custodyScope,
    requestGuard,
    "image/png",
  );
}

export function verifySourcePngSandboxObservation(bytes: Uint8Array, raw: unknown) {
  if (!bytes.length || bytes.length > 1048576) throw Error("PNG_INPUT_LIMIT");
  const { result } = sandboxResultSchema.parse(raw);
  const f = result.facts;
  if (
    result.input_sha256 !== sha256(bytes) ||
    result.byte_count !== bytes.length ||
    f.pixels !== f.width * f.height ||
    f.decoded_byte_count !== f.pixels * 4
  )
    throw Error("PNG_SANDBOX_IDENTITY_MISMATCH");
  return result;
}
