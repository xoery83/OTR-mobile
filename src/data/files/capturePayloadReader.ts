import {
  captureByteLimit,
  captureKindSchema,
  LocalCaptureError,
  sha256Schema,
  type CaptureKind,
} from "@/domain/capture/localCapture";

// Future Share adapters own their temporary handles and honor maxBytes per read.
export type CaptureByteReader = {
  read(maxBytes: number): Promise<Uint8Array | null>;
  close(): Promise<void>;
  sizeHint?: number;
};
export type CapturePayloadInput =
  { bytes: Uint8Array } | { text: string } | { reader: CaptureByteReader };
export type CaptureSha256 = (bytes: Uint8Array) => Promise<string>;
export type CapturePayload = { bytes: Uint8Array; byteCount: number; sha256: string };

export function validateCaptureUtf8(bytes: Uint8Array) {
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new LocalCaptureError("INVALID_UTF8");
  }
}
function checkSize(size: number, limit: number) {
  if (!Number.isSafeInteger(size) || size < 0)
    throw new LocalCaptureError("INVALID_INPUT");
  if (size > limit) throw new LocalCaptureError("PAYLOAD_TOO_LARGE");
}
// Counts standard UTF-8 encoding before allocation, including surrogate replacement.
function stringByteCount(text: string, limit: number) {
  let count = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    count += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (count > limit) throw new LocalCaptureError("PAYLOAD_TOO_LARGE");
  }
  return count;
}
export async function hashCaptureBytes(bytes: Uint8Array, sha256: CaptureSha256) {
  try {
    const hash = await sha256(bytes);
    if (!sha256Schema.safeParse(hash).success) throw new Error();
    return hash;
  } catch {
    throw new LocalCaptureError("HASH_FAILURE");
  }
}
export async function readCapturePayload(
  kind: CaptureKind,
  input: CapturePayloadInput,
  sha256: CaptureSha256,
): Promise<CapturePayload> {
  if (
    !captureKindSchema.safeParse(kind).success ||
    !input ||
    typeof input !== "object" ||
    Object.keys(input).length !== 1
  )
    throw new LocalCaptureError("INVALID_INPUT");
  const limit = captureByteLimit(kind);
  let bytes: Uint8Array | undefined;
  if ("bytes" in input) {
    if (!(input.bytes instanceof Uint8Array))
      throw new LocalCaptureError("INVALID_INPUT");
    checkSize(input.bytes.byteLength, limit);
    bytes = new Uint8Array(input.bytes);
  } else if ("text" in input) {
    if (kind !== "TEXT" || typeof input.text !== "string")
      throw new LocalCaptureError("INVALID_INPUT");
    stringByteCount(input.text, limit);
    bytes = new TextEncoder().encode(input.text);
  } else if ("reader" in input) {
    const reader = input.reader;
    if (
      !reader ||
      typeof reader.read !== "function" ||
      typeof reader.close !== "function"
    )
      throw new LocalCaptureError("INVALID_INPUT");
    // Fixed bounded buffer; no retained caller chunks or unbounded chunk list.
    let buffer: Uint8Array;
    let size = 0;
    let failure: unknown;
    try {
      if (reader.sizeHint !== undefined) checkSize(reader.sizeHint, limit);
      buffer = new Uint8Array(limit);
      for (;;) {
        const requested = Math.min(64 * 1024, limit - size + 1);
        const chunk = await reader.read(requested);
        if (chunk === null) break;
        if (
          !(chunk instanceof Uint8Array) ||
          chunk.length === 0 ||
          chunk.length > requested
        )
          throw new LocalCaptureError("READER_FAILURE");
        if (size + chunk.length > limit) throw new LocalCaptureError("PAYLOAD_TOO_LARGE");
        buffer.set(chunk, size);
        size += chunk.length;
      }
      bytes = buffer.slice(0, size);
    } catch (error) {
      failure =
        error instanceof LocalCaptureError
          ? error
          : new LocalCaptureError("READER_FAILURE");
    }
    try {
      await reader.close();
    } catch {
      failure ??= new LocalCaptureError("READER_FAILURE");
    }
    if (failure) throw failure;
  } else throw new LocalCaptureError("INVALID_INPUT");
  if (!bytes) throw new LocalCaptureError("READER_FAILURE");
  if (bytes.length === 0) throw new LocalCaptureError("EMPTY_PAYLOAD");
  if (kind === "TEXT") validateCaptureUtf8(bytes);
  return {
    bytes,
    byteCount: bytes.length,
    sha256: await hashCaptureBytes(bytes, sha256),
  };
}
