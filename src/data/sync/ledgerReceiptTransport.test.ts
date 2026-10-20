import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("expo/fetch", () => ({ fetch: fetchMock }));
vi.mock("@/data/auth/sessionAccessToken", () => ({
  sessionAccessToken: async () => ({ token: "test-token" }),
}));
vi.mock("@/data/api/authenticatedClient", () => ({
  createAuthenticatedApiClient: () => ({}),
}));
vi.mock("@/data/files/receiptFileStore", () => ({ resolveReceiptFile: vi.fn() }));

// eslint-disable-next-line import/first
import { createLedgerReceiptTransport } from "./ledgerReceiptTransport";

describe("receipt remote stat transport", () => {
  const previous = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
  afterEach(() => {
    process.env.EXPO_PUBLIC_OTR_API_BASE_URL = previous;
    fetchMock.mockReset();
  });

  it("requires authenticated exact metadata from HEAD", async () => {
    process.env.EXPO_PUBLIC_OTR_API_BASE_URL = "https://dev.example";
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "Content-Length": "3",
          "Content-Type": "image/jpeg",
          "X-OTR-SHA-256": "a".repeat(64),
          "X-OTR-Object-Key": "journey/receipt/original",
        },
      }),
    );
    await expect(
      createLedgerReceiptTransport().stat("journey", "receipt"),
    ).resolves.toEqual({
      sizeBytes: 3,
      mimeType: "image/jpeg",
      sha256: "a".repeat(64),
      objectPath: "journey/receipt/original",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.example/v2/trips/journey/receipts/receipt/content",
      { method: "HEAD", headers: { Authorization: "Bearer test-token" } },
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(
      createLedgerReceiptTransport().stat("journey", "receipt"),
    ).rejects.toMatchObject({ kind: "validation" });
  });
});
