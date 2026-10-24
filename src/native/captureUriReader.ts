import { File, FileMode } from "expo-file-system";
import type { CaptureByteReader } from "@/data/files/capturePayloadReader";
import { LocalCaptureError } from "@/domain/capture/localCapture";

type ReaderStage = "construct" | "open" | "size" | "read" | "close";
function reportReaderFailure(stage: ReaderStage, error: unknown) {
  // Only fixed categories: native messages, paths, stacks and arbitrary names stay private.
  try {
    const value = error as { name?: unknown; code?: unknown } | null;
    const name = ["TypeError", "ReferenceError", "Error", "MissingPermissionException", "UnableToReadHandleException"].find((v) => v === value?.name) ?? "OTHER";
    const code = ["ERR_MISSING_PERMISSION", "ERR_UNABLE_TO_READ_HANDLE", "ERR_FILESYSTEM_CANNOT_READ_FILE", "ERR_FILE_NOT_FOUND", "ERR_INVALID_ARGUMENT", "ERR_INVALID_ARGS", "ERR_SHARED_OBJECT_NOT_FOUND", "ERR_UNEXPECTED"].find((v) => v === value?.code) ?? (typeof value?.code === "number" && Number.isSafeInteger(value.code) && Math.abs(value.code) <= 999999 ? value.code : "OTHER");
    console.warn("OTR_CAPTURE_URI_READER_FAILURE", { stage, name, code });
  } catch { /* Diagnostics must never change capture failure handling. */ }
}

// Open only after roster registration. No whole-file read, normalization or copy.
export async function openCaptureUriReader(
  uri: string | null,
): Promise<CaptureByteReader> {
  if (!uri) throw new LocalCaptureError("READER_FAILURE");
  let stage: ReaderStage = "construct";
  try {
    const file = new File(uri);
    stage = "open";
    const handle = file.open(FileMode.ReadOnly);
    stage = "size";
    let closed = false;
    return {
      sizeHint: handle.size ?? undefined,
      async read(maxBytes) {
        if (closed || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 65536)
          throw new LocalCaptureError("READER_FAILURE");
        try {
          const bytes = handle.readBytes(maxBytes);
          return bytes.length ? bytes : null;
        } catch (error) {
          reportReaderFailure("read", error);
          throw new LocalCaptureError("READER_FAILURE");
        }
      },
      async close() {
        if (!closed) {
          closed = true;
          try { handle.close(); } catch (error) {
            reportReaderFailure("close", error);
            throw new LocalCaptureError("READER_FAILURE");
          }
        }
      },
    };
  } catch (error) {
    reportReaderFailure(stage, error);
    throw new LocalCaptureError("READER_FAILURE");
  }
}
