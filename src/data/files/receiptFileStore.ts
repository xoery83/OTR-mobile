import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const receipts = new Directory(Paths.document, "ledger-receipts");
const drafts = new Directory(Paths.document, "ledger-receipt-drafts");
export const RECEIPT_PDF_LIMIT = 10 * 1024 * 1024;
export const RECEIPT_IMAGE_SOURCE_LIMIT = 50 * 1024 * 1024;
export const RECEIPT_IMAGE_LONG_EDGE = 2200;
export const RECEIPT_JPEG_QUALITY = 0.83;
type InputMime =
  "image/jpeg" | "image/png" | "image/heic" | "image/heif" | "application/pdf";

export type TemporaryReceiptDraft = {
  id: string;
  ownerUserId: string;
  localUri: string;
  mimeType: InputMime;
  sizeBytes: number;
  sha256: string;
  originalFilename?: string | null;
  journeyId?: string;
};

export function resolveReceiptFile(localUri: string) {
  const stored = new File(localUri);
  return stored.exists ? stored : new File(receipts, stored.name);
}

function extension(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/heic") return ".heic";
  if (mimeType === "image/heif") return ".heif";
  if (mimeType === "application/pdf") return ".pdf";
  throw new Error("Receipt must be JPEG, PNG, HEIC, HEIF, or PDF.");
}

export function sniffReceiptMime(bytes: Uint8Array): InputMime {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value))
    return "image/png";
  if ([37, 80, 68, 70, 45].every((value, index) => bytes[index] === value))
    return "application/pdf";
  if ([102, 116, 121, 112].every((value, index) => bytes[index + 4] === value)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heim", "heis", "hevm", "hevs"].includes(brand))
      return "image/heif";
  }
  throw new Error("Unsupported receipt content.");
}

function inspect(file: File, declaredMime: string, existing = false) {
  if (!file.exists || file.size <= 0)
    throw new Error("Receipt file is unavailable or empty.");
  if (file.size > RECEIPT_IMAGE_SOURCE_LIMIT)
    throw new Error("Image exceeds the 50 MB source limit.");
  const handle = file.open(FileMode.ReadOnly);
  let bytes: Uint8Array;
  try {
    bytes = handle.readBytes(32);
  } finally {
    handle.close();
  }
  const mime = sniffReceiptMime(bytes);
  if (
    declaredMime &&
    declaredMime !== "application/octet-stream" &&
    declaredMime !== mime &&
    !(declaredMime === "image/jpg" && mime === "image/jpeg") &&
    !(
      ["image/heic", "image/heif"].includes(declaredMime) &&
      ["image/heic", "image/heif"].includes(mime)
    )
  )
    throw new Error("Receipt type does not match file content.");
  if (!existing && mime === "application/pdf" && file.size > RECEIPT_PDF_LIMIT)
    throw new Error("PDF exceeds the 10 MB limit.");
  return mime;
}

export function pngHasTransparency(bytes: Uint8Array) {
  if (bytes[25] === 4 || bytes[25] === 6) return true;
  for (let at = 8; at + 12 <= bytes.length;) {
    const size =
      ((bytes[at] << 24) |
        (bytes[at + 1] << 16) |
        (bytes[at + 2] << 8) |
        bytes[at + 3]) >>>
      0;
    const type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
    if (type === "tRNS") return true;
    if (type === "IDAT" || size > bytes.length - at - 12) break;
    at += size + 12;
  }
  return false;
}

export function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function receiptBytesSha256(bytes: Uint8Array) {
  return hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
}

