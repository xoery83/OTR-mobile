import { reserveNativeQaGet, QaReadBudgetError } from "./nativeQaReadBudget";
import {
  nativeFetchDiagnostic,
  type NativeFetchDiagnostic,
  type SafeFetchName,
} from "./nativeFetchDiagnostic";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "./requestBoundary";
import { z } from "zod";

const apiBaseUrlSchema = z.string().url();

export type ApiClientOptions = {
  baseUrl?: string;
  accessToken?: string | null;
  accessTokenProvider?: (
    forceRefresh: boolean,
    rejectedToken?: string,
  ) => Promise<string>;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxResponseBytes?: number;
  assertRequestCurrent?: () => void;
  parseBoundedResponseText?: (text: string) => unknown;
};

export type ApiErrorKind = "http" | "network" | "timeout" | "validation";

export type ApiFailureDiagnostic = {
  method: string;
  route: string;
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  requestId?: string;
  at: string;
  stage?: "AUTH" | "FETCH" | "READ" | "VALIDATE";
  errorName?: SafeFetchName;
  thrownType?: NativeFetchDiagnostic["thrownType"];
  fetchClass?: NativeFetchDiagnostic["fetchClass"];
  nativeDomain?: NativeFetchDiagnostic["nativeDomain"];
  nativeCode?: number;
};
let lastFailure: ApiFailureDiagnostic | null = null;
export function readLastApiFailure() {
  return lastFailure;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = apiBaseUrlSchema.parse(
    options.baseUrl ?? process.env.EXPO_PUBLIC_OTR_API_BASE_URL,
  );
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    responseSchema: z.ZodType<T>,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    if (options.maxResponseBytes !== undefined || options.signal !== undefined) {
      return boundedRequest(method, path, responseSchema, body, headers);
    }
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);

    async function send(accessToken?: string | null) {
      reserveNativeQaGet(method, path, baseUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await fetchImplementation(`${baseUrl}${path}`, {
          method,
          headers: {
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...headers,
          },
          body: serializedBody,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted)
          throw new ApiClientError("OTR API request timed out.", "timeout");
        throw new ApiClientError(
          "OTR API is unavailable.",
          "network",
          undefined,
          undefined,
          error,
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    try {
      let accessToken = options.accessTokenProvider
        ? await options.accessTokenProvider(false)
        : options.accessToken;
      let response = await send(accessToken);
      if (response.status === 401 && options.accessTokenProvider) {
        accessToken = await options.accessTokenProvider(true, accessToken ?? undefined);
        response = await send(accessToken);
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string; requestId?: string };
        } | null;
        throw new ApiClientError(
          safeServerMessage(body?.error?.message) ??
            `OTR API request failed: ${response.status}`,
          "http",
          response.status,
          body?.error?.code,
          body,
          body?.error?.requestId ?? response.headers?.get?.("x-request-id") ?? undefined,
        );
      }

      const payload = await response.json();
      try {
        return responseSchema.parse(payload);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiClientError(
            "OTR API returned an invalid response.",
            "validation",
            response.status,
            error.issues
              .slice(0, 3)
              .map((issue) => {
                const value = issue.path.reduce<unknown>(
                  (current, key) =>
                    current && typeof current === "object"
                      ? (current as Record<PropertyKey, unknown>)[key]
                      : undefined,
                  payload,
                );
                const length =
                  typeof value === "string" && issue.code === "invalid_format"
                    ? `(${value.length} chars)`
                    : "";
                return `${issue.path.join(".")}:${issue.code}${length}`;
              })
              .join(","),
            undefined,
            response.headers?.get?.("x-request-id") ?? undefined,
          );
        }

        throw error;
      }
    } catch (error) {
      const failure =
        error instanceof ApiClientError
          ? error
          : error instanceof QaReadBudgetError
            ? new ApiClientError(
                "OTR QA read budget is closed.",
                "network",
                undefined,
                error.code,
              )
            : new ApiClientError("OTR API is unavailable.", "network");
      lastFailure = {
        method,
        route: path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id"),
        kind: failure.kind,
        status: failure.status,
        code: failure.code,
        requestId: failure.requestId,
        at: new Date().toISOString(),
      };
      console.info(JSON.stringify({ event: "api_request_failed", ...lastFailure }));
      throw failure;
    }
  }

  async function boundedRequest<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    let diagnosticHttpCode: string | undefined;
    let stage: "AUTH" | "FETCH" | "READ" | "VALIDATE" = "AUTH";
    const boundary = createRequestBoundary(
      timeoutMs,
      options.signal,
      options.assertRequestCurrent,
    );
    try {
      const maximum = options.maxResponseBytes ?? 4194304;
      if (!Number.isSafeInteger(maximum) || maximum < 1)
        throw new RequestBoundaryError("BODY_LIMIT");
      let token = options.accessTokenProvider
        ? await boundary.run(() => options.accessTokenProvider!(false))
        : options.accessToken;
      async function send() {
        stage = "FETCH";
        return boundary.run(() => {
          reserveNativeQaGet(method, path, baseUrl);
          return fetchImplementation(`${baseUrl}${path}`, {
            method,
            redirect: "error",
            signal: boundary.signal,
            headers: {
              ...(body === undefined ? {} : { "Content-Type": "application/json" }),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
        });
      }
      let response = await send();
      if (response.status === 401 && options.accessTokenProvider) {
        void response.body?.cancel().catch(() => undefined);
        stage = "AUTH";
        token = await boundary.run(() =>
          options.accessTokenProvider!(true, token ?? undefined),
        );
        response = await send();
      }
      stage = "READ";
      const payload = await readBoundedJson(
        response,
        response.ok ? maximum : 8192,
        boundary,
        response.ok ? options.parseBoundedResponseText : undefined,
      );
      if (!response.ok) {
        const error = z
          .object({ error: z.object({ code: z.string() }) })
          .safeParse(payload);
        if (
          error.success &&
          [
            "NOT_VISIBLE",
            "CORE_REPLAY_UNAVAILABLE",
            "CORE_CAPABILITY_CLOSED",
            "CORE_READ_UNAVAILABLE",
            "CORE_EXECUTION_UNAVAILABLE",
            "INVALID_PAYLOAD",
            "UNSUPPORTED_CLIENT",
            "OPERATION_REUSE_MISMATCH",
            "REVISION_CONFLICT",
            "GRAPH_CHANGED",
            "INVALID_BASE_VECTOR",
            "INVALID_TARGET_KIND",
          ].includes(error.data.error.code)
        )
          diagnosticHttpCode = error.data.error.code;
        const code =
          error.success &&
          [
            "AUTH_REQUIRED",
            "INVALID_SESSION",
            "TRIP_READ_FORBIDDEN",
            "PUBLICATION_AUTH_UNAVAILABLE",
            "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
            "IMPORT_READ_RESOURCE_LIMIT",
            "PUBLICATION_MEMBERSHIP_INTEGRITY",
            "INVALID_TRIP_ID",
            "INVALID_PUBLICATION_READ",
            "UNSUPPORTED_PUBLICATION_CATALOG_VERSION",
            "METHOD_NOT_ALLOWED",
            "BACKEND_UNAVAILABLE",
            "UNIVERSAL_IMPORT_CLOSED",
            "UNIVERSAL_CONTEXT_UNAVAILABLE",
          ].includes(error.data.error.code)
            ? error.data.error.code
            : undefined;
        throw new ApiClientError(
          "OTR API read is unavailable.",
          "http",
          response.status,
          code,
        );
      }
      stage = "VALIDATE";
      const parsed = schema.safeParse(payload);
      if (!parsed.success)
        throw new ApiClientError(
          "OTR API returned an invalid response.",
          "validation",
          response.status,
          "INVALID_RESPONSE",
        );
      boundary.assertCurrent();
      return parsed.data;
    } catch (error) {
      const failure =
        error instanceof ApiClientError
          ? error
          : error instanceof QaReadBudgetError
            ? new ApiClientError(
                "OTR QA read budget is closed.",
                "network",
                undefined,
                error.code,
              )
            : error instanceof RequestBoundaryError
              ? new ApiClientError(
                  "OTR API read is unavailable.",
                  error.code === "REQUEST_TIMEOUT" ? "timeout" : "validation",
                  undefined,
                  error.code,
                )
              : new ApiClientError("OTR API read is unavailable.", "network");
      // Same metadata-only diagnostic as ordinary requests. Never retain payload, headers or error.details.
      lastFailure = {
        method,
        route: path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id"),
        kind: failure.kind,
        status: failure.status,
        code: failure.code ?? diagnosticHttpCode,
        stage,
        errorName:
          error instanceof Error &&
          ["TypeError", "Error", "AbortError"].includes(error.name)
            ? (error.name as "TypeError" | "Error" | "AbortError")
            : undefined,
        ...((stage as NonNullable<ApiFailureDiagnostic["stage"]>) === "FETCH"
          ? nativeFetchDiagnostic(error)
          : {}),
        at: new Date().toISOString(),
      };
      console.info(JSON.stringify({ event: "api_request_failed", ...lastFailure }));
      throw failure;
    } finally {
      boundary.close();
    }
  }

  return {
    get<T>(
      path: string,
      responseSchema: z.ZodType<T>,
      headers?: Record<string, string>,
    ): Promise<T> {
      return request("GET", path, responseSchema, undefined, headers);
    },
    post<T>(
      path: string,
      body: unknown,
      responseSchema: z.ZodType<T>,
      headers?: Record<string, string>,
    ): Promise<T> {
      return request("POST", path, responseSchema, body, headers);
    },
    put<T>(
      path: string,
      body: unknown,
      responseSchema: z.ZodType<T>,
      headers?: Record<string, string>,
    ): Promise<T> {
      return request("PUT", path, responseSchema, body, headers);
    },
    patch<T>(
      path: string,
      body: unknown,
      responseSchema: z.ZodType<T>,
      headers?: Record<string, string>,
    ): Promise<T> {
      return request("PATCH", path, responseSchema, body, headers);
    },
    delete<T>(
      path: string,
      body: unknown,
      responseSchema: z.ZodType<T>,
      headers?: Record<string, string>,
    ): Promise<T> {
      return request("DELETE", path, responseSchema, body, headers);
    },
  };
}

function safeServerMessage(message: unknown) {
  if (typeof message !== "string") return undefined;
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]")
    .slice(0, 300);
}
