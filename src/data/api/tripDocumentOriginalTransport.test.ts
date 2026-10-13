import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripDocumentOriginalTransport } from "./tripDocumentOriginalTransport";

vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));

const actor = "10000000-0000-4000-8000-000000000001";
const tripId = "10000000-0000-4000-8000-000000000002";
const documentId = "10000000-0000-4000-8000-000000000003";
const bytes = new Uint8Array([1, 2, 3, 4]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const input = { tripId, documentId, contentVersion: 3, sha256, byteSize: bytes.length };

function original(body: Uint8Array = bytes, headers: Record<string, string> = {}) {
  return new Response(Uint8Array.from(body).buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.byteLength),
      ETag: `"${sha256}"`,
      "X-OTR-Content-Version": "3",
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
      ...headers,
    },
  });
}

function setup(responses: Response[]) {
  let accountId = actor;
  const fetchImplementation = vi.fn(async () => responses.shift()!);
  const tokenProvider = vi.fn(async () => ({
    userId: actor,
    token: "opaque-test-token",
  }));
  const transport = createTripDocumentOriginalTransport(async () => accountId, {
    baseUrl: "https://api.example",
    fetchImplementation,
    tokenProvider,
  });
  return {
    transport,
    fetchImplementation,
    tokenProvider,
    switchAccount() {
      accountId = "10000000-0000-4000-8000-000000000004";
      advanceAccountGeneration();
    },
  };
}

it("requests exact actor-scoped version/hash and verifies bounded original bytes", async () => {
  const f = setup([original()]);
  expect(await f.transport.read(input)).toEqual(bytes);
  const [url, request] = f.fetchImplementation.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe(
    `https://api.example/v2/trips/${tripId}/documents/${documentId}/original`,
  );
  expect(request.method).toBe("GET");
  expect(request.redirect).toBe("error");
  expect(request.body).toBeUndefined();
  expect(request.headers).toMatchObject({
    Authorization: "Bearer opaque-test-token",
    "X-OTR-Content-Version": "3",
    "If-Match": `"${sha256}"`,
  });
  expect(f.tokenProvider).toHaveBeenCalledWith({
    expectedUserId: actor,
    forceRefresh: false,
    rejectedToken: undefined,
  });
});

it("treats the closed Backend port as unavailable without exposing bytes", async () => {
  const f = setup([new Response(null, { status: 404 })]);
  expect(await f.transport.read(input)).toBeNull();
  expect(f.fetchImplementation).toHaveBeenCalledTimes(1);
});

it("retries one authenticated rejection and rejects malformed or changed responses", async () => {
  const f = setup([new Response(null, { status: 401 }), original()]);
  expect(await f.transport.read(input)).toEqual(bytes);
  expect(f.tokenProvider).toHaveBeenLastCalledWith({
    expectedUserId: actor,
    forceRefresh: true,
    rejectedToken: "opaque-test-token",
  });
  await expect(
    setup([original(bytes, { ETag: `"${"0".repeat(64)}"` })]).transport.read(input),
  ).rejects.toThrow("RESPONSE_INVALID");
  await expect(
    setup([original(new Uint8Array([9, 9, 9, 9]))]).transport.read(input),
  ).rejects.toThrow("RESPONSE_INVALID");
});

it("does not read oversized, absent-stream or invalid identity responses", async () => {
  await expect(
    setup([
      original(bytes, { "Content-Length": String(11 * 1024 * 1024) }),
    ]).transport.read(input),
  ).rejects.toThrow("RESPONSE_INVALID");
  await expect(
    setup([original()]).transport.read({ ...input, byteSize: 0 }),
  ).rejects.toThrow("IDENTITY_INVALID");
  const noStream = original();
  Object.defineProperty(noStream, "body", { value: null });
  await expect(setup([noStream]).transport.read(input)).rejects.toThrow(
    "STREAM_UNAVAILABLE",
  );
  const oversized = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "4",
        ETag: `"${sha256}"`,
        "X-OTR-Content-Version": "3",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    },
  );
  await expect(setup([oversized]).transport.read(input)).rejects.toThrow("SIZE_LIMIT");
});

it("refuses to return bytes after an Account generation switch", async () => {
  let switchAccount!: () => void;
  const changed = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        switchAccount();
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "4",
        ETag: `"${sha256}"`,
        "X-OTR-Content-Version": "3",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    },
  );
  const f = setup([changed]);
  switchAccount = f.switchAccount;
  await expect(f.transport.read(input)).rejects.toThrow("Account changed");
});
