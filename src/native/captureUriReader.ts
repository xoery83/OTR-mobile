import { File, FileMode } from "expo-file-system";
import type { CaptureByteReader } from "@/data/files/capturePayloadReader";
import { LocalCaptureError } from "@/domain/capture/localCapture";

// Open only after roster registration. No whole-file read, normalization or copy.
export async function openCaptureUriReader(
  uri: string | null,
): Promise<CaptureByteReader> {
  if (!uri) throw new LocalCaptureError("READER_FAILURE");
  try {
    const handle = new File(uri).open(FileMode.ReadOnly);
    let closed = false;
    return {
      sizeHint: handle.size ?? undefined,
      async read(maxBytes) {
        if (closed || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 65536)
          throw new LocalCaptureError("READER_FAILURE");
        const bytes = handle.readBytes(maxBytes);
        return bytes.length ? bytes : null;
      },
      async close() {
        if (!closed) {
          closed = true;
          handle.close();
        }
      },
    };
  } catch {
    throw new LocalCaptureError("READER_FAILURE");
  }
}
