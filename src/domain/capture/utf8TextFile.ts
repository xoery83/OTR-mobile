import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";

// Candidate owning profile; it never converts a PDF/extracted text into a new
// original. The FILE/FILES identity, filename and exact supplied bytes survive.
export const UTF8_TEXT_FILE_PROFILE = "OTR_UTF8_TEXT_FILE_V1" as const;
export function verifyUtf8TextFile(
  bytes: Uint8Array,
  originalFilename: string | null,
  declaredContentType: string | null,
) {
  if (
    !originalFilename ||
    originalFilename.length > 255 ||
    originalFilename.includes("\0") ||
    !/\.txt$/i.test(originalFilename) ||
    declaredContentType !== "text/plain" ||
    !(bytes instanceof Uint8Array) ||
    bytes.length < 1 ||
    bytes.length > 262144
  )
    throw new Error("UTF8_TEXT_FILE_UNSUPPORTED");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("UTF8_TEXT_FILE_UNSUPPORTED");
  }
  if (text.includes("\0") || text.replace(/^\ufeff/, "").startsWith("%PDF-"))
    throw new Error("UTF8_TEXT_FILE_UNSUPPORTED");
  return {
    profileId: UTF8_TEXT_FILE_PROFILE,
    originalFilename,
    byteCount: bytes.length,
    payloadSha256: bytesToHex(sha256(bytes)),
    text,
  };
}
