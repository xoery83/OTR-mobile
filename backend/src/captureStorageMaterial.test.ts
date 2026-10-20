import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createCaptureStorageMaterial } from "./captureStorageMaterial";
import type { CaptureCustodyBinding } from "../../src/domain/capture/captureCustody";
const config = {
  instanceId: "synthetic",
  origin: "https://tuqigdxrvrerfewsxqgm.supabase.co",
  credentialRef: "synthetic",
  serviceToken: "synthetic",
  timeoutMs: 1000,
};
function binding(
  bytes: Uint8Array,
  mediaType: CaptureCustodyBinding["mediaType"],
): CaptureCustodyBinding {
  return {
    version: 1,
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
    mediaType,
  };
}
function setup(
  mediaType: CaptureCustodyBinding["mediaType"],
  size: number,
  loseAck = false,
) {
  const bytes = new Uint8Array(size);
  if (mediaType === "application/pdf") bytes.set([37, 80, 68, 70, 45]);
  else if (mediaType === "image/jpeg") {
    bytes.set([255, 216, 255]);
    bytes.set([255, 217], size - 2);
  } else bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const b = binding(bytes, mediaType);
  let retained: Uint8Array | null = null;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toContain(
      `/trip-source-material/capture/${b.accountId}/${b.inputId}`,
    );
    expect(init?.redirect).toBe("error");
    if (init?.method === "POST") {
      expect(init.headers).toMatchObject({
        "x-upsert": "false",
        "Content-Type": mediaType,
      });
      retained = new Uint8Array(init.body as ArrayBuffer).slice();
      if (loseAck) throw Error("synthetic lost ACK");
      return Response.json({ Id: randomUUID() });
    }
    return retained
      ? new Response(Uint8Array.from(retained).buffer, {
          headers: {
            "Content-Type": mediaType,
            "Content-Length": String(retained.length),
          },
        })
      : new Response(null, { status: 404 });
  });
  return {
    bytes,
    b,
    fetcher,
    store: createCaptureStorageMaterial(config, fetcher),
    corrupt() {
      retained = new Uint8Array(size);
    },
  };
}
it.each([
  ["application/pdf", 2943032],
  ["image/jpeg", 226541],
  ["image/png", 4194304],
] as const)(
  "opaque %s bytes survive upload/readback/replay without profile conversion",
  async (media, size) => {
    const f = setup(media, size);
    await f.store.put(f.b, f.bytes);
    const retained = await f.store.read(f.b);
    expect(retained?.length).toBe(f.bytes.length);
    expect(createHash("sha256").update(retained!).digest("hex")).toBe(f.b.sha256);
    await f.store.put(f.b, f.bytes);
    expect(f.fetcher.mock.calls.filter(([, i]) => i?.method === "POST")).toHaveLength(1);
  },
);
it("lost upload ACK is recovered only by actual pinned GET; wrong existing bytes never overwrite", async () => {
  const f = setup("application/pdf", 500, true);
  await f.store.put(f.b, f.bytes);
  const retained = await f.store.read(f.b);
  expect(retained?.length).toBe(f.bytes.length);
  expect(createHash("sha256").update(retained!).digest("hex")).toBe(f.b.sha256);
  f.corrupt();
  await expect(f.store.put(f.b, f.bytes)).rejects.toThrow("BINDING_CONFLICT");
  expect(f.fetcher.mock.calls.filter(([, i]) => i?.method === "POST")).toHaveLength(1);
});
it("unknown errors/missing readback, timeout and mismatched409 readback cannot claim success", async () => {
  for (const readStatus of [404, 503]) {
    const f = setup("application/pdf", 50);
    const fetcher = vi.fn<typeof fetch>(
      async (_u, init) =>
        new Response(null, { status: init?.method === "POST" ? 409 : readStatus }),
    );
    await expect(
      createCaptureStorageMaterial(config, fetcher).put(f.b, f.bytes),
    ).rejects.toThrow();
  }
  const f = setup("application/pdf", 50);
  const never = vi.fn<typeof fetch>(async () => new Promise(() => {}));
  await expect(
    createCaptureStorageMaterial({ ...config, timeoutMs: 5 }, never).put(f.b, f.bytes),
  ).rejects.toThrow();
});
it("rejects unsafe origin/path/media/pins before any network and bounds actual response", async () => {
  const f = setup("application/pdf", 50);
  expect(() =>
    createCaptureStorageMaterial(
      { ...config, origin: "https://example.invalid" },
      f.fetcher,
    ),
  ).toThrow();
  await expect(f.store.read({ ...f.b, inputId: "../escape" })).rejects.toThrow();
  await expect(
    f.store.put({ ...f.b, mediaType: "image/jpeg" }, f.bytes),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
  const oversized = vi.fn<typeof fetch>(
    async () =>
      new Response(new Uint8Array(51), {
        headers: { "Content-Type": "application/pdf", "Content-Length": "50" },
      }),
  );
  await expect(
    createCaptureStorageMaterial(config, oversized).read(f.b),
  ).rejects.toThrow();
});

it.each(["sb_secret_synthetic_fixture_key", "synthetic-existing-service-token"])(
  "matches installed Supabase Storage SDK auth headers for synthetic configuration %s",
  async (serviceToken) => {
    let sdkHeaders = new Headers();
    const sdkFetch: typeof fetch = async (_url, init) => {
      sdkHeaders = new Headers(init?.headers);
      return Response.json({ signedURL: "/object/sign/synthetic" });
    };
    const sdk = createClient(config.origin, serviceToken, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: sdkFetch },
    });
    await sdk.storage.from("trip-source-material").createSignedUrl("synthetic", 60);
    expect(sdkHeaders.get("apikey")).toBe(serviceToken);
    expect(sdkHeaders.get("Authorization")).toBe(`Bearer ${serviceToken}`);
    const f = setup("application/pdf", 50);
    await createCaptureStorageMaterial({ ...config, serviceToken }, f.fetcher).put(
      f.b,
      f.bytes,
    );
    expect(f.fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
    for (const [, init] of f.fetcher.mock.calls) {
      const actual = new Headers(init?.headers);
      expect(actual.get("apikey")).toBe(sdkHeaders.get("apikey"));
      expect(actual.get("Authorization")).toBe(sdkHeaders.get("Authorization"));
    }
  },
);
