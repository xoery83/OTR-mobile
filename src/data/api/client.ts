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

  return {
    async get<T>(path: string, responseSchema: z.ZodType<T>): Promise<T> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImplementation(`${baseUrl}${path}`, {
          headers: options.accessToken
            ? { Authorization: `Bearer ${options.accessToken}` }
            : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ApiClientError(
            `OTR API request failed: ${response.status}`,
            "http",
            response.status,
          );
        }

        try {
          return responseSchema.parse(await response.json());
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new ApiClientError(
              "OTR API returned an invalid response.",
              "validation",
            );
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
    },
  };
}
