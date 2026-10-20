import { describe, expect, it, vi } from "vitest";
import {
  createReceiptOcrProvider,
  parseOcrDocument,
  ReceiptOcrError,
} from "./receiptOcr";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo", () => ({ requireNativeModule: vi.fn() }));

const result = {
  engine: "apple-vision",
  engineRevision: 3,
  imageWidth: 1200,
  imageHeight: 800,
  durationMs: 41,
  supportedLanguages: ["en-US", "ja-JP"],
  observations: [
    {
      text: "SYNTHETIC RECEIPT",
      confidence: 0.82,
      boundingBox: { x: 0.2, y: 0.1, width: 0.4, height: 0.05 },
    },
  ],
};

describe("local receipt OCR boundary", () => {
  it("preserves top-left geometry, confidence, and empty results", () => {
    expect(parseOcrDocument(result)).toEqual(result);
    expect(parseOcrDocument({ ...result, observations: [] }).observations).toEqual([]);
    expect(
      parseOcrDocument({
        ...result,
        observations: [
          {
            ...result.observations[0],
            boundingBox: { x: 0, y: -0.0000005, width: 1, height: 1 },
          },
        ],
      }).observations[0].boundingBox.y,
    ).toBe(0);
  });

  it("rejects malformed native results without exposing their contents", () => {
    for (const bad of [
      { ...result, imageWidth: 0 },
      { ...result, observations: [{ ...result.observations[0], confidence: 1.2 }] },
      {
        ...result,
        observations: [
          {
            ...result.observations[0],
            boundingBox: { x: 0.9, y: 0, width: 0.2, height: 0.1 },
          },
        ],
      },
      {
        ...result,
        observations: [
          {
            ...result.observations[0],
            boundingBox: { x: 0, y: 0, width: NaN, height: 0.1 },
          },
        ],
      },
    ])
      expect(() => parseOcrDocument(bad)).toThrowError(
        new ReceiptOcrError("MALFORMED_RESULT"),
      );
  });

  it("is local, maps stable errors, and cancels stale work", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const native = {
      recognize: vi.fn(async () => result),
      cancel: vi.fn(),
      capabilities: vi.fn(async () => ({
        engineRevision: 3,
        supportedLanguages: ["en-US"],
      })),
    };
    const provider = createReceiptOcrProvider("ios", native);
    expect(await provider.recognize({ uri: "file:///local/receipt.jpg" })).toEqual(
      result,
    );
    expect(await provider.capabilities()).toEqual({
      engineRevision: 3,
      supportedLanguages: ["en-US"],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(
      provider.recognize({ uri: "https://example.com/receipt.jpg" }),
    ).rejects.toMatchObject({ code: "INVALID_FILE" });
    native.recognize.mockResolvedValueOnce({ error: "UNSUPPORTED_IMAGE" } as never);
    await expect(provider.recognize({ uri: "file:///local/bad" })).rejects.toMatchObject({
      code: "UNSUPPORTED_IMAGE",
    });
    const controller = new AbortController();
    native.recognize.mockImplementationOnce(async () => {
      controller.abort();
      return result;
    });
    await expect(
      provider.recognize({ uri: "file:///local/receipt.jpg", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(native.cancel).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("fails deterministically outside iOS without reaching native or network", async () => {
    const native = { recognize: vi.fn(), cancel: vi.fn(), capabilities: vi.fn() };
    await expect(
      createReceiptOcrProvider("android", native).recognize({
        uri: "file:///receipt.jpg",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_PLATFORM" });
    expect(native.recognize).not.toHaveBeenCalled();
  });
});
