import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { ApiClientError } from "@/data/api/client";
import { receiptBytesSha256, resolveReceiptFile } from "@/data/files/receiptFileStore";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { createLedgerReceiptTransport } from "@/data/sync/ledgerReceiptTransport";

export async function resolveReceiptAssetUri(receipt: ReceiptAsset) {
  if (receipt.deletedAt) throw new Error("This attachment was removed.");
  let file = receipt.localUri ? resolveReceiptFile(receipt.localUri) : null;
  if (!file?.exists) {
    if (!receipt.serverId || receipt.uploadStatus !== "UPLOADED")
      throw new Error("This attachment is available after its upload completes.");
    let bytes: Uint8Array;
    try {
      bytes = await createLedgerReceiptTransport().download(
        receipt.journeyId,
        receipt.serverId,
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.kind === "network")
        throw new Error("Connect to the internet to download this attachment again.");
      throw error;
    }
    if (
      bytes.byteLength !== receipt.sizeBytes ||
      (await receiptBytesSha256(bytes)) !== receipt.sha256
    )
      throw new Error("Downloaded attachment failed verification.");
    const extension =
      receipt.mimeType === "application/pdf"
        ? "pdf"
        : receipt.mimeType === "image/png"
          ? "png"
          : "jpg";
    const previews = new Directory(Paths.cache, "ledger-receipt-previews");
    previews.create({ idempotent: true, intermediates: true });
    file = new File(previews, `${receipt.serverId}.${extension}`);
    file.write(bytes);
  }
  return file.uri;
}

export async function openReceiptAsset(receipt: ReceiptAsset) {
  const uri = await resolveReceiptAssetUri(receipt);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Attachment viewer is unavailable on this device.");
  await Sharing.shareAsync(uri, { mimeType: receipt.mimeType });
}
