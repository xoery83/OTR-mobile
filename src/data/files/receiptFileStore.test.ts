import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTemporaryReceiptDraft,
  deleteTemporaryReceiptDraft,
  prepareReceiptDraft,
  sniffReceiptMime,
  pngHasTransparency,
  verifyReceiptFile,
  receiptFileEvidence,
  recordTemporaryReceiptDraft,
  listRecoverableReceiptDrafts,
} from "./receiptFileStore";

const files = vi.hoisted(() => new Map<string, Uint8Array>());
const native = vi.hoisted(() => ({ fail: false }));
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(parent: string | Directory, name: string) {
      this.uri = `${typeof parent === "string" ? parent : parent.uri}/${name}`;
    }
    create() {}
    get exists() {
      return [...files.keys()].some((key) => key.startsWith(`${this.uri}/`));
    }
    list() {
      return [...files.keys()]
        .filter(
          (key) =>
            key.startsWith(`${this.uri}/`) &&
            !key.slice(this.uri.length + 1).includes("/"),
        )
        .map((key) => new File(key));
    }
  }
  class File {
    uri: string;
    constructor(parent: string | Directory, name?: string) {
      this.uri = name
        ? `${typeof parent === "string" ? parent : parent.uri}/${name}`
        : typeof parent === "string"
          ? parent
          : parent.uri;
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.byteLength ?? 0;
    }
    get name() {
      return this.uri.split("/").at(-1);
    }
    async copy(destination: File, options: { overwrite: boolean }) {
      if (!options.overwrite && destination.exists) throw new Error("already exists");
      files.set(destination.uri, new Uint8Array(files.get(this.uri)!));
    }
    async bytes() {
      return files.get(this.uri)!;
    }
    create() {
      files.set(this.uri, new Uint8Array());
    }
    write(value: string) {
      files.set(this.uri, new TextEncoder().encode(value));
    }
    async text() {
      return new TextDecoder().decode(files.get(this.uri));
    }
    open() {
      return {
        readBytes: (length: number) => files.get(this.uri)!.slice(0, length),
        close() {},
      };
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return {
    Directory,
    File,
    FileMode: { ReadOnly: "r" },
    Paths: { document: "file:///docs" },
  };
});
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
  ImageManipulator: {
    manipulate: (source: string) => {
      const context = {
        resize: () => context,
        renderAsync: async () => {
          if (native.fail) throw new Error("native decode failed");
          return {
            width: source.includes("ledger-receipts/") ? 2200 : 3000,
            height: source.includes("ledger-receipts/") ? 1467 : 2000,
            saveAsync: async (options: { format: string }) => {
              const png = options.format === "png";
              const uri = png
                ? "file:///cache/normalized.png"
                : "file:///cache/normalized.jpg";
              files.set(
                uri,
                png
                  ? new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])
                  : new Uint8Array([255, 216, 255, 1, 2, 3]),
              );
              return { uri, width: 2200, height: 1467 };
            },
          };
        },
      };
      return context;
    },
  },
}));
vi.mock("expo-crypto", async () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digest: async (_: string, bytes: Uint8Array) => {
    if (!(bytes instanceof Uint8Array))
      throw new Error("Expo native digest requires a TypedArray");
    return Uint8Array.from(
      (await import("node:crypto")).createHash("sha256").update(bytes).digest(),
    ).buffer;
  },
}));

