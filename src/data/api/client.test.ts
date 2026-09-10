import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiClientError, createApiClient } from "./client";

const responseSchema = z.object({ id: z.string() });

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("OTR API client", () => {
  it("injects auth and validates typed responses", async () => {
    const fetchImplementation = async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({ Authorization: "Bearer access-token" });
      return response(200, { id: "trip-1" });
    };

    const client = createApiClient({
      baseUrl: "https://api.example.com",
      accessToken: "access-token",
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(client.get("/trips", responseSchema)).resolves.toEqual({
      id: "trip-1",
    });
  });

  it("sends typed JSON posts with auth and idempotency headers", async () => {
    const fetchImplementation = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init).toMatchObject({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "operation-1",
        },
        body: JSON.stringify({ title: "Train" }),
      });
      return response(200, { id: "expense-1" });
    });
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      accessToken: "access-token",
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(
      client.post("/expenses", { title: "Train" }, responseSchema, {
        "Idempotency-Key": "operation-1",
      }),
    ).resolves.toEqual({ id: "expense-1" });
  });

  it("normalizes HTTP and invalid-payload failures", async () => {
    const httpClient = createApiClient({
      baseUrl: "https://api.example.com",
      fetchImplementation: (async () => response(403, {})) as typeof fetch,
    });
    const invalidPayloadClient = createApiClient({
      baseUrl: "https://api.example.com",
      fetchImplementation: (async () => response(200, { id: 42 })) as typeof fetch,
    });

    await expect(httpClient.get("/trips", responseSchema)).rejects.toMatchObject({
      kind: "http",
      status: 403,
    } satisfies Partial<ApiClientError>);
    await expect(
      invalidPayloadClient.get("/trips", responseSchema),
    ).rejects.toMatchObject({ kind: "validation" } satisfies Partial<ApiClientError>);
  });

  it("normalizes timeouts", async () => {
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      timeoutMs: 1,
      fetchImplementation: ((_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })) as typeof fetch,
    });

    await expect(client.get("/trips", responseSchema)).rejects.toMatchObject({
      kind: "timeout",
    } satisfies Partial<ApiClientError>);
  });
});
