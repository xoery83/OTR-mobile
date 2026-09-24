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
};

export type ApiErrorKind = "http" | "network" | "timeout" | "validation";

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
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);

    async function send(accessToken?: string | null) {
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

      try {
        return responseSchema.parse(await response.json());
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiClientError("OTR API returned an invalid response.", "validation");
        }

        throw error;
      }
    } catch (error) {
      if (error instanceof ApiClientError) throw error;

      throw new ApiClientError("OTR API is unavailable.", "network");
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
