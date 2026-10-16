import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { validateFlightPdfExtraction } from "../../src/data/interpretation/flightPdfExtraction";
import type { SourcePdfCustodyReader } from "./sourcePdfAuthority";

// Additive local profile only; never accepted by the /1 registration/seal writer.
// Contract: docs/trip/contracts/CP_FLIGHT_PDF_SOURCE_V2_LOCAL.md.
export const PDF_V2_LOCAL_PROFILE = Object.freeze({
  id: "OTR_PDF_SELECTABLE_TEXT_V2",
  version: 2,
  component: "apple-pdfkit",
  maxOriginalBytes: 10485760,
  maxPages: 32,
  maxTextBytes: 262144,
  separator: "LF",
  pageIndexBase: 0,
  wallTimeoutMs: 20000,
  maxProcessOutputBytes: 1048576,
  sourceAuthority: "NONE",
});
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const PDF_V2_LOCAL_PROFILE_SHA = digest(canonicalCoreJson(PDF_V2_LOCAL_PROFILE));
const pinSchema = z.strictObject({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z.number().int().positive().max(PDF_V2_LOCAL_PROFILE.maxOriginalBytes),
});
const scopeSchema = pinSchema.extend({
  accountId: z.uuid(),
  tripId: z.uuid(),
  sourceId: z.uuid(),
  representationId: z.uuid(),
});
type Pin = z.infer<typeof pinSchema>;
export type PdfV2IndependentDecoder = (ownedBytes: Uint8Array) => Promise<unknown>;
function checkOriginal(bytes: Uint8Array, pin: Pin) {
  if (
    !(bytes instanceof Uint8Array) ||
    !Number.isSafeInteger(pin.byteCount) ||
    pin.byteCount < 1 ||
    pin.byteCount > PDF_V2_LOCAL_PROFILE.maxOriginalBytes ||
    !/^[a-f0-9]{64}$/.test(pin.sha256) ||
    bytes.length !== pin.byteCount ||
    digest(bytes) !== pin.sha256
  )
    throw new Error("PDF_V2_ORIGINAL_MISMATCH");
  if (!Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from("%PDF-")))
    throw new Error("PDF_V2_FORMAT_UNSUPPORTED");
}

// The decoder is composed by the local operator/server, never from client JSON.
// Its parse success is deliberately insufficient for any Source write authority.
export async function derivePdfV2Local(
  bytes: Uint8Array,
  pin: Pin,
  decode: PdfV2IndependentDecoder,
) {
  checkOriginal(bytes, pin);
  const owned = new Uint8Array(bytes);
  let raw: unknown;
  try {
    raw = await decode(new Uint8Array(owned));
  } catch {
    throw new Error("PDF_V2_DECODE_FAILED");
  }
  let extraction;
  try {
    extraction = await validateFlightPdfExtraction(raw, pin, async (b) => digest(b));
    // Reject ill-formed Unicode rather than silently replacing it during UTF-8 hashing.
    if (
      new TextDecoder("utf-8", { fatal: true }).decode(
        new TextEncoder().encode(extraction.text),
      ) !== extraction.text
    )
      throw new Error();
  } catch {
    throw new Error("PDF_V2_DERIVATION_INVALID");
  }
  checkOriginal(owned, pin);
  return {
    profileId: PDF_V2_LOCAL_PROFILE.id,
    profileSha256: PDF_V2_LOCAL_PROFILE_SHA,
    originalSha256: pin.sha256,
    originalByteCount: pin.byteCount,
    text: extraction.text,
    textSha256: extraction.textSha256,
    textByteCount: extraction.textByteCount,
    pages: extraction.pages,
    pageMapSha256: digest(canonicalCoreJson(extraction.pages)),
    component: "apple-pdfkit" as const,
    grantsSourceAuthority: false as const,
    runtimeStatus: "BLOCKED_TRUSTED_DECODER" as const,
    missingProofs: [
      "COMPLETE_CONTAINER_VALIDATION",
      "DEPLOYMENT_DECODER_ATTESTATION",
      "ENFORCED_SANDBOX_RESOURCE_LIMITS",
    ],
  };
}

export function createSourcePdfV2LocalVerifier(
  readOriginal: SourcePdfCustodyReader,
  decode: PdfV2IndependentDecoder,
) {
  async function read(scope: Parameters<SourcePdfCustodyReader>[0]) {
    try {
      return await readOriginal(scope);
    } catch {
      throw new Error("PDF_V2_CUSTODY_UNAVAILABLE");
    }
  }
  return async (scope: Parameters<SourcePdfCustodyReader>[0]) => {
    // Preserve the existing owning reader boundary and recheck bytes after decode.
    // No caller-supplied text/proof and no storage-key alias or new byte store.
    let current: Parameters<SourcePdfCustodyReader>[0];
    try {
      current = Object.freeze(scopeSchema.parse(scope));
    } catch {
      throw new Error("PDF_V2_SCOPE_INVALID");
    }
    const pin = { sha256: current.sha256, byteCount: current.byteCount };
    const result = await derivePdfV2Local(await read(current), pin, decode);
    checkOriginal(await read(current), pin);
    return result;
  };
}
