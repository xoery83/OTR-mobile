import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

const receipts = new Directory(Paths.document, "ledger-receipts");

export function resolveReceiptFile(localUri: string) {
  const stored = new File(localUri);
  return stored.exists ? stored : new File(receipts, stored.name);
}

function extension(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "application/pdf") return ".pdf";
  throw new Error("Receipt must be JPEG, PNG, or PDF.");
}

export function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function receiptBytesSha256(bytes: Uint8Array) {
  return hex(
    await digest(CryptoDigestAlgorithm.SHA256, bytes.slice().buffer as ArrayBuffer),
  );
}

export async function copyReceiptIntoAppStorage(input: {
  id: string;
  sourceUri: string;
  mimeType: string;
}) {
  receipts.create({ idempotent: true, intermediates: true });
  const source = new File(input.sourceUri);
  if (!source.exists || source.size <= 0 || source.size > 15 * 1024 * 1024)
    throw new Error("Receipt must be between 1 byte and 15 MB.");
  const destination = new File(receipts, `${input.id}${extension(input.mimeType)}`);
  await source.copy(destination, { overwrite: true });
  const bytes = await destination.bytes();
  return {
    localUri: destination.uri,
    sizeBytes: bytes.byteLength,
    sha256: hex(await digest(CryptoDigestAlgorithm.SHA256, bytes)),
  };
}
