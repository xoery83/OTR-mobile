import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { runSourcePdfV2LinuxWorker } from "./sourcePdfV2LinuxWorker";
import {
  createSourcePdfV2LinuxVerifier,
  verifySourcePdfV2LinuxBytes,
} from "./sourcePdfV2LinuxVerifier";
vi.mock("./sourcePdfV2LinuxWorker", () => ({
  SOURCE_PDF_V2_LINUX_IMAGE: "sha256:" + "a".repeat(64),
  runSourcePdfV2LinuxWorker: vi.fn(),
}));
const bytes = new TextEncoder().encode("%PDF-synthetic");
const scope = {
  accountId: randomUUID(),
  tripId: randomUUID(),
  sourceId: randomUUID(),
  representationId: randomUUID(),
  sha256: createHash("sha256").update(bytes).digest("hex"),
  byteCount: bytes.length,
};
const extraction = () => ({
  engine: "qpdf-poppler",
  version: 1,
  originalSha256: scope.sha256,
  originalByteCount: bytes.length,
  text: "NZ5069",
  pages: [{ pageIndex: 0, start: 0, end: 6 }],
  toleratedUnreferencedZeroOffsetObjects: [],
});
beforeEach(() =>
  vi.mocked(runSourcePdfV2LinuxWorker).mockReset().mockResolvedValue(extraction()),
);
it("independently reads twice and validates the separate producer text identity", async () => {
  const read = vi.fn().mockResolvedValue(bytes);
  const result = await createSourcePdfV2LinuxVerifier(read)(scope);
  expect(read).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({
    engine: "qpdf-poppler",
    producer: "otr-source-pdf-qpdf-poppler/2",
    transformVersion: "2",
    textByteCount: 6,
  });
  expect(result).not.toHaveProperty("grantsSourceAuthority");
});
it("wrong initial pin does not execute a decoder", async () => {
  await expect(
    createSourcePdfV2LinuxVerifier(async () => new Uint8Array(1))(scope),
  ).rejects.toThrow("PDF_V2_ORIGINAL_MISMATCH");
  expect(runSourcePdfV2LinuxWorker).not.toHaveBeenCalled();
});
it("rejects custody changes after decoding", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(bytes)
    .mockResolvedValueOnce(new Uint8Array(1));
  await expect(createSourcePdfV2LinuxVerifier(read)(scope)).rejects.toThrow(
    "PDF_V2_ORIGINAL_MISMATCH",
  );
});
it.each(["engine", "page", "pin", "unknown"])(
  "rejects malformed %s output rather than granting a seal",
  async (failure) => {
    const value: any = extraction();
    if (failure === "engine") value.engine = "apple-pdfkit";
    if (failure === "page") value.pages[0].end = 3;
    if (failure === "pin") value.originalSha256 = "b".repeat(64);
    if (failure === "unknown") value.sourceAuthority = true;
    vi.mocked(runSourcePdfV2LinuxWorker).mockResolvedValue(value);
    await expect(
      createSourcePdfV2LinuxVerifier(async () => bytes)(scope),
    ).rejects.toThrow();
  },
);
it("contains reader private errors", async () => {
  await expect(
    createSourcePdfV2LinuxVerifier(async () => {
      throw Error("private");
    })(scope),
  ).rejects.toThrow(/^PDF_V2_CUSTODY_UNAVAILABLE$/);
});

it("an explicitly composed private worker still requires both original reads and exact producer output", async () => {
  const read = vi.fn().mockResolvedValue(bytes);
  const worker = vi.fn().mockResolvedValue(extraction());
  const result = await createSourcePdfV2LinuxVerifier(read, worker)(scope);
  expect(result.text).toBe("NZ5069");
  expect(read).toHaveBeenCalledTimes(2);
  expect(worker).toHaveBeenCalledExactlyOnceWith(bytes);
  expect(runSourcePdfV2LinuxWorker).not.toHaveBeenCalled();
  worker.mockResolvedValueOnce({ testOnlyTransportResult: true });
  await expect(createSourcePdfV2LinuxVerifier(read, worker)(scope)).rejects.toThrow();
});

it("pins acquisition bytes before asynchronous worker work and preserves the caller original", async () => {
  const original = new Uint8Array(bytes);
  await expect(
    verifySourcePdfV2LinuxBytes(original, async (owned) => {
      owned.fill(0);
      return {
        ...extraction(),
        originalSha256: createHash("sha256").update(owned).digest("hex"),
      };
    }),
  ).rejects.toThrow();
  expect(original).toEqual(bytes);
});
