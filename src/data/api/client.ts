import { z } from "zod";

const apiBaseUrlSchema = z.string().url();

export type ApiClientOptions = {
  baseUrl?: string;
  accessToken?: string | null;
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
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    responseSchema: z.ZodType<T>,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImplementation(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(options.accessToken
            ? { Authorization: `Bearer ${options.accessToken}` }
            : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        throw new ApiClientError(
          `OTR API request failed: ${response.status}`,
          "http",
          response.status,
          body?.error?.code,
          body,
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

      if (controller.signal.aborted) {
        throw new ApiClientError("OTR API request timed out.", "timeout");
      }

      throw new ApiClientError("OTR API is unavailable.", "network");
    } finally {
      clearTimeout(timeout);
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
