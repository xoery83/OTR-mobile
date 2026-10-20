import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  createSupabaseAttachmentStorageProvider,
  resolveAttachmentStorageProvider,
  SUPABASE_ATTACHMENT_PROVIDER,
  type AttachmentStorageProvider,
} from "./attachmentStorageProvider";

describe("Supabase attachment storage provider", () => {
  function fixture() {
    const objects = new Map<string, Blob>();
    const upload = vi.fn(
      async (
        key: string,
        bytes: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ) => {
        objects.set(
          key,
          new Blob([new Uint8Array(bytes)], { type: options.contentType }),
        );
        return { error: null };
      },
    );
    const download = vi.fn(async (key: string) =>
      objects.has(key)
        ? { data: objects.get(key)!, error: null }
        : { data: null, error: { statusCode: "404" } },
    );
    const from = vi.fn(() => ({ upload, download }));
    return {
      provider: createSupabaseAttachmentStorageProvider({ storage: { from } } as never),
      from,
      upload,
      download,
      objects,
    };
  }

  it("puts into the existing private bucket and reads exact bytes", async () => {
    const { provider, from, upload } = fixture();
    const bytes = Uint8Array.from([1, 2, 3]);
    await provider.put("journey/receipt/original", bytes, "image/jpeg");
    expect(from).toHaveBeenCalledWith("ledger-receipts");
    expect(upload).toHaveBeenCalledWith("journey/receipt/original", bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
    expect(await provider.read("journey/receipt/original")).toEqual(bytes);
    expect(await provider.stat("journey/receipt/original")).toEqual({
      byteCount: 3,
      contentType: "image/jpeg",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(await provider.stat("missing")).toBeNull();
    await expect(provider.read("missing")).rejects.toThrow("download failed");
  });

  it("fails closed for unknown or missing providers", () => {
    const fake: AttachmentStorageProvider = {
      put: vi.fn(),
      read: vi.fn(),
      stat: vi.fn(),
    };
    expect(resolveAttachmentStorageProvider(SUPABASE_ATTACHMENT_PROVIDER, fake)).toBe(
      fake,
    );
    expect(() => resolveAttachmentStorageProvider("german", fake)).toThrow(
      "Unsupported attachment storage provider.",
    );
    expect(() => resolveAttachmentStorageProvider(undefined, fake)).toThrow(
      "Unsupported attachment storage provider.",
    );
    expect(fake.read).not.toHaveBeenCalled();
  });

  it("keeps receipt bucket calls inside the provider module", () => {
    const gateway = readFileSync(
      new URL("./supabaseGateway.ts", import.meta.url),
      "utf8",
    );
    expect(gateway).not.toContain(".storage.from(");
    expect(gateway).not.toContain('.from("ledger-receipts")');
  });
});
