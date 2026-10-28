import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createCaptureCustodyTransport } from "./captureCustodyTransport";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { captureCustodyBindingHeader } from "@/domain/capture/captureCustody";
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const bytes = new TextEncoder().encode("%PDF-1.4 synthetic");
const b = {
  version: 1 as const,
  accountId: randomUUID(),
  batchId: randomUUID(),
  jobId: randomUUID(),
  inputId: randomUUID(),
  inputRevision: 3,
  captureId: randomUUID(),
  payloadId: randomUUID(),
  captureRevision: 1,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  byteCount: bytes.length,
  mediaType: "application/pdf" as const,
};
const response = (body = bytes) =>
  new Response(Uint8Array.from(body).buffer, {
    headers: {
      "Content-Type": b.mediaType,
      "Content-Length": String(b.byteCount),
      ETag: `"${b.sha256}"`,
      "X-OTR-Capture-Binding": captureCustodyBindingHeader(b),
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });
async function setup(fetcher = vi.fn(async () => response())) {
  const account = async () => b.accountId;
  const context = await captureAccountRequestContext("", account);
  const tokenProvider = vi.fn(async () => ({
    userId: b.accountId,
    token: "synthetic",
  }));
  const t = createCaptureCustodyTransport(account, {
    baseUrl: "https://api.example",
    fetchImplementation: fetcher,
    tokenProvider,
  });
  return { context, t, tokenProvider, fetcher };
}
it("uses exact tuple/bytes, bounded verified readback and one401 refresh", async () => {
  const responses = [new Response(null, { status: 401 }), response()];
  const fetcher = vi.fn(async () => responses.shift()!);
  const x = await setup(fetcher);
  expect(await x.t.put(x.context, b, bytes)).toEqual(bytes);
  expect(x.tokenProvider).toHaveBeenCalledTimes(2);
  expect((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1]).toMatchObject({
    method: "PUT",
    redirect: "error",
    headers: { "X-OTR-Capture-Binding": captureCustodyBindingHeader(b) },
  });
});
it("404 recovery is unavailable, not new upload; malformed bytes and overflow reject", async () => {
  const x = await setup(vi.fn(async () => new Response(null, { status: 404 })));
  expect(await x.t.read(x.context, b)).toBeNull();
  expect(x.fetcher).toHaveBeenCalledTimes(1);
  for (const body of [new Uint8Array(bytes.length), new Uint8Array(bytes.length + 1)]) {
    const y = await setup(vi.fn(async () => response(body)));
    await expect(y.t.read(y.context, b)).rejects.toThrow();
  }
});
it("same-account new generation during credentials or response cannot disclose or upload", async () => {
  const x = await setup();
  x.tokenProvider.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return { userId: b.accountId, token: "synthetic" };
  });
  await expect(x.t.put(x.context, b, bytes)).rejects.toThrow(/Account changed/);
  expect(x.fetcher).not.toHaveBeenCalled();
  const y = await setup(
    vi.fn(async () => {
      advanceAccountGeneration();
      return response();
    }),
  );
  await expect(y.t.read(y.context, b)).rejects.toThrow(/Account changed/);
});