describe("receipt draft files", () => {
  beforeEach(() => {
    files.clear();
    native.fail = false;
    files.set("file:///picker/receipt.jpg", new Uint8Array([255, 216, 255, 0]));
  });

  it("selects and cancels without making a durable receipt file", async () => {
    const draft = await createTemporaryReceiptDraft({
      id: "draft-1",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "image/jpeg",
    });
    expect(draft.localUri).toBe("file:///docs/ledger-receipt-drafts/user-a/draft-1.jpg");
    expect([...files.keys()].filter((path) => path.includes("ledger-receipts/"))).toEqual(
      [],
    );
    deleteTemporaryReceiptDraft(draft);
    expect(files.has(draft.localUri)).toBe(false);
  });

  it("prepares a durable copy while retaining the only temporary source", async () => {
    const draft = await createTemporaryReceiptDraft({
      id: "draft-1",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "image/jpeg",
    });
    const prepared = await prepareReceiptDraft(draft);
    expect(files.has(draft.localUri)).toBe(true);
    expect(files.has(prepared.localUri)).toBe(true);
    expect(prepared).toMatchObject({
      id: draft.id,
      mimeType: "image/jpeg",
      originalSizeBytes: draft.sizeBytes,
    });
    expect(prepared.sizeBytes).toBe(6);
    deleteTemporaryReceiptDraft(draft);
    await expect(prepareReceiptDraft(draft)).rejects.toThrow("source is unavailable");
    expect(files.has(prepared.localUri)).toBe(true);
  });

  it("refuses to delete a path outside the draft's owned location", async () => {
    const draft = await createTemporaryReceiptDraft({
      id: "draft-1",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "image/jpeg",
    });
    expect(() =>
      deleteTemporaryReceiptDraft({ ...draft, localUri: "file:///picker/receipt.jpg" }),
    ).toThrow("path is invalid");
    expect(files.has("file:///picker/receipt.jpg")).toBe(true);
    expect(files.has(draft.localUri)).toBe(true);
  });

  it("rejects unsupported binary and MIME spoofing before making a draft", async () => {
    files.set("file:///picker/receipt.jpg", new Uint8Array([1, 2, 3]));
    await expect(
      createTemporaryReceiptDraft({
        id: "bad",
        ownerUserId: "user-a",
        sourceUri: "file:///picker/receipt.jpg",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow("Unsupported");
    files.set("file:///picker/receipt.jpg", new Uint8Array([255, 216, 255, 0]));
    await expect(
      createTemporaryReceiptDraft({
        id: "bad",
        ownerUserId: "user-a",
        sourceUri: "file:///picker/receipt.jpg",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow("does not match");
  });

  it("sniffs HEIC/HEIF and PNG transparency", () => {
    expect(
      sniffReceiptMime(
        new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 104, 101, 105, 99]),
      ),
    ).toBe("image/heic");
    expect(
      sniffReceiptMime(
        new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 109, 105, 102, 49]),
      ),
    ).toBe("image/heif");
    const png = new Uint8Array(33);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png[25] = 6;
    expect(pngHasTransparency(png)).toBe(true);
  });

  it("normalizes HEIC through the native image path and bounds the long edge", async () => {
    files.set(
      "file:///picker/receipt.jpg",
      new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 104, 101, 105, 99, 0]),
    );
    const draft = await createTemporaryReceiptDraft({
      id: "heic",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "image/heic",
    });
    const prepared = await prepareReceiptDraft(draft);
    expect(prepared).toMatchObject({
      mimeType: "image/jpeg",
      originalMimeType: "image/heic",
      width: 2200,
      height: 1467,
    });
    expect(prepared.localUri).toMatch(/\.jpg$/);
    expect(files.has(draft.localUri)).toBe(true);
  });

  it("retains a valid PDF and rejects one byte over 10 MB before draft creation", async () => {
    files.set(
      "file:///picker/receipt.jpg",
      new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]),
    );
    const draft = await createTemporaryReceiptDraft({
      id: "pdf",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "application/pdf",
    });
    const prepared = await prepareReceiptDraft(draft);
    expect(prepared).toMatchObject({
      mimeType: "application/pdf",
      sizeBytes: 8,
      originalSizeBytes: 8,
    });
    expect(files.get(prepared.localUri)).toEqual(files.get(draft.localUri));
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized.set([37, 80, 68, 70, 45]);
    files.set("file:///picker/receipt.jpg", oversized);
    await expect(
      createTemporaryReceiptDraft({
        id: "large",
        ownerUserId: "user-a",
        sourceUri: "file:///picker/receipt.jpg",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow("10 MB");
    expect([...files.keys()].some((path) => path.includes("large"))).toBe(false);
  });

  it("stores an opaque PNG as JPEG and retains transparency as PNG", async () => {
    const png = new Uint8Array(33);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png[25] = 2;
    files.set("file:///picker/receipt.jpg", png);
    const opaque = await createTemporaryReceiptDraft({
      id: "opaque",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "image/png",
    });
    expect((await prepareReceiptDraft(opaque)).mimeType).toBe("image/jpeg");
    png[25] = 6;
    files.set("file:///picker/receipt.jpg", png);
    const alpha = await createTemporaryReceiptDraft({
      id: "alpha",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "image/png",
    });
    expect((await prepareReceiptDraft(alpha)).mimeType).toBe("image/png");
  });

  it("keeps the OTR-owned source when normalization fails", async () => {
    const draft = await createTemporaryReceiptDraft({
      id: "failure",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "image/jpeg",
    });
    native.fail = true;
    await expect(prepareReceiptDraft(draft)).rejects.toThrow("native decode failed");
    expect(files.has(draft.localUri)).toBe(true);
    expect(
      [...files.keys()].some((path) => path.includes("ledger-receipts/failure")),
    ).toBe(false);
  });

  it("verifies exact stored bytes before upload", async () => {
    const draft = await createTemporaryReceiptDraft({
      id: "verify",
      ownerUserId: "user-a",
      sourceUri: "file:///picker/receipt.jpg",
      mimeType: "image/jpeg",
    });
    const prepared = await prepareReceiptDraft(draft);
    await expect(verifyReceiptFile(prepared)).resolves.toBeUndefined();
    await expect(receiptFileEvidence(prepared.localUri)).resolves.toMatchObject({
      exists: true,
      mimeType: prepared.mimeType,
      sizeBytes: prepared.sizeBytes,
      sha256: prepared.sha256,
    });
    files.set(prepared.localUri, new Uint8Array([255, 216, 255, 1, 2, 9]));
    await expect(verifyReceiptFile(prepared)).rejects.toThrow("changed");
  });

  it("restores an intact draft after restart and removes its record on cancel", async () => {
    const draft = {
      ...(await createTemporaryReceiptDraft({
        id: "recover",
        ownerUserId: "user-a",
        sourceUri: "file:///picker/receipt.jpg",
        mimeType: "image/jpeg",
      })),
      journeyId: "journey-a",
    };
    recordTemporaryReceiptDraft(draft);
    expect(await listRecoverableReceiptDrafts("user-a", "journey-a")).toEqual([draft]);
    deleteTemporaryReceiptDraft(draft);
    expect(await listRecoverableReceiptDrafts("user-a", "journey-a")).toEqual([]);
  });
});
