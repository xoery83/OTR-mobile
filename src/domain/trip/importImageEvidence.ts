import { z } from "zod";
import { flightInputSchema, type ImportHash } from "./flightImportReview";

// Internal owning snapshot only; the reader must obtain this receipt from Source.
export const importImageMaterialSchema = z.strictObject({
  pin: flightInputSchema,
  form: z.literal("IMAGE"),
  media_type: z.literal("image/png"),
  // shortcut: first Photo slice limits inline custody to 1 MiB; use bounded custody references before larger images.
  originalBase64: z
    .string()
    .min(4)
    .max(1398104)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  width: z.number().int().positive().max(2048),
  height: z.number().int().positive().max(2048),
  verification: z.strictObject({
    attemptId: z.uuid(),
    operationId: z.uuid(),
    terminalEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    profileId: z.literal("PNG_STATIC_RGB8_RGBA8_V1"),
    profileSha256: z.literal(
      "526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5",
    ),
  }),
});
export type ImportImageMaterial = z.infer<typeof importImageMaterialSchema>;
export async function importImageBytes(material: ImportImageMaterial, hash: ImportHash) {
  const m = importImageMaterialSchema.parse(material);
  const bytes = Uint8Array.from(atob(m.originalBase64), (c) => c.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    bytes.length > 1048576 ||
    bytes.length !== m.pin.byte_count ||
    signature.some((v, i) => bytes[i] !== v) ||
    (await hash(bytes)) !== m.pin.payload_sha256
  )
    throw Error("IMPORT_SOURCE_EVIDENCE_STALE");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Dimensions corroborate the owning decoder receipt; this is not PNG validation.
  if (
    view.getUint32(16) !== m.width ||
    view.getUint32(20) !== m.height ||
    m.width * m.height > 1048576
  )
    throw Error("IMPORT_SOURCE_EVIDENCE_STALE");
  return bytes;
}
