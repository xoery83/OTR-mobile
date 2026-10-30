import { PDF_V2_OPTIONS_SHA } from "../../src/domain/trip/sourcePdfV2Contracts";
import { PDF_UPLOAD_QPDF_V4 } from "../../src/domain/trip/sourcePdfV2Upload";
import { createHash } from "node:crypto";
import { profile } from "../../scripts/source-pdf-v2-linux/profile.mjs";
import { SOURCE_PDF_V2_LINUX_PROFILE_SHA } from "./sourcePdfV2LinuxVerifier";
export * from "../../src/domain/trip/sourcePdfV2Contracts";

// Optional PDF construction only: profile drift cannot activate a different issuer.
export function assertSourcePdfV2Profile() {
  if (
    SOURCE_PDF_V2_LINUX_PROFILE_SHA !== PDF_UPLOAD_QPDF_V4.decoderProfileSha256 ||
    createHash("sha256").update(profile.textPolicy).digest("hex") !== PDF_V2_OPTIONS_SHA
  )
    throw Error("PDF_V2_PROFILE_MISMATCH");
}
