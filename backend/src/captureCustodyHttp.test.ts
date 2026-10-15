import { randomUUID, createHash } from "node:crypto";
import { it, expect, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { captureCustodyBoundary } from "./captureCustodyHttp";
import {
  captureCustodyBindingJson,
  captureCustodyBindingSchema,
  assertCaptureCustodyBytes,
  type CaptureMaterialCustody,
} from "../../src/domain/capture/captureCustody";

const bytes = new TextEncoder().encode("%PDF-1.4\nsynthetic-container");
const binding = {
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
function request(
  method = "GET",
  change: Partial<typeof binding> = {},
  headers = {},
  body: Uint8Array = bytes,
) {
  const b = { ...binding, ...change };
  return new Request(`https://api.example/v2/capture-inputs/${b.inputId}/material`, {
    method,
    headers: {
      Authorization: "Bearer synthetic",
      "X-OTR-Capture-Binding": captureCustodyBindingJson(b),
      ...(method === "PUT"
        ? { "Content-Type": b.mediaType, "Content-Length": String(b.byteCount) }
        : {}),
      ...headers,
    },
    ...(method === "PUT" ? { body: Uint8Array.from(body).buffer } : {}),
  });
}
function port() {
  let retained: string | null = null;
  return {
    put: vi.fn(async (b, input) => {
      assertCaptureCustodyBytes(b, input);
      if (retained && retained !== captureCustodyBindingJson(b))
        throw new Error("CAPTURE_CUSTODY_BINDING_CONFLICT");
      retained = captureCustodyBindingJson(b);
    }),
    read: vi.fn(async (b) => {
      if (!retained) return null;
      if (retained !== captureCustodyBindingJson(b))
        throw new Error("CAPTURE_CUSTODY_BINDING_CONFLICT");
      return bytes.slice();
    }),
  } satisfies CaptureMaterialCustody;
}
it("authenticates before custody and defaults CLOSED; actor is not a caller grant", async () => {
  const p = port();
  const gateway = {
    validateAccessToken: vi.fn(async (t: string) =>
      t === "synthetic" ? { id: binding.accountId } : null,
    ),
  } as unknown as DevBackendGateway;
  const handle = createDevBackendHandler({ gateway, captureMaterialCustody: p });
  expect(
    (await handle(request("PUT", {}, { Authorization: "Bearer invalid" }))).status,
  ).toBe(401);
  expect(p.put).not.toHaveBeenCalled();
  expect((await createDevBackendHandler({ gateway })(request())).status).toBe(503);
  expect((await handle(request("PUT", { accountId: randomUUID() }))).status).toBe(403);
  expect(p.put).not.toHaveBeenCalled();
  expect((await handle(request("PUT"))).status).toBe(200);
});
it("withholds absent association, recovers exact PUT/GET and rejects changed tuple", async () => {
  const p = port();
  const run = (r: Request) => captureCustodyBoundary(r, binding.accountId, p);
  expect((await run(request())).status).toBe(404);
  const writes = await Promise.all([run(request("PUT")), run(request("PUT"))]);
  expect(writes.map((r) => r.status)).toEqual([200, 200]);
  const read = await run(request());
  expect(read.status).toBe(200);
  expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes);
  expect(read.headers.get("Cache-Control")).toContain("no-store");
  expect((await run(request("PUT", { jobId: randomUUID() }))).status).toBe(409);
  expect((await run(request("GET", { payloadId: randomUUID() }))).status).toBe(409);
});
it("rejects actual hash/count/media mismatches, transforms, traversal and overflow", async () => {
  const p = port();
  const run = (r: Request) => captureCustodyBoundary(r, binding.accountId, p);
  for (const headers of [
    { "Content-Encoding": "gzip" },
    { Range: "bytes=0-1" },
    { "Content-Type": "image/jpeg" },
    { "Content-Length": "1" },
  ])
    expect((await run(request("PUT", {}, headers))).status).toBe(422);
  expect((await run(request("PUT", { sha256: "a".repeat(64) }))).status).toBe(422);
  expect((await run(request("PUT", {}, {}, new Uint8Array(bytes.length)))).status).toBe(
    422,
  );
  expect(
    (await run(request("PUT", {}, {}, new Uint8Array(bytes.length + 1)))).status,
  ).toBe(413);
  expect(
    captureCustodyBindingSchema.safeParse({ ...binding, byteCount: 4194305 }).success,
  ).toBe(false);
  expect(
    captureCustodyBindingSchema.safeParse({ ...binding, inputId: "../escape" }).success,
  ).toBe(false);
  expect(p.put).not.toHaveBeenCalled();
});
