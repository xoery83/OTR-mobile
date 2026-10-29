import { PDF_UPLOAD_QPDF_V4 } from "../../src/domain/trip/sourcePdfV2Upload";
import { verifySourcePdfV2LinuxBytes } from "./sourcePdfV2LinuxVerifier";

export async function verifySourcePdfV2UploadBytes(
  bytes: Uint8Array,
  runWorker?: Parameters<typeof verifySourcePdfV2LinuxBytes>[1],
) {
  const result = await verifySourcePdfV2LinuxBytes(bytes, runWorker);
  if (
    result.profileId !== PDF_UPLOAD_QPDF_V4.decoderProfileId ||
    result.profileSha256 !== PDF_UPLOAD_QPDF_V4.decoderProfileSha256
  )
    throw new Error("PDF_V2_UPLOAD_PROFILE_MISMATCH");
  return result;
}
