import { fetch as expoFetch } from "expo/fetch";
import { sessionAccessToken } from "../auth/sessionAccessToken";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { createRequestBoundary, readBoundedBytes } from "./requestBoundary";
import {
  assertCaptureCustodyBytes,
  captureCustodyBindingSchema,
  captureCustodyBindingJson,
  type CaptureCustodyBinding,
} from "@/domain/capture/captureCustody";

export type CaptureCustodyTransport = {
  put(
    context: AccountRequestContext,
    binding: CaptureCustodyBinding,
    bytes: Uint8Array,
  ): Promise<Uint8Array>;
  read(
    context: AccountRequestContext,
    binding: CaptureCustodyBinding,
  ): Promise<Uint8Array | null>;
};
// Explicit only: no default caller, uploader or retry lifecycle.
export function createCaptureCustodyTransport(
  getAccountId: () => Promise<string>,
  options: {
    baseUrl: string;
    fetchImplementation?: typeof fetch;
    tokenProvider?: typeof sessionAccessToken;
    timeoutMs?: number;
  },
): CaptureCustodyTransport {
  const origin = new URL(options.baseUrl);
  if (
    origin.origin !== options.baseUrl ||
    origin.username ||
    origin.password ||
    origin.protocol !== "https:"
  )
    throw new Error("CAPTURE_CUSTODY_ORIGIN_INVALID");
  const fetcher = options.fetchImplementation ?? expoFetch;
  const tokenProvider = options.tokenProvider ?? sessionAccessToken;
  async function request(
    context: AccountRequestContext,
    raw: CaptureCustodyBinding,
    bytes?: Uint8Array,
  ) {
    const binding = captureCustodyBindingSchema.parse(raw);
    const encoded = captureCustodyBindingJson(binding);
    if (context.tripId !== "" || context.accountId !== binding.accountId)
      throw new Error("CAPTURE_CUSTODY_SCOPE_INVALID");
    if (bytes) assertCaptureCustodyBytes(binding, bytes);
    const boundary = createRequestBoundary(options.timeoutMs ?? 15000, undefined, () =>
      assertAccountRequestGeneration(context),
    );
    let rejectedToken: string | undefined;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await boundary.run(() => assertAccountRequestContext(context, getAccountId));
        const session = await boundary.run(() =>
          tokenProvider({
            expectedUserId: context.accountId,
            forceRefresh: attempt === 1,
            rejectedToken,
          }),
        );
        if (session.userId !== context.accountId)
          throw new Error("CAPTURE_CUSTODY_SCOPE_INVALID");
        await boundary.run(() => assertAccountRequestContext(context, getAccountId));
        const response = await boundary.run(() =>
          fetcher(`${origin.origin}/v2/capture-inputs/${binding.inputId}/material`, {
            method: bytes ? "PUT" : "GET",
            redirect: "error",
            signal: boundary.signal,
            headers: {
              Authorization: `Bearer ${session.token}`,
              "X-OTR-Capture-Binding": encoded,
              "Accept-Encoding": "identity",
              ...(bytes
                ? {
                    "Content-Type": binding.mediaType,
                    "Content-Length": String(binding.byteCount),
                  }
                : {}),
            },
            ...(bytes ? { body: Uint8Array.from(bytes).buffer } : {}),
          }),
        );
        if (response.status === 401 && attempt === 0) {
          rejectedToken = session.token;
          void response.body?.cancel().catch(() => {});
          continue;
        }
        if (!bytes && response.status === 404) {
          await boundary.run(() => assertAccountRequestContext(context, getAccountId));
          return null;
        }
        if (response.status !== 200) throw new Error("CAPTURE_CUSTODY_UNAVAILABLE");
        if (
          response.headers.get("Content-Type") !== binding.mediaType ||
          response.headers.get("Content-Length") !== String(binding.byteCount) ||
          response.headers.get("ETag") !== `"${binding.sha256}"` ||
          response.headers.get("X-OTR-Capture-Binding") !== encoded ||
          !response.headers.get("Cache-Control")?.includes("no-store") ||
          response.headers.get("Vary") !== "Authorization" ||
          response.headers.has("Content-Encoding")
        )
          throw new Error("CAPTURE_CUSTODY_RESPONSE_INVALID");
        const retained = await readBoundedBytes(response, binding.byteCount, boundary);
        assertCaptureCustodyBytes(binding, retained);
        await boundary.run(() => assertAccountRequestContext(context, getAccountId));
        return retained;
      }
      throw new Error("CAPTURE_CUSTODY_UNAVAILABLE");
    } finally {
      boundary.close();
    }
  }
  return {
    read: (context, binding) => request(context, binding),
    async put(context, binding, bytes) {
      const result = await request(context, binding, bytes);
      if (!result) throw new Error("CAPTURE_CUSTODY_UNAVAILABLE");
      return result;
    },
  };
}
