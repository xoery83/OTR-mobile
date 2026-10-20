import { z } from "zod";
import type { CaptureSha256 } from "../files/capturePayloadReader";

export const flightPdfExtractionSchema = z.strictObject({
  engine: z.literal("apple-pdfkit"),
  version: z.literal(1),
  originalSha256: z.string().regex(/^[0-9a-f]{64}$/),
  originalByteCount: z.number().int().min(1).max(10485760),
  text: z
    .string()
    .min(1)
    .max(262144)
    .refine(
      (text) => !text.includes("\0") && new TextEncoder().encode(text).length <= 262144,
    ),
  pages: z
    .array(
      z.strictObject({
        pageIndex: z.number().int().min(0).max(31),
        start: z.number().int().min(0).max(262144),
        end: z.number().int().positive().max(262144),
      }),
    )
    .min(1)
    .max(32),
});
export type FlightPdfExtraction = z.infer<typeof flightPdfExtractionSchema>;
export type FlightPdfExtract = (bytes: Uint8Array) => Promise<unknown>;

export async function validateFlightPdfExtraction(
  raw: unknown,
  original: { sha256: string; byteCount: number },
  hash: CaptureSha256,
) {
  const extraction = flightPdfExtractionSchema.parse(raw);
  if (
    extraction.originalSha256 !== original.sha256 ||
    extraction.originalByteCount !== original.byteCount
  )
    throw new Error("PDF_ORIGINAL_MISMATCH");
  const bytes = new TextEncoder().encode(extraction.text);
  let end = 0;
  for (const [index, page] of extraction.pages.entries()) {
    if (
      page.pageIndex !== index ||
      page.start !== end ||
      page.end <= page.start ||
      page.end > bytes.length
    )
      throw new Error("PDF_PAGE_MAPPING_INVALID");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.slice(page.start, page.end),
    );
    if (!text.trim()) throw new Error("PDF_PAGE_MAPPING_INVALID");
    end = page.end;
    if (index + 1 < extraction.pages.length) {
      if (bytes[end] !== 10) throw new Error("PDF_PAGE_MAPPING_INVALID");
      end++;
    }
  }
  if (end !== bytes.length) throw new Error("PDF_PAGE_MAPPING_INVALID");
  return { ...extraction, textSha256: await hash(bytes), textByteCount: bytes.length };
}

// Return all intersecting pages. Cross-page evidence never becomes an invented region.
export function flightPdfEvidencePages(
  extraction: FlightPdfExtraction,
  start: number,
  end: number,
) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > new TextEncoder().encode(extraction.text).length
  )
    throw new Error("PDF_EVIDENCE_RANGE_INVALID");
  return extraction.pages
    .filter((page) => page.start < end && page.end > start)
    .map((page) => page.pageIndex);
}
