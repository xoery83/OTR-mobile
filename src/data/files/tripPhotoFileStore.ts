import { sha256 } from "@noble/hashes/sha256";
import { Directory, File, FileMode, Paths } from "expo-file-system";

const photos = new Directory(Paths.document, "trip-photos");
const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"] as const;

export type RetainedTripPhoto = {
  accountId: string;
  tripId: string;
  assetId: string;
  mimeType: "image/jpeg" | "image/png" | "image/heic" | "image/heif";
  sizeBytes: number;
  sha256: string;
  localUri: string;
};

export type RetainTripPhotoResult = {
  photo: RetainedTripPhoto;
  /** False when an earlier attempt already retained identical bytes for this asset ID. */
  createdNew: boolean;
};

function assertIdentity(accountId: string, tripId: string, assetId: string) {
  if (![accountId, tripId, assetId].every((id) => UUID.test(id)))
    throw new Error("Trip photo identity is invalid.");
}

function imageType(bytes: Uint8Array): RetainedTripPhoto["mimeType"] {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte))
    return "image/png";
  if ([102, 116, 121, 112].every((byte, i) => bytes[i + 4] === byte)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heim", "heis", "hevm"].includes(brand)) return "image/heif";
  }
  throw new Error("Trip photo must be JPEG, PNG, HEIC, or HEIF.");
}

function extension(mimeType: RetainedTripPhoto["mimeType"]) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/heic") return ".heic";
  if (mimeType === "image/heif") return ".heif";
  throw new Error("Trip photo type is invalid.");
}

function readEvidence(file: File) {
  if (
    !file.exists ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > MAX_PHOTO_BYTES
  )
    throw new Error("Trip photo is missing, empty, or too large.");
  const handle = file.open(FileMode.ReadOnly);
  try {
    const prefix = handle.readBytes(16);
    const mimeType = imageType(prefix);
    const hash = sha256.create();
    hash.update(prefix);
    let sizeBytes = prefix.byteLength;
    while (true) {
      const chunk = handle.readBytes(CHUNK_BYTES);
      if (chunk.byteLength === 0) break;
      sizeBytes += chunk.byteLength;
      if (sizeBytes > MAX_PHOTO_BYTES)
        throw new Error("Trip photo exceeds the local size limit.");
      hash.update(chunk);
    }
    if (sizeBytes !== file.size) throw new Error("Trip photo changed while reading.");
    return {
      mimeType,
      sizeBytes,
      sha256: Array.from(hash.digest(), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    };
  } finally {
    handle.close();
  }
}

function photoFile(
  input: Pick<RetainedTripPhoto, "accountId" | "tripId" | "assetId" | "mimeType">,
) {
  assertIdentity(input.accountId, input.tripId, input.assetId);
  const account = new Directory(photos, input.accountId);
  const trip = new Directory(account, input.tripId);
  return { trip, file: new File(trip, `${input.assetId}${extension(input.mimeType)}`) };
}

/** Copy a picker file into app documents before recording any durable association. */
export async function retainTripPhoto(input: {
  accountId: string;
  tripId: string;
  assetId: string;
  temporaryUri: string;
}): Promise<RetainTripPhotoResult> {
  assertIdentity(input.accountId, input.tripId, input.assetId);
  if (!input.temporaryUri.startsWith("file://"))
    throw new Error("Trip photo picker file is unavailable.");
  const source = new File(input.temporaryUri);
  const evidence = readEvidence(source);
  const { trip, file } = photoFile({ ...input, mimeType: evidence.mimeType });
  const result = (localUri: string): RetainedTripPhoto => ({
    accountId: input.accountId,
    tripId: input.tripId,
    assetId: input.assetId,
    ...evidence,
    localUri,
  });
  for (const mimeType of IMAGE_TYPES) {
    const candidate = photoFile({ ...input, mimeType }).file;
    if (!candidate.exists) continue;
    const existing = readEvidence(candidate);
    if (
      existing.mimeType !== mimeType ||
      existing.mimeType !== evidence.mimeType ||
      existing.sizeBytes !== evidence.sizeBytes ||
      existing.sha256 !== evidence.sha256
    )
      throw new Error("Trip photo identity already exists with different bytes.");
    return { photo: result(candidate.uri), createdNew: false };
  }
  trip.create({ idempotent: true, intermediates: true });
  const staging = new File(
    trip,
    `${input.assetId}.${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.pending`,
  );
  if (staging.exists) throw new Error("Trip photo staging identity collided.");
  let published = false;
  try {
    await source.copy(staging, { overwrite: false });
    const copied = readEvidence(staging);
    if (
      copied.mimeType !== evidence.mimeType ||
      copied.sizeBytes !== evidence.sizeBytes ||
      copied.sha256 !== evidence.sha256
    )
      throw new Error("Trip photo copy changed.");
    await staging.move(file, { overwrite: false });
    published = true;
    return { photo: result(file.uri), createdNew: true };
  } finally {
    if (!published && staging.exists) staging.delete();
  }
}

export type RetainedTripPhotoIdentity = Readonly<{
  uri: string;
  sizeBytes: number;
  modificationTime: number;
  creationTime: number;
}>;

/** A presentation-cache invalidation signal, never a replacement for full verification. */
export function probeRetainedTripPhotoIdentity(
  photo: RetainedTripPhoto,
): RetainedTripPhotoIdentity | null {
  try {
    const { file } = photoFile(photo);
    if (photo.localUri !== file.uri) return null;
    const info = file.info();
    if (
      !info.exists ||
      info.size !== photo.sizeBytes ||
      !Number.isSafeInteger(info.size) ||
      photo.sizeBytes < 1 ||
      photo.sizeBytes > MAX_PHOTO_BYTES ||
      typeof info.modificationTime !== "number" ||
      !Number.isFinite(info.modificationTime) ||
      typeof info.creationTime !== "number" ||
      !Number.isFinite(info.creationTime)
    )
      return null;
    return Object.freeze({
      uri: file.uri,
      sizeBytes: photo.sizeBytes,
      modificationTime: info.modificationTime,
      creationTime: info.creationTime,
    });
  } catch {
    return null;
  }
}

/** Missing or changed local bytes return null so a repository can show an honest fallback. */
export function resolveRetainedTripPhoto(photo: RetainedTripPhoto): string | null {
  try {
    const { file } = photoFile(photo);
    if (!file.exists) return null;
    const evidence = readEvidence(file);
    return evidence.mimeType === photo.mimeType &&
      evidence.sizeBytes === photo.sizeBytes &&
      evidence.sha256 === photo.sha256
      ? file.uri
      : null;
  } catch {
    return null;
  }
}

/** Use only for a fresh copy whose owning SQLite association failed to commit. */
export function discardRetainedTripPhoto(result: RetainTripPhotoResult): boolean {
  if (!result.createdNew) return false;
  const uri = resolveRetainedTripPhoto(result.photo);
  if (!uri || result.photo.localUri !== uri) return false;
  new File(uri).delete();
  return true;
}
