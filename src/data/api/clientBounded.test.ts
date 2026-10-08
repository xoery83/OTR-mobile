import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient } from "./client";
const baseUrl = "https://local";
const schema = z.object({ text: z.string() });
const encoder = new TextEncoder();
function streamed(body: string, headers: HeadersInit = {}, status = 200) {
  const bytes = encoder.encode(body);
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        const next = Math.min(offset + 65536, bytes.length);
        controller.enqueue(bytes.slice(offset, next));
        offset = next;
      },
    }),
    { status, headers },
  );
}
function client(
  fetchImplementation: typeof fetch,
  options: Record<string, unknown> = {},
) {
  return createApiClient({
    baseUrl,
    fetchImplementation,
    maxResponseBytes: 4194304,
    ...options,
  });
}
afterEach(() => vi.useRealTimers());
describe("bounded full-operation authenticated reads", () => {
  it.each<HeadersInit>([{}, { "content-length": "1" }, { "content-length": "9000000" }])(
    "counts actual UTF-8 bytes with missing/lying Content-Length %j",
    async (headers) => {
      const prefix = '{"text":"',
        suffix = '"}';
      const body =
        prefix +
        "旅".repeat(1000000) +
        "a".repeat(4194304 - 3000000 - encoder.encode(prefix + suffix).length) +
        suffix;
      expect(encoder.encode(body)).toHaveLength(4194304);
      await expect(
        client(vi.fn(async () => streamed(body, headers))).get("/catalog", schema),
      ).resolves.toHaveProperty("text");
      const overflow = body.slice(0, -2) + "a" + suffix;
      await expect(
        client(vi.fn(async () => streamed(overflow, headers))).get("/catalog", schema),
      ).rejects.toMatchObject({ code: "BODY_LIMIT" });
    },
  );
  it("never parses an overflowing body, caps errors and retains no private details", async () => {
    const parse = vi.spyOn(JSON, "parse");
    await expect(
      client(vi.fn(async () => streamed("x".repeat(4194305)))).get("/catalog", schema),
    ).rejects.toMatchObject({ code: "BODY_LIMIT" });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    await expect(
      client(vi.fn(async () => streamed("x".repeat(8193), {}, 503))).get(
        "/catalog",
        schema,
      ),
    ).rejects.toMatchObject({ code: "BODY_LIMIT" });
    try {
      await client(
        vi.fn(async () =>
          streamed(
            JSON.stringify({
              error: { code: "AUTH_REQUIRED", message: "private-evidence" },
              secret: "private",
            }),
            {},
            401,
          ),
        ),
      ).get("/catalog", schema);
    } catch (e) {
      expect(JSON.stringify(e)).not.toContain("private");
      expect(e).toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
    }
  });
  it("rejects native/nonstreaming responses without text/json/arrayBuffer fallback", async () => {
    const response = {
      ok: true,
      status: 200,
      body: undefined,
      text: vi.fn(),
      json: vi.fn(),
      arrayBuffer: vi.fn(),
    };
    await expect(
      client(vi.fn(async () => response as unknown as Response)).get("/catalog", schema),
    ).rejects.toMatchObject({ code: "STREAM_UNAVAILABLE" });
    expect(response.text).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(response.arrayBuffer).not.toHaveBeenCalled();
  });
  it.each(["token", "headers", "body"] as const)(
    "deadline covers abort-ignoring %s",
    async (phase) => {
      vi.useFakeTimers();
      const forever = () => new Promise<never>(() => undefined);
      const response = new Response(new ReadableStream({ pull: forever }));
      const c = client(
        vi.fn(
          phase === "headers"
            ? forever
            : async () => (phase === "body" ? response : streamed('{"text":"ok"}')),
        ),
        {
          timeoutMs: 10,
          accessTokenProvider: phase === "token" ? forever : async () => "token",
        },
      );
      const assertion = expect(c.get("/catalog", schema)).rejects.toMatchObject({
        kind: "timeout",
        code: "REQUEST_TIMEOUT",
      });
      await vi.advanceTimersByTimeAsync(11);
      await assertion;
    },
  );
  it.each(["token", "headers", "body"] as const)(
    "cancels and rejects late %s",
    async (phase) => {
      const controller = new AbortController();
      let late!: () => void;
      const response = new Response(
        new ReadableStream({
          pull(c) {
            return new Promise<void>((resolve) => {
              late = () => {
                try {
                  c.enqueue(encoder.encode('{"text":"late"}'));
                  c.close();
                } catch {
                  /* canceled */
                }
                resolve();
              };
            });
          },
        }),
      );
      const token =
        phase === "token"
          ? () =>
              new Promise<string>((resolve) => {
                late = () => resolve("token");
              })
          : async () => "token";
      const send = vi.fn(
        phase === "headers"
          ? () =>
              new Promise<Response>((resolve) => {
                late = () => resolve(streamed('{"text":"late"}'));
              })
          : async () => response,
      );
      const pending = client(send, {
        signal: controller.signal,
        accessTokenProvider: token,
      }).get("/catalog", schema);
      const assertion = expect(pending).rejects.toMatchObject({
        code: "REQUEST_CANCELED",
      });
      for (let i = 0; i < 20 && !late; i++) await Promise.resolve();
      controller.abort();
      await assertion;
      late?.();
      await Promise.resolve();
      if (phase === "token") expect(send).not.toHaveBeenCalled();
    },
  );
  it("replays401 exactly once with the original path/body and rotated token", async () => {
    const provider = vi.fn(async (force: boolean) => (force ? "new" : "old"));
    const send = vi.fn(async () =>
      streamed('{"error":{"code":"INVALID_SESSION"}}', {}, 401),
    );
    await expect(
      client(send, { accessTokenProvider: provider }).get("/catalog", schema),
    ).rejects.toMatchObject({ status: 401 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls).toEqual([[false], [true, "old"]]);
    expect(
      send.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1].headers),
    ).toEqual([{ Authorization: "Bearer old" }, { Authorization: "Bearer new" }]);
    expect(
      send.mock.calls.every(
        (c) => (c as unknown as [string, RequestInit])[1].redirect === "error",
      ),
    ).toBe(true);
  });
  it("classifies malformed JSON/UTF-8 as validation, without payload diagnostics", async () => {
    await expect(
      client(vi.fn(async () => streamed("private-invalid-json"))).get("/catalog", schema),
    ).rejects.toMatchObject({ kind: "validation", code: "INVALID_RESPONSE" });
    await expect(
      client(vi.fn(async () => new Response(new Uint8Array([255])))).get(
        "/catalog",
        schema,
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

it("unknown remote error codes cannot retain private evidence", async () => {
  try {
    await client(
      vi.fn(async () =>
        streamed(
          JSON.stringify({
            error: { code: "PRIVATE_EVIDENCE_CANARY", message: "secret" },
          }),
          {},
          503,
        ),
      ),
    ).get("/catalog", schema);
    throw new Error("expected rejection");
  } catch (error) {
    expect(error).toMatchObject({ status: 503 });
    expect(JSON.stringify(error)).not.toContain("PRIVATE_EVIDENCE_CANARY");
    expect(JSON.stringify(error)).not.toContain("secret");
  }
});

it("AbortSignal alone enables the full-operation boundary", async () => {
  const controller = new AbortController();
  controller.abort();
  const send = vi.fn();
  const c = createApiClient({
    baseUrl,
    fetchImplementation: send,
    signal: controller.signal,
  });
  await expect(c.get("/catalog", schema)).rejects.toMatchObject({
    code: "REQUEST_CANCELED",
  });
  expect(send).not.toHaveBeenCalled();
});

it("ordinary API parsing retains duplicate-last and fractional numeric behavior", async () => {
  for (const bounded of [false, true]) {
    const c = createApiClient({
      baseUrl,
      ...(bounded ? { maxResponseBytes: 4194304 } : {}),
      fetchImplementation: async () => new Response('{"value":0,"value":1.5}'),
    });
    await expect(c.get("/ordinary", z.object({ value: z.number() }))).resolves.toEqual({
      value: 1.5,
    });
  }
});
