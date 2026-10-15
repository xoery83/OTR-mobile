import {
  captureCustodyBindingSchema,
  assertCaptureCustodyBytes,
  type CaptureCustodyBinding,
  type CaptureMaterialCustody,
} from "../../src/domain/capture/captureCustody";
import {
  createRequestBoundary,
  readBoundedBytes,
  readBoundedJson,
  type RequestBoundary,
} from "../../src/data/api/requestBoundary";
import type { PdfStorageConfig } from "./sourcePdfStorageProducer";

// Same private Source bucket and credential-injection pattern; no PDF parser/profile.
export function createCaptureStorageMaterial(
  config: PdfStorageConfig,
  fetcher: typeof fetch = fetch,
): CaptureMaterialCustody {
  const origin = new URL(config.origin);
  if (
    origin.origin !== config.origin ||
    origin.username ||
    origin.password ||
    !config.instanceId ||
    !config.credentialRef ||
    !config.serviceToken ||
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1 ||
    config.timeoutMs > 15000 ||
    (config.localFixture
      ? origin.protocol !== "http:" || origin.hostname !== "127.0.0.1"
      : config.origin !== "https://tuqigdxrvrerfewsxqgm.supabase.co")
  )
    throw new Error("CAPTURE_STORAGE_CONFIG_INVALID");
  const prefix = config.localFixture ? "" : "/storage/v1";
  const object = (b: CaptureCustodyBinding) =>
    `trip-source-material/capture/${b.accountId}/${b.inputId}`;
  async function read(b: CaptureCustodyBinding, boundary: RequestBoundary) {
    const response = await boundary.run(() =>
      fetcher(`${origin.origin}${prefix}/object/authenticated/${object(b)}`, {
        method: "GET",
        redirect: "error",
        signal: boundary.signal,
        headers: {
          Authorization: `Bearer ${config.serviceToken}`,
          "Cache-Control": "no-cache, no-store",
          Pragma: "no-cache",
          "Accept-Encoding": "identity",
        },
      }),
    );
    if (response.status === 404) {
      void response.body?.cancel().catch(() => {});
      return null;
    }
    if (response.status === 400) {
      const error = (await readBoundedJson(response, 4096, boundary)) as {
        statusCode?: unknown;
        code?: unknown;
      };
      if (error.statusCode === "404" && error.code === "NoSuchKey") return null;
      throw new Error("CAPTURE_STORAGE_UNAVAILABLE");
    }
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => {});
      throw new Error("CAPTURE_STORAGE_UNAVAILABLE");
    }
    const media = response.headers
      .get("Content-Type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    if (
      media !== b.mediaType ||
      response.headers.has("Content-Encoding") ||
      response.headers.get("Content-Length") !== String(b.byteCount)
    )
      throw new Error("CAPTURE_CUSTODY_BINDING_CONFLICT");
    const bytes = await readBoundedBytes(response, b.byteCount, boundary);
    try {
      assertCaptureCustodyBytes(b, bytes);
    } catch {
      throw new Error("CAPTURE_CUSTODY_BINDING_CONFLICT");
    }
    return bytes;
  }
  return {
    async read(raw) {
      const b = captureCustodyBindingSchema.parse(raw),
        boundary = createRequestBoundary(config.timeoutMs);
      try {
        return await read(b, boundary);
      } finally {
        boundary.close();
      }
    },
    async put(raw, input) {
      const b = captureCustodyBindingSchema.parse(raw);
      assertCaptureCustodyBytes(b, input);
      const bytes = Uint8Array.from(input);
      const boundary = createRequestBoundary(config.timeoutMs);
      try {
        if (await read(b, boundary)) return;
        // No-upsert exact key makes a concurrent/lost-ACK retry safe; GET proves bytes.
        try {
          const response = await boundary.run(() =>
            fetcher(`${origin.origin}${prefix}/object/${object(b)}`, {
              method: "POST",
              redirect: "error",
              signal: boundary.signal,
              headers: {
                Authorization: `Bearer ${config.serviceToken}`,
                "Content-Type": b.mediaType,
                "Content-Length": String(b.byteCount),
                "x-upsert": "false",
              },
              body: bytes.buffer,
            }),
          );
          void response.body?.cancel().catch(() => {});
        } catch {
          boundary.assertCurrent();
        }
        if (!(await read(b, boundary)))
          throw new Error("CAPTURE_STORAGE_OUTCOME_UNKNOWN");
      } finally {
        boundary.close();
      }
    },
  };
}