it.each(["put", "read"] as const)(
  "retired page/expiry during auth blocks actual %s dispatch",
  async (method) => {
    const account = async () => b.accountId,
      context = await captureAccountRequestContext("", account);
    let live = true;
    const fetcher = vi.fn(async () => response());
    const transport = createCaptureCustodyTransport(account, {
      baseUrl: "https://api.example",
      fetchImplementation: fetcher,
      tokenProvider: async () => {
        live = false;
        return { userId: b.accountId, token: "synthetic" };
      },
      assertRequestCurrent: () => {
        if (!live) throw new Error("CAPTURE_CUSTODY_DEV_EXPIRED");
      },
    });
    await expect(
      method === "put" ? transport.put(context, b, bytes) : transport.read(context, b),
    ).rejects.toThrow("DEV_EXPIRED");
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("preserves only safe non200 status and does not expose response bodies", async () => {
  for (const status of [400, 403, 409, 500]) {
    const reply = new Response("synthetic private body", { status });
    const text = vi.spyOn(reply, "text");
    const x = await setup(vi.fn(async () => reply));
    const error = await x.t.put(x.context, b, bytes).catch((e) => e);
    expect(error).toMatchObject({
      message: "CAPTURE_CUSTODY_UNAVAILABLE",
      kind: "http",
      status,
      code: "CAPTURE_CUSTODY_HTTP_REJECTED",
    });
    expect(error.details).toBeUndefined();
    expect(text).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toContain("synthetic private");
    expect(x.fetcher).toHaveBeenCalledTimes(1);
  }
});
it("retains one401 refresh then reports the second rejection without further retry", async () => {
  const x = await setup(vi.fn(async () => new Response("private", { status: 401 })));
  await expect(x.t.put(x.context, b, bytes)).rejects.toMatchObject({
    kind: "http",
    status: 401,
    code: "CAPTURE_CUSTODY_HTTP_REJECTED",
  });
  expect(x.tokenProvider).toHaveBeenCalledTimes(2);
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it("classifies fetch TypeError only and preserves other thrown errors", async () => {
  const x = await setup(
    vi.fn(async () => {
      throw new TypeError("private native detail");
    }),
  );
  const error = await x.t.put(x.context, b, bytes).catch((e) => e);
  expect(error).toMatchObject({
    kind: "network",
    code: "NATIVE_FETCH_FAILED",
    message: "CAPTURE_CUSTODY_UNAVAILABLE",
  });
  expect(error.details).toBeUndefined();
  expect(JSON.stringify(error)).not.toContain("private native");
  const original = new Error("CAPTURE_CUSTODY_DEV_EXPIRED");
  const y = await setup(
    vi.fn(async () => {
      throw original;
    }),
  );
  await expect(y.t.read(y.context, b)).rejects.toBe(original);
});

it("sanitizes the installed Expo FetchError prefix without retaining private URL or token", async () => {
  const x = await setup(
    vi.fn(async () => {
      throw new Error(
        "fetch failed: https://private.example?token=synthetic-private-token",
      );
    }),
  );
  const error = await x.t.put(x.context, b, bytes).catch((e) => e);
  expect(error).toMatchObject({
    kind: "network",
    code: "NATIVE_FETCH_FAILED",
    message: "CAPTURE_CUSTODY_UNAVAILABLE",
  });
  expect(error.details).toBeUndefined();
  expect(JSON.stringify(error)).not.toContain("private.example");
  expect(JSON.stringify(error)).not.toContain("synthetic-private-token");
});
it("v2 text uses normal authenticated transport with exact provenance and verified original bytes", async () => {
  const text = new TextEncoder().encode("Hello\n你好"),
    pin = {
      ...b,
      version: 2 as const,
      originalFilename: "行程✈️.txt",
      kind: "FILE" as const,
      acquisitionSource: "files" as const,
      mediaType: "text/plain" as const,
      byteCount: text.length,
      sha256: createHash("sha256").update(text).digest("hex"),
    };
  const x = await setup(
    vi.fn(
      async () =>
        new Response(Uint8Array.from(text).buffer, {
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": String(text.length),
            ETag: `"${pin.sha256}"`,
            "X-OTR-Capture-Binding": captureCustodyBindingHeader(pin),
            "Cache-Control": "private, no-store",
            Vary: "Authorization",
          },
        }),
    ),
  );
  expect(await x.t.put(x.context, pin, text)).toEqual(text);
  expect(x.tokenProvider).toHaveBeenCalledOnce();
  expect(
    (x.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
  ).toMatchObject({
    Authorization: "Bearer synthetic",
    "X-OTR-Capture-Binding": captureCustodyBindingHeader(pin),
    "Content-Type": "text/plain",
  });
});
