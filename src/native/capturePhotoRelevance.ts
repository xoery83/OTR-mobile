import type { CaptureLocalExtraction } from "./captureLocalExtractionCore";
import {
  photoImportPinSchema,
  screenPhotoImportRelevance,
  type PhotoImportDecision,
  type PhotoImportPin,
} from "@/domain/capture/photoImportRelevance";

// Reuses the existing byte-bound Apple Vision extractor; no local field parser.
export async function screenCapturePhotoRelevance(
  original: { pin: PhotoImportPin; bytes: Uint8Array },
  dependencies: {
    hash(bytes: Uint8Array): Promise<string>;
    extract(bytes: Uint8Array, mediaType: string): Promise<CaptureLocalExtraction>;
  },
  signal?: AbortSignal,
): Promise<PhotoImportDecision> {
  const pin = photoImportPinSchema.parse(original.pin);
  if (!(original.bytes instanceof Uint8Array) || original.bytes.length !== pin.byteCount)
    throw new Error("PHOTO_IMPORT_ORIGINAL_CHANGED");
  const bytes = new Uint8Array(original.bytes);
  const current = () => {
    if (signal?.aborted) throw new Error("PHOTO_IMPORT_CANCELLED");
  };
  current();
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (
    bytes.length !== pin.byteCount ||
    (await dependencies.hash(bytes)) !== pin.sha256 ||
    !(pin.mediaType === "image/png" ? png : jpeg)
  )
    throw new Error("PHOTO_IMPORT_ORIGINAL_CHANGED");
  current();
  let extraction: CaptureLocalExtraction;
  try {
    extraction = await dependencies.extract(new Uint8Array(bytes), pin.mediaType);
  } catch (error) {
    current();
    if (error instanceof Error && error.message === "CAPTURE_ORIGINAL_MISMATCH")
      throw new Error("PHOTO_IMPORT_ORIGINAL_CHANGED");
    return {
      version: 1,
      pin,
      relevance: { status: "UNCERTAIN", reason: "OCR_UNAVAILABLE" },
      choice: "UNDECIDED",
    };
  }
  current();
  if (
    extraction.originalSha256 !== pin.sha256 ||
    extraction.originalByteCount !== pin.byteCount ||
    extraction.engine !== "apple-vision"
  )
    throw new Error("PHOTO_IMPORT_ORIGINAL_CHANGED");
  return {
    version: 1,
    pin,
    relevance: screenPhotoImportRelevance(extraction.observations),
    choice: "UNDECIDED",
  };
}
