import { sha256 } from "@noble/hashes/sha256";
import { fetch as expoFetch } from "expo/fetch";
import { coreHash, coreUuid } from "@/domain/trip/tripCoreV2";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  captureAccountRequestContext,
} from "../auth/accountRequestContext";
import { sessionAccessToken } from "../auth/sessionAccessToken";
import { createRequestBoundary, type RequestBoundary } from "./requestBoundary";

const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;

export type DocumentOriginalIdentity = {
  tripId: string;
  documentId: string;
  contentVersion: number;
  sha256: string;
  byteSize: number;
};

async function readBytes(response: Response, boundary: RequestBoundary) {
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("DOCUMENT_ORIGINAL_STREAM_UNAVAILABLE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const digest = sha256.create();
  try {
    for (;;) {
      const { done, value } = await boundary.run(() => reader.read());
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ORIGINAL_BYTES) throw new Error("DOCUMENT_ORIGINAL_SIZE_LIMIT");
      digest.update(value);
      chunks.push(value.slice());
    }
    boundary.assertCurrent();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      bytes,
      sha256: Array.from(digest.digest(), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    };
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A canceled read may still be pending.
    }
  }
}

/** Dormant binary transport. The Backend's current ACL and custody ports remain required. */
export function createTripDocumentOriginalTransport(
  account: () => Promise<string>,
  options: {
    baseUrl?: string;
    fetchImplementation?: typeof fetch;
    tokenProvider?: typeof sessionAccessToken;
    timeoutMs?: number;
  } = {},
) {
  const fetchImplementation = options.fetchImplementation ?? expoFetch;
  const tokenProvider = options.tokenProvider ?? sessionAccessToken;
  const baseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
  if (!baseUrl || !/^https?:\/\//.test(baseUrl))
    throw new Error("DOCUMENT_ORIGINAL_API_UNAVAILABLE");
  const timeoutMs = options.timeoutMs ?? 15_000;
  return {
    async read(input: DocumentOriginalIdentity): Promise<Uint8Array | null> {
      coreUuid.parse(input.tripId);
      coreUuid.parse(input.documentId);
      coreHash.parse(input.sha256);
      if (
        !Number.isSafeInteger(input.contentVersion) ||
        input.contentVersion < 1 ||
        !Number.isSafeInteger(input.byteSize) ||
        input.byteSize < 1 ||
        input.byteSize > MAX_ORIGINAL_BYTES
      )
        throw new Error("DOCUMENT_ORIGINAL_IDENTITY_INVALID");
      const scope = await captureAccountRequestContext(input.tripId, account);
      const path = `/v2/trips/${input.tripId}/documents/${input.documentId}/original`;
      let rejectedToken: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await assertAccountRequestContext(scope, account);
        const session = await tokenProvider({
          expectedUserId: scope.accountId,
          forceRefresh: attempt === 1,
          rejectedToken,
        });
        if (session.userId !== scope.accountId)
          throw new Error("DOCUMENT_ORIGINAL_ACCOUNT_CHANGED");
        await assertAccountRequestContext(scope, account);
        const boundary = createRequestBoundary(timeoutMs, undefined, () =>
          assertAccountRequestGeneration(scope),
        );
        try {
          const response = await boundary.run(() =>
            fetchImplementation(`${baseUrl}${path}`, {
              method: "GET",
              redirect: "error",
              headers: {
                Authorization: `Bearer ${session.token}`,
                "X-OTR-Content-Version": String(input.contentVersion),
                "If-Match": `"${input.sha256}"`,
                Accept: "application/octet-stream",
              },
              signal: boundary.signal,
            }),
          );
          if (response.status === 401 && attempt === 0) {
            rejectedToken = session.token;
            continue;
          }
          if (response.status === 404) {
            await assertAccountRequestContext(scope, account);
            return null;
          }
          if (response.status !== 200) throw new Error("DOCUMENT_ORIGINAL_UNAVAILABLE");
          const length = Number(response.headers.get("Content-Length"));
          if (
            response.headers.get("Content-Type") !== "application/octet-stream" ||
            response.headers.get("ETag") !== `"${input.sha256}"` ||
            response.headers.get("X-OTR-Content-Version") !==
              String(input.contentVersion) ||
            !response.headers.get("Cache-Control")?.includes("no-store") ||
            response.headers.get("Vary") !== "Authorization" ||
            !Number.isSafeInteger(length) ||
            length !== input.byteSize
          )
            throw new Error("DOCUMENT_ORIGINAL_RESPONSE_INVALID");
          const body = await readBytes(response, boundary);
          if (body.bytes.byteLength !== input.byteSize || body.sha256 !== input.sha256)
            throw new Error("DOCUMENT_ORIGINAL_RESPONSE_INVALID");
          await assertAccountRequestContext(scope, account);
          return body.bytes;
        } finally {
          boundary.close();
        }
      }
      throw new Error("DOCUMENT_ORIGINAL_UNAVAILABLE");
    },
  };
}
