import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createCaptureCustodyTransport } from "./captureCustodyTransport";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { captureCustodyBindingJson } from "@/domain/capture/captureCustody";
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
      "X-OTR-Capture-Binding": captureCustodyBindingJson(b),
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });
async function setup(fetcher = vi.fn(async () => response())) {
  const account = async () => b.accountId;
  const context = await captureAccountRequestContext("", account);
  const tokenProvider = vi.fn(async () => ({ userId: b.accountId, token: "synthetic" }));
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
    headers: { "X-OTR-Capture-Binding": captureCustodyBindingJson(b) },
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
