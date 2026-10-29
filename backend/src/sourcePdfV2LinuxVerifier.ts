import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import {
  flightPdfExtractionSchema,
  validatePdfExtractionContent,
} from "../../src/data/interpretation/flightPdfExtraction";
import { profile } from "../../scripts/source-pdf-v2-linux/profile.mjs";
import type { SourcePdfCustodyReader } from "./sourcePdfAuthority";
import {
  runSourcePdfV2LinuxWorker,
  SOURCE_PDF_V2_LINUX_IMAGE,
} from "./sourcePdfV2LinuxWorker";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const SOURCE_PDF_V2_LINUX_PROFILE = Object.freeze({
  ...profile,
  imageId: SOURCE_PDF_V2_LINUX_IMAGE,
});
export const SOURCE_PDF_V2_LINUX_PROFILE_SHA = hash(
  canonicalCoreJson(SOURCE_PDF_V2_LINUX_PROFILE),
);
const scopeSchema = z.strictObject({
  accountId: z.uuid(),
  tripId: z.uuid(),
  sourceId: z.uuid(),
  representationId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z.number().int().positive().max(profile.maxOriginalBytes),
});
const extractionSchema = flightPdfExtractionSchema.extend({
  engine: z.literal("qpdf-poppler"),
  toleratedUnreferencedZeroOffsetObjects: z
    .array(z.string().regex(/^[1-9][0-9]* [0-9]+ R$/))
    .max(32),
});
// A verified producer result is not a Source registration or Canonical proof.
export function createSourcePdfV2LinuxVerifier(
  readOriginal: SourcePdfCustodyReader,
  runWorker = runSourcePdfV2LinuxWorker,
) {
  return async (supplied: Parameters<SourcePdfCustodyReader>[0]) => {
    const scope = Object.freeze(scopeSchema.parse(supplied));
    async function read() {
      let bytes: Uint8Array;
      try {
        bytes = await readOriginal(scope);
      } catch {
        throw new Error("PDF_V2_CUSTODY_UNAVAILABLE");
      }
      if (
        !(bytes instanceof Uint8Array) ||
        bytes.length !== scope.byteCount ||
        hash(bytes) !== scope.sha256
      )
        throw new Error("PDF_V2_ORIGINAL_MISMATCH");
      return new Uint8Array(bytes);
    }
    const result = await verifySourcePdfV2LinuxBytes(await read(), runWorker);
    await read();
    return result;
  };
}

// Pending acquisition validates owned bytes before a Source exists; it mints no Source identity.
export async function verifySourcePdfV2LinuxBytes(
  bytes: Uint8Array,
  runWorker = runSourcePdfV2LinuxWorker,
) {
  const owned = new Uint8Array(bytes);
  if (!owned.length || owned.length > profile.maxOriginalBytes)
    throw Error("PDF_V2_INPUT_LIMIT");
  const expected = { sha256: hash(owned), byteCount: owned.length };
  const decoded = extractionSchema.parse(await runWorker(owned));
  const { toleratedUnreferencedZeroOffsetObjects, ...extraction } = decoded;
  const result = await validatePdfExtractionContent(extraction, expected, async (b) =>
    hash(b),
  );
  return {
    ...result,
    profileId: profile.id,
    profileSha256: SOURCE_PDF_V2_LINUX_PROFILE_SHA,
    producer: profile.producer,
    transformKey: "otr.pdf.qpdf-poppler",
    transformVersion: "2",
    transformOptionsSha256: hash(profile.textPolicy),
    pageMapSha256: hash(canonicalCoreJson(result.pages)),
    toleratedUnreferencedZeroOffsetObjects,
  };
}
