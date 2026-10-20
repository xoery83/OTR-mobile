import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/data/api/client";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";

const state = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  download: vi.fn(),
  share: vi.fn(),
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache" } },
  Directory: class {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    create() {}
  },
  File: class {
    uri: string;
    constructor(parent: string | { uri: string }, name?: string) {
      this.uri = typeof parent === "string" ? parent : `${parent.uri}/${name}`;
    }
    get exists() {
      return state.files.has(this.uri);
    }
    write(bytes: Uint8Array) {
      state.files.set(this.uri, bytes);
    }
    async bytes() {
      return state.files.get(this.uri)!;
    }
  },
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: state.share,
}));
vi.mock("@/data/files/receiptFileStore", () => ({
  resolveReceiptFile: (uri: string) => ({ uri, exists: false }),
  receiptBytesSha256: async () => "a".repeat(64),
}));
vi.mock("@/data/sync/ledgerReceiptTransport", () => ({
  createLedgerReceiptTransport: () => ({ download: state.download }),
}));

// eslint-disable-next-line import/first
import { openReceiptAsset, resolveReceiptAssetUri } from "./openReceiptAsset";

const receipt = {
  id: "local",
  serverId: "server",
  journeyId: "journey",
  localUri: null,
  sizeBytes: 3,
  sha256: "a".repeat(64),
  mimeType: "image/jpeg",
  uploadStatus: "UPLOADED",
  deletedAt: null,
} as ReceiptAsset;

describe("opening an evicted receipt", () => {
  beforeEach(() => {
    state.files.clear();
    state.download.mockReset();
    state.share.mockReset();
  });

  it("downloads authenticated bytes, verifies and opens without creating a receipt", async () => {
    state.download.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    await openReceiptAsset(receipt);
    expect(state.download).toHaveBeenCalledWith("journey", "server");
    expect(state.files.get("file:///cache/ledger-receipt-previews/server.jpg")).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
    expect(state.share).toHaveBeenCalledWith(
      "file:///cache/ledger-receipt-previews/server.jpg",
      {
        mimeType: "image/jpeg",
      },
    );
  });

  it("resolves verified bytes for preview without opening Share", async () => {
    state.download.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    expect(await resolveReceiptAssetUri(receipt)).toBe(
      "file:///cache/ledger-receipt-previews/server.jpg",
    );
    expect(state.share).not.toHaveBeenCalled();
  });

  it("reuses verified preview bytes after returning to the page, including offline", async () => {
    state.download.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    const uri = await resolveReceiptAssetUri(receipt);
    state.download.mockRejectedValue(new ApiClientError("offline", "network"));
    expect(await resolveReceiptAssetUri(receipt)).toBe(uri);
    expect(state.download).toHaveBeenCalledTimes(1);
    expect(state.share).not.toHaveBeenCalled();
  });

  it("redownloads invalid cached bytes rather than showing them", async () => {
    state.files.set(
      "file:///cache/ledger-receipt-previews/server.jpg",
      Uint8Array.from([1]),
    );
    state.download.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    await resolveReceiptAssetUri(receipt);
    expect(state.download).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing copy recoverable when offline and refuses tombstones", async () => {
    state.download.mockRejectedValue(new ApiClientError("offline", "network"));
    await expect(openReceiptAsset(receipt)).rejects.toThrow(
      "Connect to the internet to download this attachment again.",
    );
    expect(state.share).not.toHaveBeenCalled();
    await expect(openReceiptAsset({ ...receipt, deletedAt: "deleted" })).rejects.toThrow(
      "removed",
    );
    expect(state.download).toHaveBeenCalledTimes(1);
  });
});
