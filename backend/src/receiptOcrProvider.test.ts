import { describe, expect, it, vi } from "vitest";
import { extractReceiptSuggestion } from "./receiptOcrProvider";

describe("receipt OCR boundary", () => {
  it("returns structured suggestions and rejects raw/unbounded provider output", async () => {
    const provider = {
      extract: vi.fn(async () => ({
        title: "Cafe",
        amountMinor: 8640,
        currency: "EUR",
        occurredAt: "2026-09-08T12:00:00Z",
        category: "food",
      })),
    };
    await expect(
      extractReceiptSuggestion(provider, {
        bytes: new Uint8Array([1]),
        mimeType: "image/jpeg",
      }),
    ).resolves.toMatchObject({ amountMinor: 8640, currency: "EUR" });
    expect(provider.extract).toHaveBeenCalledOnce();
  });
});
