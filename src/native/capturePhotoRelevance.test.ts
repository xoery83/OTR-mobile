import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { screenCapturePhotoRelevance } from "./capturePhotoRelevance";
import { resolvePhotoImportDecision } from "@/domain/capture/photoImportRelevance";

const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const bytes = Uint8Array.of(255, 216, 255, 1, 2);
  const pin = {
    accountId: "account-a",
    batchId: "11111111-1111-4111-8111-111111111111",
    inputId: "22222222-2222-4222-8222-222222222222",
    ordinal: 0,
    captureId: "capture-a",
    captureRevision: 1,
    payloadId: "payload-a",
    sha256: await hash(bytes),
    byteCount: bytes.length,
    mediaType: "image/jpeg" as const,
  };
  const extraction = {
    engine: "apple-vision" as const,
    text: "Hotel reservation",
    originalSha256: pin.sha256,
    originalByteCount: bytes.length,
    observations: [
      {
        text: "Hotel reservation",
        confidence: 0.95,
        boundingBox: { x: 0, y: 0, width: 1, height: 0.1 },
      },
    ],
  };
  const extract = vi.fn(async (_bytes: Uint8Array, _mediaType: string) => extraction);
  return { bytes, pin, extraction, extract };
}
it("screens hash-bound fixture bytes through the existing OCR interface without network, candidates or text-only model material", async () => {
  const f = await fixture();
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    const result = await screenCapturePhotoRelevance(f, { hash, extract: f.extract });
    expect(result).toEqual({
      version: 1,
      pin: f.pin,
      relevance: { status: "RELEVANT", reason: "TRAVEL_TEXT_CLUE" },
      choice: "UNDECIDED",
    });
    expect(f.extract).toHaveBeenCalledWith(f.bytes, "image/jpeg");
    expect(f.extract.mock.calls[0][0]).not.toBe(f.bytes);
    expect(resolvePhotoImportDecision(result, f.pin)).toBe("QUALIFY_ORIGINAL_IMAGE");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
it("maps unavailable/empty/failed OCR to uncertain without calling a different parser", async () => {
  const f = await fixture();
  f.extract.mockRejectedValueOnce(new Error("CAPTURE_LOCAL_EXTRACTION_FAILED"));
  expect(
    (await screenCapturePhotoRelevance(f, { hash, extract: f.extract })).relevance,
  ).toEqual({ status: "UNCERTAIN", reason: "OCR_UNAVAILABLE" });
  f.extract.mockResolvedValueOnce({ ...f.extraction, text: "", observations: [] });
  expect(
    (await screenCapturePhotoRelevance(f, { hash, extract: f.extract })).relevance.status,
  ).toBe("UNCERTAIN");
  expect(f.extract).toHaveBeenCalledTimes(2);
});
it("rejects changed bytes, hash, size and MIME before native work", async () => {
  const f = await fixture();
  for (const original of [
    { ...f, bytes: Uint8Array.of(255, 216, 255, 9, 9) },
    { ...f, pin: { ...f.pin, sha256: "b".repeat(64) } },
    { ...f, pin: { ...f.pin, byteCount: 1 } },
    { ...f, pin: { ...f.pin, mediaType: "image/png" as const } },
  ])
    await expect(
      screenCapturePhotoRelevance(original, { hash, extract: f.extract }),
    ).rejects.toThrow("PHOTO_IMPORT_ORIGINAL_CHANGED");
  expect(f.extract).not.toHaveBeenCalled();
});
it("does not degrade native original mismatches to a Continue-able uncertain result", async () => {
  const f = await fixture();
  f.extract.mockRejectedValueOnce(new Error("CAPTURE_ORIGINAL_MISMATCH"));
  await expect(
    screenCapturePhotoRelevance(f, { hash, extract: f.extract }),
  ).rejects.toThrow("PHOTO_IMPORT_ORIGINAL_CHANGED");
  f.extract.mockResolvedValueOnce({ ...f.extraction, originalSha256: "b".repeat(64) });
  await expect(
    screenCapturePhotoRelevance(f, { hash, extract: f.extract }),
  ).rejects.toThrow("PHOTO_IMPORT_ORIGINAL_CHANGED");
});
it("does not return a stale screen after cancellation", async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    screenCapturePhotoRelevance(f, { hash, extract: f.extract }, controller.signal),
  ).rejects.toThrow("PHOTO_IMPORT_CANCELLED");
  expect(f.extract).not.toHaveBeenCalled();
  const late = new AbortController();
  f.extract.mockImplementationOnce(async () => {
    late.abort();
    return f.extraction;
  });
  await expect(
    screenCapturePhotoRelevance(f, { hash, extract: f.extract }, late.signal),
  ).rejects.toThrow("PHOTO_IMPORT_CANCELLED");
});

it("isolates captured original bytes and pins from caller or extractor mutation", async () => {
  const f = await fixture();
  const before = { ...f.pin };
  f.extract.mockImplementationOnce(async (bytes) => {
    bytes[3] = 99;
    f.bytes[3] = 88;
    f.pin.payloadId = "changed-after-screen-start";
    return f.extraction;
  });
  const result = await screenCapturePhotoRelevance(f, { hash, extract: f.extract });
  expect(result.pin).toEqual(before);
  expect(() => resolvePhotoImportDecision(result, f.pin)).toThrow(
    "PHOTO_IMPORT_ORIGINAL_CHANGED",
  );
});
