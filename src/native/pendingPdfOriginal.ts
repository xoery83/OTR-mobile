import { extractCaptureLocal } from "./captureLocalExtraction";
import { PDF_CAPTURE_ORIGINAL_PROFILE } from "@/domain/trip/sourcePdfPreparation";

// Format/integrity only. Ignore local text; Backend QPDF still owns the derivative/seal.
export function createPendingPdfOriginalFormatVerifier(extract = extractCaptureLocal) {
  return async (bytes: Uint8Array) => {
    if (!bytes.length || bytes.length > 4194304)
      throw Error("CAPTURE_SOURCE_FORMAT_UNAVAILABLE");
    const result = await extract(new Uint8Array(bytes), "application/pdf");
    if (result.engine !== "apple-pdfkit" || result.originalByteCount !== bytes.length)
      throw Error("CAPTURE_SOURCE_FORMAT_UNAVAILABLE");
    return {
      mimeType: "application/pdf" as const,
      profileId: PDF_CAPTURE_ORIGINAL_PROFILE,
      payloadSha256: result.originalSha256,
      byteCount: result.originalByteCount,
    };
  };
}