export async function copyReceiptIntoAppStorage(input: {
  id: string;
  sourceUri: string;
  mimeType: string;
}) {
  receipts.create({ idempotent: true, intermediates: true });
  const source = new File(input.sourceUri);
  const originalMimeType = inspect(source, input.mimeType);
  const originalSizeBytes = source.size;
  const originalFilename = source.name ?? null;
  const mimeType: "image/jpeg" | "image/png" | "application/pdf" =
    originalMimeType === "application/pdf"
      ? "application/pdf"
      : originalMimeType === "image/png" && pngHasTransparency(await source.bytes())
        ? "image/png"
        : "image/jpeg";
  const destination = new File(receipts, `${input.id}${extension(mimeType)}`);
  let width: number | null = null;
  let height: number | null = null;
  if (!destination.exists) {
    if (mimeType === "application/pdf")
      await source.copy(destination, { overwrite: false });
    else {
      const context = ImageManipulator.manipulate(source.uri);
      const initial = await context.renderAsync();
      if (
        !initial.width ||
        !initial.height ||
        initial.width * initial.height > 60_000_000
      )
        throw new Error("Image dimensions exceed the supported limit.");
      const edge = Math.max(initial.width, initial.height);
      if (edge > RECEIPT_IMAGE_LONG_EDGE)
        context.resize(
          initial.width >= initial.height
            ? { width: RECEIPT_IMAGE_LONG_EDGE }
            : { height: RECEIPT_IMAGE_LONG_EDGE },
        );
      const normalized =
        edge > RECEIPT_IMAGE_LONG_EDGE ? await context.renderAsync() : initial;
      const result = await normalized.saveAsync({
        format: mimeType === "image/png" ? SaveFormat.PNG : SaveFormat.JPEG,
        compress: RECEIPT_JPEG_QUALITY,
      });
      width = result.width;
      height = result.height;
      const prepared = new File(result.uri);
      try {
        if (inspect(prepared, mimeType) !== mimeType || prepared.size > 15 * 1024 * 1024)
          throw new Error("Normalized receipt is invalid or too large.");
        await prepared.copy(destination, { overwrite: false });
      } finally {
        if (prepared.exists) prepared.delete();
      }
    }
  }
  if (inspect(destination, mimeType) !== mimeType || destination.size > 15 * 1024 * 1024)
    throw new Error("Prepared receipt is invalid or too large.");
  if (mimeType !== "application/pdf" && (width === null || height === null)) {
    const recovered = await ImageManipulator.manipulate(destination.uri).renderAsync();
    if (
      !recovered.width ||
      !recovered.height ||
      Math.max(recovered.width, recovered.height) > RECEIPT_IMAGE_LONG_EDGE
    )
      throw new Error("Prepared image dimensions are invalid.");
    width = recovered.width;
    height = recovered.height;
  }
  const bytes = await destination.bytes();
  return {
    localUri: destination.uri,
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256: hex(await digest(CryptoDigestAlgorithm.SHA256, bytes)),
    originalFilename,
    originalMimeType,
    originalSizeBytes,
    width,
    height,
  };
}

function draftFile(id: string, ownerUserId: string, mimeType: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !/^[a-zA-Z0-9_-]+$/.test(ownerUserId))
    throw new Error("Receipt draft identity is invalid.");
  return new File(new Directory(drafts, ownerUserId), `${id}${extension(mimeType)}`);
}

function draftRecord(draft: Pick<TemporaryReceiptDraft, "id" | "ownerUserId">) {
  if (!/^[a-zA-Z0-9_-]+$/.test(draft.id) || !/^[a-zA-Z0-9_-]+$/.test(draft.ownerUserId))
    throw new Error("Receipt draft identity is invalid.");
  return new File(new Directory(drafts, draft.ownerUserId), `${draft.id}.json`);
}

export function recordTemporaryReceiptDraft(draft: TemporaryReceiptDraft) {
  if (!draft.journeyId) return;
  const record = draftRecord(draft);
  record.create({ overwrite: false, intermediates: true });
  record.write(JSON.stringify(draft));
}

