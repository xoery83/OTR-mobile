import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import {
  tripDocumentOriginalBoundary,
  type DocumentOriginalReader,
} from "./tripDocumentOriginalHttp";

const actor = randomUUID();
const tripId = randomUUID();
const documentId = randomUUID();
const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const url = `https://api.example/v2/trips/${tripId}/documents/${documentId}/original`;
const canReadTrip = vi.fn(async () => true);

function request(token = "good", path = url, headers: Record<string, string> = {}) {
  return new Request(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-OTR-Content-Version": "1",
      "If-Match": `"${sha256}"`,
      ...headers,
    },
  });
}

function reader() {
  return {
    read: vi.fn(async () => ({
      status: "AVAILABLE" as const,
      documentId,
      contentVersion: 1,
      sha256,
      mediaType: "application/pdf",
      byteSize: bytes.byteLength,
      bytes,
    })),
  } satisfies DocumentOriginalReader;
}

it("authenticates before an optional original reader and stays unavailable by default", async () => {
  const gateway = {
    validateAccessToken: vi.fn(async (token: string) =>
      token === "good" ? { id: actor } : null,
    ),
    canReadTrip: vi.fn(async () => true),
  } as unknown as DevBackendGateway;
  const port = reader();
  const handle = createDevBackendHandler({ gateway, documentOriginalReader: port });
  const denied = await handle(request("bad"));
  expect(denied.status).toBe(401);
  expect(port.read).not.toHaveBeenCalled();
  const allowed = await handle(request());
  expect(allowed.status).toBe(200);
  expect(port.read).toHaveBeenCalledWith(actor, {
    actorAccountId: actor,
    tripId,
    documentId,
    contentVersion: 1,
    sha256,
  });
  const unavailable = await createDevBackendHandler({ gateway })(request());
  expect(unavailable.status).toBe(404);
  expect(await unavailable.json()).toEqual({
    error: { code: "ORIGINAL_UNAVAILABLE" },
  });
});

it("returns bounded private download bytes without a locator or active content type", async () => {
  const response = await tripDocumentOriginalBoundary(
    request(),
    actor,
    canReadTrip,
    reader(),
  );
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Authorization");
  expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
  expect(response.headers.get("Content-Disposition")).toContain("attachment");
  expect(response.headers.get("ETag")).toBe(`"${sha256}"`);
  expect(response.headers.get("X-OTR-Object-Key")).toBeNull();
});

it("rejects ambiguous or stale request forms before any private read", async () => {
  const port = reader();
  const invalid = [
    request("good", `${url}?x=1`),
    request("good", url, { Range: "bytes=0-1" }),
    request("good", url, { "X-OTR-Content-Version": "01" }),
    request("good", url, { "If-Match": sha256 }),
    request("good", url, { "If-Match": `"${"0".repeat(64)}"` }),
  ];
  for (const candidate of invalid.slice(0, 4))
    expect(
      (await tripDocumentOriginalBoundary(candidate, actor, canReadTrip, port)).status,
    ).toBe(404);
  expect(port.read).not.toHaveBeenCalled();
  expect(
    (await tripDocumentOriginalBoundary(invalid[4], actor, canReadTrip, port)).status,
  ).toBe(404);
  expect(port.read).toHaveBeenCalledOnce();
});

it("collapses denied or failing owning ports to one unavailable response", async () => {
  const unavailable = {
    read: vi.fn(async () => ({ status: "UNAVAILABLE" as const })),
  } satisfies DocumentOriginalReader;
  const denied = await tripDocumentOriginalBoundary(
    request(),
    actor,
    canReadTrip,
    unavailable,
  );
  expect(denied.status).toBe(404);
  expect(denied.headers.get("Cache-Control")).toBe("private, no-store");
  const failing = {
    read: vi.fn(async () => {
      throw new Error("private locator must not escape");
    }),
  } satisfies DocumentOriginalReader;
  const failed = await tripDocumentOriginalBoundary(
    request(),
    actor,
    canReadTrip,
    failing,
  );
  expect(failed.status).toBe(404);
  expect(await failed.text()).not.toContain("locator");
});

it("requires current Trip read access before touching the original port", async () => {
  const port = reader();
  const denied = await tripDocumentOriginalBoundary(
    request(),
    actor,
    async () => false,
    port,
  );
  expect(denied.status).toBe(404);
  expect(port.read).not.toHaveBeenCalled();
});
