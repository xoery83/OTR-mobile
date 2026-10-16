import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  validateFlightPdfExtraction,
  validatePdfExtractionContent,
  flightPdfExtractionSchema,
} from "./flightPdfExtraction";
import { z } from "zod";
const sha = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const pin = { sha256: "a".repeat(64), byteCount: 10 };
const value = {
  engine: "qpdf-poppler",
  version: 1 as const,
  originalSha256: pin.sha256,
  originalByteCount: pin.byteCount,
  text: "甲\nβ",
  pages: [
    { pageIndex: 0, start: 0, end: 3 },
    { pageIndex: 1, start: 4, end: 6 },
  ],
};
it("shares UTF8 proof without widening the Native PDFKit engine allowlist", async () => {
  await expect(validateFlightPdfExtraction(value, pin, sha)).rejects.toThrow();
  const parsed = flightPdfExtractionSchema
    .extend({ engine: z.literal("qpdf-poppler") })
    .parse(value);
  expect(await validatePdfExtractionContent(parsed, pin, sha)).toMatchObject({
    engine: "qpdf-poppler",
    textByteCount: 6,
  });
});
it("rejects wrong pin, cross-codepoint boundaries and missing LF in every engine", async () => {
  await expect(
    validatePdfExtractionContent(value, { ...pin, byteCount: 11 }, sha),
  ).rejects.toThrow("PDF_ORIGINAL_MISMATCH");
  await expect(
    validatePdfExtractionContent(
      {
        ...value,
        pages: [
          { pageIndex: 0, start: 0, end: 2 },
          { pageIndex: 1, start: 3, end: 6 },
        ],
      },
      pin,
      sha,
    ),
  ).rejects.toThrow();
  await expect(
    validatePdfExtractionContent({ ...value, text: "甲Xβ" }, pin, sha),
  ).rejects.toThrow("PDF_PAGE_MAPPING_INVALID");
});
