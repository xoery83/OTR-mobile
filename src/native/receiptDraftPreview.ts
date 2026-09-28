import { requireNativeModule } from "expo";

export function previewReceiptDraftPdf(uri: string) {
  if (!uri.startsWith("file://")) throw new Error("Local PDF is unavailable.");
  const native = requireNativeModule<{ previewDraft(uri: string): boolean }>(
    "ReceiptOcr",
  );
  if (!native.previewDraft(uri)) throw new Error("Local PDF preview is unavailable.");
}
