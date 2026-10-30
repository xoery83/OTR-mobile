import { PNG_CAPTURE_ORIGINAL_PROFILE } from "@/domain/trip/sourcePngPreparation";
import type { ImportHash } from "@/domain/trip/flightImportReview";

// Signature and retained-byte identity only, never PNG_STATIC or decoded-format proof.
export function createPendingPngOriginalIntakeVerifier(hash: ImportHash) {
  return async (bytes: Uint8Array) => {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.length <= signature.length ||
      bytes.length > 4194304 ||
      signature.some((byte, index) => bytes[index] !== byte)
    )
      throw Error("CAPTURE_SOURCE_FORMAT_UNAVAILABLE");
    return {
      mimeType: "image/png" as const,
      profileId: PNG_CAPTURE_ORIGINAL_PROFILE,
      payloadSha256: await hash(new Uint8Array(bytes)),
      byteCount: bytes.length,
    };
  };
}
