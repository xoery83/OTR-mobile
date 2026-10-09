import { ApiClientError } from "@/data/api/client";
import { createRequestBoundary, RequestBoundaryError } from "@/data/api/requestBoundary";

export const PUBLICATION_CATALOG_DEV_ORIGIN = "https://api-dev.xoery.art";
const trusted = new WeakMap<
  typeof fetch,
  { available: () => boolean; bind: (expires?: number) => typeof fetch }
>();
let requestSequence = 0;

type NativeReceiver = {
  contractVersion(): number;
  receive(
    id: string,
    tripId: string,
    token: string,
    timeoutMs: number,
    expiresMs: number,
  ): Promise<unknown>;
  cancel(id: string): void;
  release(id: string): void;
};

function unavailable(): never {
  throw new ApiClientError(
    "Publication transport is unavailable.",
    "validation",
    undefined,
    "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
  );
}

export function publicationCatalogNativeCapability(candidate?: typeof fetch) {
  return candidate ? trusted.get(candidate)?.available() : undefined;
}

export function bindPublicationCatalogNativeDeadline(
  candidate: typeof fetch | undefined,
  expires: number,
) {
  return candidate && (trusted.get(candidate)?.bind(expires) ?? candidate);
}

// Explicit dormant factory; no global fetch, application caller or caller-supplied capability flag.
export async function createPublicationCatalogNativeFetch(): Promise<typeof fetch> {
  const [{ requireNativeModule }, { Platform }] = await Promise.all([
    import("expo"),
    import("react-native"),
  ]);
  if (Platform.OS !== "ios") unavailable();
  let native: NativeReceiver;
  try {
    native = requireNativeModule<NativeReceiver>("PublicationCatalogReceive");
  } catch {
    unavailable();
  }
  const available = () => {
    try {
      return (
        Platform.OS === "ios" &&
        requireNativeModule("PublicationCatalogReceive") === native &&
        native.contractVersion() === 1 &&
        typeof native.receive === "function" &&
        typeof native.cancel === "function" &&
        typeof native.release === "function"
      );
    } catch {
      return false;
    }
  };
  if (!available()) unavailable();
  function bind(expires?: number): typeof fetch {
    return (async (url: unknown, init?: RequestInit) => {
      if (!available()) unavailable();
      const match =
        typeof url === "string"
          ? /^https:\/\/api-dev\.xoery\.art\/v2\/trips\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/source-import-catalogs$/.exec(
              url,
            )
          : null;
      const headers = init?.headers;
      if (
        !match ||
        init?.method !== "GET" ||
        init.redirect !== "error" ||
        init.body !== undefined ||
        !headers ||
        Array.isArray(headers) ||
        Object.getPrototypeOf(headers) !== Object.prototype ||
        Object.keys(headers).length !== 2
      )
        unavailable();
      const fields = headers as Record<string, string>;
      const bearer = /^Bearer ([\x21-\x7e]{1,8192})$/.exec(fields.Authorization ?? "");
      if (!bearer || fields["X-OTR-Publication-Catalog-Version"] !== "1") unavailable();
      const deadlineMs = expires ?? Date.now() + 30_000;
      const remaining = Math.min(30_000, deadlineMs - Date.now());
      if (remaining <= 0) throw new RequestBoundaryError("REQUEST_TIMEOUT");
      const boundary = createRequestBoundary(remaining, init.signal ?? undefined);
      const id = `publication-${Date.now()}-${++requestSequence}`;
      const cancel = () => native.cancel(id);
      boundary.signal.addEventListener("abort", cancel, { once: true });
      try {
        const result = await boundary.run(() =>
          native.receive(
            id,
            match[1],
            bearer[1],
            Math.max(1, Math.floor(remaining)),
            deadlineMs,
          ),
        );
        if (typeof result !== "object" || result === null) unavailable();
        if ("error" in result) {
          const code = result.error;
          if (
            [
              "BODY_LIMIT",
              "REQUEST_CANCELED",
              "REQUEST_TIMEOUT",
              "INVALID_RESPONSE",
            ].includes(String(code))
          )
            throw new RequestBoundaryError(
              code as
                | "BODY_LIMIT"
                | "REQUEST_CANCELED"
                | "REQUEST_TIMEOUT"
                | "INVALID_RESPONSE",
            );
          throw new ApiClientError(
            "Publication read is unavailable.",
            "network",
            undefined,
            [
              "BUSY",
              "REDIRECT_DENIED",
              "TLS_FAILURE",
              "UNSUPPORTED_ENCODING",
              "NETWORK_FAILURE",
            ].includes(String(code))
              ? String(code)
              : "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
          );
        }
        if (
          !("status" in result) ||
          !Number.isInteger(result.status) ||
          typeof result.status !== "number" ||
          (result.status !== 200 && (result.status < 400 || result.status > 599)) ||
          !("bytes" in result) ||
          !(result.bytes instanceof Uint8Array) ||
          Object.keys(result).length !== 2
        )
          throw new RequestBoundaryError("INVALID_RESPONSE");
        let bytes: Uint8Array | undefined = result.bytes;
        if (bytes.byteLength > (result.status === 200 ? 4_194_304 : 8192))
          throw new RequestBoundaryError("BODY_LIMIT");
        // A complete bounded body only; no network-backed Response or clone/tee surface.
        const body = {
          async cancel() {
            bytes = undefined;
          },
          getReader() {
            return {
              async read() {
                if (init.signal?.aborted)
                  throw new RequestBoundaryError("REQUEST_CANCELED");
                boundary.assertCurrent();
                const value = bytes;
                bytes = undefined;
                return value ? { done: false, value } : { done: true, value: undefined };
              },
              async cancel() {
                bytes = undefined;
              },
              releaseLock() {},
            };
          },
        };
        boundary.assertCurrent();
        return {
          status: result.status,
          ok: result.status === 200,
          body,
        } as unknown as Response;
      } finally {
        boundary.signal.removeEventListener("abort", cancel);
        boundary.close();
        native.release(id);
      }
    }) as typeof fetch;
  }
  const adapter = bind();
  trusted.set(adapter, { available, bind });
  return adapter;
}
