import { subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { requireOptionalNativeModule } from "expo";
import type { CaptureSelection } from "@/features/capture/captureStaging";
import type { CaptureByteReader } from "@/data/files/capturePayloadReader";
import { LocalCaptureError } from "@/domain/capture/localCapture";

type NativeFiles = {
  pick(): Promise<{
    canceled: boolean;
    assets?: { token: string; name: string; mimeType: string | null; size?: number }[];
  }>;
  open(token: string): Promise<{ size: number }>;
  read(token: string, maxBytes: number): Promise<string>;
  close(token: string): Promise<void>;
  release(tokens: string[]): Promise<void>;
  releaseAll(): Promise<void>;
};
const prefix = "otr-capture-file://";
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function native(): NativeFiles | null {
  try {
    return requireOptionalNativeModule<NativeFiles>("OTRCaptureFiles");
  } catch {
    return null;
  }
}
subscribeAccountGeneration(() => {
  void native()
    ?.releaseAll()
    .catch(() => {});
});
function token(uri: string): string {
  const value = uri.slice(prefix.length);
  if (!uri.startsWith(prefix) || !tokenPattern.test(value))
    throw new LocalCaptureError("READER_FAILURE");
  return value;
}
export function hasCaptureFileLease(): boolean {
  return native() !== null;
}
export function isCaptureFileLease(uri: string): boolean {
  return uri.startsWith(prefix);
}
export async function pickLeasedCaptureFiles(
  isCurrent: () => boolean,
): Promise<readonly CaptureSelection[] | null> {
  const api = native();
  if (!api) return null; // Older installed hosts keep their existing picker until updated.
  const result = await api.pick();
  const assets = result.assets ?? [];
  if (result.canceled || !isCurrent()) {
    await api.release(
      assets.filter((a) => tokenPattern.test(a.token)).map((a) => a.token),
    );
    return [];
  }
  if (
    assets.length > 10 ||
    assets.some(
      (a) =>
        !tokenPattern.test(a.token) ||
        (a.size !== undefined && (!Number.isSafeInteger(a.size) || a.size < 0)),
    )
  ) {
    await api.release(
      assets.filter((a) => tokenPattern.test(a.token)).map((a) => a.token),
    );
    throw new LocalCaptureError("READER_FAILURE");
  }
  return assets.map((a) => ({
    source: "files",
    temporaryUri: `${prefix}${a.token}`,
    name: a.name,
    typeHint: a.mimeType,
    size: a.size,
    release: () => {
      void api.release([a.token]).catch(() => {});
    },
  }));
}
// This is called by the owning intake operation only after its immutable registration.
export async function openCaptureFileLease(uri: string): Promise<CaptureByteReader> {
  const api = native();
  if (!api) throw new LocalCaptureError("READER_FAILURE");
  const id = token(uri);
  let closed = false;
  try {
    const opened = await api.open(id);
    if (!Number.isSafeInteger(opened.size) || opened.size < 0)
      throw new LocalCaptureError("READER_FAILURE");
    return {
      sizeHint: opened.size,
      async read(maxBytes) {
        if (closed || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 65536)
          throw new LocalCaptureError("READER_FAILURE");
        try {
          const encoded = await api.read(id, maxBytes);
          if (
            typeof encoded !== "string" ||
            encoded.length > Math.ceil(maxBytes / 3) * 4 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              encoded,
            )
          )
            throw new Error();
          const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
          if (bytes.length > maxBytes) throw new Error();
          return bytes.length ? bytes : null;
        } catch {
          throw new LocalCaptureError("READER_FAILURE");
        }
      },
      async close() {
        if (!closed) {
          closed = true;
          await api.close(id);
        }
      },
    };
  } catch {
    await api.release([id]).catch(() => {});
    throw new LocalCaptureError("READER_FAILURE");
  }
}
