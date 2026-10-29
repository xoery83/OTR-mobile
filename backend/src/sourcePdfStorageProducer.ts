import { z } from "zod";
import {
  sourcePdfV2UploadBindingSchema,
  type SourcePdfV2UploadBinding,
  PDF_UPLOAD_QPDF_V4,
} from "../../src/domain/trip/sourcePdfV2Upload";
import { verifySourcePdfV2UploadBytes } from "./sourcePdfV2UploadValidation";
import { sourcePdfCausalBindingSchema } from "../../src/domain/trip/sourcePdfUploadCausal";
import { coreHash, coreUuid } from "../../src/domain/trip/tripCoreV2";
import { Buffer } from "node:buffer";
import http from "node:http";
import https from "node:https";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { sourcePdfUploadBindingSchema } from "../../src/domain/trip/sourcePdfUploadAuthority";
import { pdfHash, verifySourcePdf } from "./sourcePdfProfile";

export type PdfStorageConfig = {
  instanceId: string;
  origin: string;
  credentialRef: string;
  serviceToken: string;
  timeoutMs: number;
  localFixture?: true;
};
export const sourcePdfBackendBindingSchema = z.union([
  sourcePdfUploadBindingSchema,
  sourcePdfCausalBindingSchema,
]);
export type PdfBackendBinding = z.infer<typeof sourcePdfBackendBindingSchema>;
export type PdfRequestBinding = { binding: PdfBackendBinding; dispatchId: string };
export type PdfReadBinding = PdfRequestBinding & {
  readId?: string;
  ackEvidenceSha256?: string;
};
// Internal observations only. Nothing here means WRITER_TERMINAL, VERIFIED or FINAL.
export function createSourcePdfStorageProducer(config: PdfStorageConfig) {
  return createProducer(
    config,
    sourcePdfBackendBindingSchema,
    async (bytes) => verifySourcePdf(bytes),
    65536,
  );
}
export function createSourcePdfV2StorageProducer(
  config: PdfStorageConfig,
  runWorker?: Parameters<typeof verifySourcePdfV2UploadBytes>[1],
) {
  return createProducer(
    config,
    sourcePdfV2UploadBindingSchema,
    (bytes) => verifySourcePdfV2UploadBytes(bytes, runWorker),
    PDF_UPLOAD_QPDF_V4.maxByteCount,
    PDF_UPLOAD_QPDF_V4.profileId,
  );
}
function createProducer<B extends PdfBackendBinding | SourcePdfV2UploadBinding>(
  config: PdfStorageConfig,
  bindingSchema: z.ZodType<B>,
  verify: (bytes: Uint8Array) => Promise<unknown>,
  maxBytes: number,
  profileId?: string,
) {
  type RequestBinding = { binding: B; dispatchId: string };
  type ReadBinding = RequestBinding & { readId?: string; ackEvidenceSha256?: string };
  const origin = new URL(config.origin);
  if (
    origin.origin !== config.origin ||
    origin.username ||
    origin.password ||
    (config.localFixture && origin.hostname !== "127.0.0.1") ||
    !config.instanceId ||
    !config.credentialRef ||
    !config.serviceToken ||
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1 ||
    config.timeoutMs > 15000 ||
    (origin.protocol !== "https:" &&
      !(
        config.localFixture &&
        origin.protocol === "http:" &&
        origin.hostname === "127.0.0.1"
      ))
  )
    throw new Error("FIXED_PRIVATE_PROVIDER_REQUIRED");
  const apiPrefix = config.localFixture ? "" : "/storage/v1";
  const configurationSha256 = pdfHash(
    canonicalCoreJson({
      provider: "supabase_storage",
      instanceId: config.instanceId,
      origin: config.origin,
      apiPrefix,
      credentialRef: config.credentialRef,
      bucket: "trip-source-material",
      protocol: "STANDARD_POST_NO_RETRY/1",
      ...(profileId ? { profileId } : {}),
    }),
  );
  function bound(raw: RequestBinding) {
    const binding = bindingSchema.parse(raw.binding);
    if (!coreUuid.safeParse(raw.dispatchId).success)
      throw new Error("DISPATCH_ID_REQUIRED");
    return {
      binding,
      dispatchId: raw.dispatchId,
      configurationSha256,
      requestSha256: pdfHash(
        canonicalCoreJson({ binding, dispatchId: raw.dispatchId, configurationSha256 }),
      ),
    };
  }
  function io(method: "POST" | "GET", key: string, body?: Uint8Array) {
    return new Promise<{
      status: number;
      headers: Record<string, string>;
      rawHeaders: string[];
      body: Buffer;
    } | null>((resolve) => {
      let done = false;
      const finish = (
        value: {
          status: number;
          headers: Record<string, string>;
          rawHeaders: string[];
          body: Buffer;
        } | null,
      ) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(value);
        }
      };
      const transport = origin.protocol === "https:" ? https : http;
      const q = transport.request(
        new URL(
          apiPrefix +
            (method === "POST" ? "/object/" : "/object/authenticated/") +
            "trip-source-material/" +
            key,
          origin,
        ),
        {
          method,
          agent: false,
          maxHeaderSize: 16384,
          ...(origin.protocol === "https:" ? { rejectUnauthorized: true } : {}),
          headers: {
            Authorization: "Bearer " + config.serviceToken,
            ...(body
              ? {
                  "content-type": "application/pdf",
                  "content-length": body.byteLength,
                  "x-upsert": "false",
                }
              : { "cache-control": "no-cache, no-store", pragma: "no-cache" }),
          },
        },
        (r) => {
          const parts: Buffer[] = [];
          let count = 0;
          r.on("data", (p: Buffer) => {
            count += p.length;
            if (count > (method === "GET" ? maxBytes : 4096)) {
              q.destroy();
              r.destroy();
              finish(null);
            } else parts.push(p);
          });
          r.on("end", () => {
            if (!r.complete || !q.writableFinished) return finish(null);
            const headers: Record<string, string> = {};
            for (const key of [
              "content-type",
              "content-length",
              "x-request-id",
              "sb-request-id",
              "etag",
            ]) {
              const value = r.headers[key];
              if (typeof value === "string") headers[key] = value;
            }
            finish({
              status: r.statusCode || 0,
              headers,
              rawHeaders: [...r.rawHeaders],
              body: Buffer.concat(parts),
            });
          });
          r.on("error", () => finish(null));
          r.on("aborted", () => finish(null));
        },
      );
      const timer = setTimeout(() => {
        q.destroy();
        finish(null);
      }, config.timeoutMs);
      q.on("error", () => finish(null));
      q.end(body);
    });
  }
  return {
    configurationSha256,
    async upload(raw: RequestBinding, bytes: Uint8Array) {
      const request = bound(raw);
      const b = request.binding;
      const payload = Buffer.from(bytes);
      await verify(payload);
      if (pdfHash(payload) !== b.sha256 || payload.length !== b.byteCount)
        throw new Error("STAGE_INTEGRITY_MISMATCH");
      const response = await io("POST", b.objectKey, payload);
      if (!response)
        return {
          kind: "UNKNOWN" as const,
          request,
          reason: "INCOMPLETE_RESPONSE" as const,
        };
      const observation = {
        request,
        status: response.status,
        headers: response.headers,
        responseHeaders: response.rawHeaders,
        responseBody: response.body.toString("utf8"),
        responseSha256: pdfHash(response.body),
        localInputClosed: true as const,
      };
      let shape: unknown;
      try {
        shape = JSON.parse(observation.responseBody);
      } catch {}
      const data = shape as { Id?: unknown; Key?: unknown } | undefined;
      if (
        response.status !== 200 ||
        !data ||
        typeof data.Id !== "string" ||
        !coreUuid.safeParse(data.Id).success ||
        data.Key !== "trip-source-material/" + b.objectKey ||
        Object.keys(data).some((k) => !["Id", "Key"].includes(k))
      )
        return {
          kind: "UNKNOWN" as const,
          ...observation,
          reason: "UNACCEPTED_RESPONSE" as const,
        };
      return { kind: "COMPLETE_ACK" as const, ...observation };
    },
    async read(raw: ReadBinding) {
      const causal = raw.binding.uploadVersion === 3 || raw.binding.uploadVersion === 4;
      if (
        causal &&
        (!coreUuid.safeParse(raw.readId).success ||
          raw.readId === raw.dispatchId ||
          !coreHash.safeParse(raw.ackEvidenceSha256).success)
      )
        throw new Error("PDF_CAUSAL_READ_PERMIT_REQUIRED");
      const request = {
          ...bound(raw),
          ...(causal
            ? {
                readId: raw.readId!,
                ackEvidenceSha256: raw.ackEvidenceSha256!,
                cacheBypassed: true as const,
              }
            : {}),
        },
        b = request.binding,
        response = await io("GET", b.objectKey);
      if (!response) return { kind: "UNAVAILABLE" as const, request };
      if (response.status !== 200) {
        let missing = response.status === 404;
        try {
          const e = JSON.parse(response.body.toString());
          missing ||=
            response.status === 400 && e.statusCode === "404" && e.code === "NoSuchKey";
        } catch {}
        return {
          kind: missing ? ("MISSING" as const) : ("UNAVAILABLE" as const),
          request,
        };
      }
      const bytes = response.body,
        mime = response.headers["content-type"]?.split(";")[0].trim().toLowerCase();
      const observation = {
        request,
        sha256: pdfHash(bytes),
        byteCount: bytes.length,
        mimeType: mime ?? null,
      };
      if (
        observation.sha256 !== b.sha256 ||
        bytes.length !== b.byteCount ||
        mime !== "application/pdf"
      )
        return { kind: "MISMATCH" as const, ...observation };
      try {
        await verify(bytes);
      } catch {
        // A V4 worker outage cannot establish that the retained original is unsupported.
        if (b.uploadVersion === 4) return { kind: "UNAVAILABLE" as const, request };
        return { kind: "UNSUPPORTED" as const, ...observation };
      }
      return { kind: "MATCH" as const, ...observation };
    },
  };
}
export type SourcePdfStorageProducer = ReturnType<typeof createSourcePdfStorageProducer>;
