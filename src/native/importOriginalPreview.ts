import { requireNativeModule } from "expo";
import { randomUUID } from "expo-crypto";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { ImportDocument } from "@/data/repositories/importDocumentsRepository";

type Preview = {
  previewImportOriginal(
    bytes: Uint8Array,
    token: string,
    displayName: string,
  ): Promise<void>;
  closeImportOriginal(token: string): Promise<void>;
};
// Called only with the repository's scoped, verified original, never a caller-provided URI.
export async function previewImportOriginal(
  original: { document: ImportDocument; bytes: Uint8Array },
  isCurrent: () => boolean,
  displayName = original.document.originalFilename ?? "",
): Promise<void> {
  if (!isCurrent()) return;
  // Keep the new Native adapter closed until its actual binary lifecycle is qualified.
  if (process.env.EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED !== "true")
    throw Error("IMPORT_PREVIEW_UNAVAILABLE");
  const { bytes, document } = original;
  if (
    !bytes.length ||
    bytes.length > 50 * 1024 * 1024 ||
    bytesToHex(sha256(bytes)) !== document.sha256 ||
    bytes.length !== document.byteCount
  )
    throw Error("IMPORT_ORIGINAL_INTEGRITY");
  const native = requireNativeModule<Preview>("ReceiptOcr");
  try {
    console.info(
      JSON.stringify({
        event: "import_original_preview_bridge",
        previewMethod: typeof native.previewImportOriginal === "function",
        closeMethod: typeof native.closeImportOriginal === "function",
      }),
    );
  } catch {
    // Diagnostics must not change preview behavior.
  }
  if (
    typeof native.previewImportOriginal !== "function" ||
    typeof native.closeImportOriginal !== "function"
  )
    throw Error("IMPORT_PREVIEW_UNAVAILABLE");
  const token = randomUUID();
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void native.closeImportOriginal(token).catch(() => {});
  };
  const unsubscribe = subscribeAccountGeneration(close);
  const timer = setInterval(() => {
    if (!isCurrent()) close();
  }, 100);
  try {
    if (!isCurrent()) return;
    await native.previewImportOriginal(new Uint8Array(bytes), token, displayName);
  } finally {
    clearInterval(timer);
    unsubscribe();
  }
}
