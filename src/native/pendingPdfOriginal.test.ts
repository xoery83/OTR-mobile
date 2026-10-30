import { expect, it, vi } from "vitest";
import { createPendingPdfOriginalFormatVerifier } from "./pendingPdfOriginal";
vi.mock("./captureLocalExtraction", () => ({ extractCaptureLocal: vi.fn() }));
it("uses existing PDFKit format/integrity only and discards all locally extracted fields", async () => {
  const bytes = new TextEncoder().encode("%PDF-synthetic-protocol"),
    extract = vi.fn(async () => ({
      engine: "apple-pdfkit" as const,
      originalSha256: "a".repeat(64),
      originalByteCount: bytes.length,
      text: "This local text never becomes a Candidate",
      pages: [],
    }));
  const result = await createPendingPdfOriginalFormatVerifier(extract)(bytes);
  expect(extract).toHaveBeenCalledExactlyOnceWith(bytes, "application/pdf");
  expect(result).toEqual({
    mimeType: "application/pdf",
    profileId: "OTR_PDF_CAPTURE_ORIGINAL_V1",
    payloadSha256: "a".repeat(64),
    byteCount: bytes.length,
  });
  expect(result).not.toHaveProperty("text");
});
it("has no OCR/header fallback and closes on unsupported native format", async () => {
  const extract = vi.fn(async () => {
    throw Error("CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE");
  });
  await expect(
    createPendingPdfOriginalFormatVerifier(extract)(new Uint8Array([1])),
  ).rejects.toThrow("CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE");
});
it("rejects another engine or changed original size", async () => {
  const bytes = new Uint8Array([1]);
  for (const result of [
    { engine: "apple-vision", originalByteCount: 1 },
    { engine: "apple-pdfkit", originalByteCount: 2 },
  ]) {
    await expect(
      createPendingPdfOriginalFormatVerifier(
        async () =>
          ({ ...result, originalSha256: "a".repeat(64), text: "irrelevant" }) as never,
      )(bytes),
    ).rejects.toThrow("CAPTURE_SOURCE_FORMAT_UNAVAILABLE");
  }
});
