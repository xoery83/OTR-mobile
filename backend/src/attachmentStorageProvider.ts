import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_ATTACHMENT_PROVIDER = "supabase_storage";

export type AttachmentObjectStat = {
  byteCount: number;
  contentType: string | null;
  sha256: string;
};

export type AttachmentStorageProvider = {
  put(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void>;
  read(objectKey: string): Promise<Uint8Array>;
  stat(objectKey: string): Promise<AttachmentObjectStat | null>;
};

export function resolveAttachmentStorageProvider(
  provider: unknown,
  supabase: AttachmentStorageProvider,
): AttachmentStorageProvider {
  if (provider === SUPABASE_ATTACHMENT_PROVIDER) return supabase;
  throw new Error("Unsupported attachment storage provider.");
}

export function createSupabaseAttachmentStorageProvider(
  service: SupabaseClient,
): AttachmentStorageProvider {
  const bucket = service.storage.from("ledger-receipts");
  return {
    async put(objectKey, bytes, contentType) {
      const result = await bucket.upload(objectKey, bytes, {
        contentType,
        upsert: true,
      });
      if (result.error) throw new Error("Supabase Dev receipt upload failed.");
    },
    async read(objectKey) {
      const result = await bucket.download(objectKey);
      if (result.error) throw new Error("Supabase Dev receipt download failed.");
      return new Uint8Array(await result.data.arrayBuffer());
    },
    async stat(objectKey) {
      // Storage does not expose a guaranteed SHA-256 here; hash actual downloaded bytes.
      const result = await bucket.download(objectKey);
      if (result.error) {
        if (Number(result.error.statusCode) === 404) return null;
        throw new Error("Supabase Dev receipt stat failed.");
      }
      const bytes = new Uint8Array(await result.data.arrayBuffer());
      return {
        byteCount: bytes.byteLength,
        contentType: result.data.type || null,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    },
  };
}