export async function listRecoverableReceiptDrafts(
  ownerUserId: string,
  journeyId: string,
) {
  const folder = new Directory(drafts, ownerUserId);
  if (!folder.exists) return [];
  const recovered: TemporaryReceiptDraft[] = [];
  for (const entry of folder.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith(".json")) continue;
    try {
      const candidate = JSON.parse(await entry.text()) as TemporaryReceiptDraft;
      if (
        candidate.ownerUserId !== ownerUserId ||
        candidate.journeyId !== journeyId ||
        draftRecord(candidate).uri !== entry.uri ||
        draftFile(candidate.id, ownerUserId, candidate.mimeType).uri !==
          candidate.localUri
      )
        continue;
      const source = new File(candidate.localUri);
      if (
        !source.exists ||
        source.size !== candidate.sizeBytes ||
        (await receiptBytesSha256(await source.bytes())) !== candidate.sha256 ||
        inspect(source, candidate.mimeType) !== candidate.mimeType
      )
        continue;
      recovered.push(candidate);
    } catch {
      /* retain unreadable candidates for manual recovery */
    }
  }
  return recovered;
}

export async function createTemporaryReceiptDraft(input: {
  id: string;
  ownerUserId: string;
  sourceUri: string;
  mimeType: string;
  originalFilename?: string | null;
}): Promise<TemporaryReceiptDraft> {
  const source = new File(input.sourceUri);
  const mimeType = inspect(source, input.mimeType);
  const destination = draftFile(input.id, input.ownerUserId, mimeType);
  new Directory(drafts, input.ownerUserId).create({
    idempotent: true,
    intermediates: true,
  });
  await source.copy(destination, { overwrite: false });
  const bytes = await destination.bytes();
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    localUri: destination.uri,
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256: hex(await digest(CryptoDigestAlgorithm.SHA256, bytes)),
    originalFilename: input.originalFilename?.slice(0, 255) ?? source.name ?? null,
  };
}

export async function prepareReceiptDraft(draft: TemporaryReceiptDraft) {
  if (draftFile(draft.id, draft.ownerUserId, draft.mimeType).uri !== draft.localUri)
    throw new Error("Receipt draft path is invalid.");
  const source = new File(draft.localUri);
  if (source.exists) {
    const bytes = await source.bytes();
    if (
      bytes.byteLength !== draft.sizeBytes ||
      hex(await digest(CryptoDigestAlgorithm.SHA256, bytes)) !== draft.sha256
    )
      throw new Error("Receipt draft changed before Save.");
  }
  if (!source.exists) throw new Error("Receipt draft source is unavailable.");
  const prepared = await copyReceiptIntoAppStorage({
    id: draft.id,
    sourceUri: draft.localUri,
    mimeType: draft.mimeType,
  });
  return { id: draft.id, ...prepared, originalFilename: draft.originalFilename ?? null };
}

export async function verifyReceiptFile(input: {
  localUri: string;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  sizeBytes: number;
  sha256: string;
}) {
  const file = resolveReceiptFile(input.localUri);
  if (
    inspect(file, input.mimeType, true) !== input.mimeType ||
    file.size !== input.sizeBytes
  )
    throw new Error("Local receipt does not match upload metadata.");
  if ((await receiptBytesSha256(await file.bytes())) !== input.sha256)
    throw new Error("Local receipt bytes changed before upload.");
}

export async function receiptFileEvidence(localUri: string) {
  const file = resolveReceiptFile(localUri);
  if (!file.exists) return { exists: false as const };
  const handle = file.open(FileMode.ReadOnly);
  let signature: Uint8Array;
  try {
    signature = handle.readBytes(32);
  } finally {
    handle.close();
  }
  let mimeType: string;
  try {
    mimeType = sniffReceiptMime(signature);
  } catch {
    mimeType = "unsupported";
  }
  return {
    exists: true as const,
    basename: file.name,
    mimeType,
    sizeBytes: file.size,
    sha256: await receiptBytesSha256(await file.bytes()),
  };
}

export function deleteTemporaryReceiptDraft(draft: TemporaryReceiptDraft) {
  const file = draftFile(draft.id, draft.ownerUserId, draft.mimeType);
  if (file.uri !== draft.localUri) throw new Error("Receipt draft path is invalid.");
  if (file.exists) file.delete();
  const record = draftRecord(draft);
  if (record.exists) record.delete();
}
