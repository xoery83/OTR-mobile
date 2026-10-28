import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { universalBoundary, type UniversalPort } from "./universalImport";

const actor = randomUUID(),
  trip = randomUUID(),
  batch = randomUUID(),
  task = randomUUID();
const binding = {
  version: "otr.backend.universal-context/1" as const,
  actorId: actor,
  accountId: actor,
  tripId: trip,
  batchId: batch,
  taskId: task,
};
function setup() {
  const port: UniversalPort = {
    readContext: vi.fn(async () => binding),
    execute: vi.fn(),
    read: vi.fn(),
  };
  const allowed = vi.fn(async () => true);
  const request = new Request(
    `https://example.invalid/v2/import-batches/${batch}/interpretations?tripId=${trip}`,
  );
  return { port, allowed, request };
}
it("discloses an existing owning Task binding without execute, result read or model call", async () => {
  const f = setup();
  const r = await universalBoundary(f.request, actor, f.allowed, f.port);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual(binding);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(f.port.execute).not.toHaveBeenCalled();
  expect(f.port.read).not.toHaveBeenCalled();
});
it("does not access a context reader before Trip read authorization", async () => {
  const f = setup();
  f.allowed.mockResolvedValue(false);
  expect((await universalBoundary(f.request, actor, f.allowed, f.port)).status).toBe(403);
  expect(f.port.readContext).not.toHaveBeenCalled();
});
it.each(["actorId", "accountId", "tripId", "batchId", "taskId"])(
  "withholds a mismatched %s instead of giving Native a replacement identity",
  async (field) => {
    const f = setup();
    vi.mocked(f.port.readContext!).mockResolvedValue({
      ...binding,
      [field]: field === "taskId" ? "invalid" : randomUUID(),
    });
    expect((await universalBoundary(f.request, actor, f.allowed, f.port)).status).toBe(
      404,
    );
  },
);
it("old Hosts without a context reader stay explicitly unavailable", async () => {
  const f = setup();
  delete f.port.readContext;
  expect((await universalBoundary(f.request, actor, f.allowed, f.port)).status).toBe(503);
});
it("a revoked or unavailable reader exposes no private diagnostics", async () => {
  const f = setup();
  vi.mocked(f.port.readContext!).mockRejectedValue(Error("private-source-secret"));
  const r = await universalBoundary(f.request, actor, f.allowed, f.port);
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("private-source-secret");
});

it("reports an authorized unprepared Batch as missing, not an unavailable service", async () => {
  const f = setup();
  vi.mocked(f.port.readContext!).mockRejectedValue(Error("UNIVERSAL_BATCH_NOT_PREPARED"));
  const r = await universalBoundary(f.request, actor, f.allowed, f.port);
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ error: { code: "TASK_NOT_FOUND" } });
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(f.port.execute).not.toHaveBeenCalled();
  expect(f.port.read).not.toHaveBeenCalled();
});
it.each([
  "CORE_CONNECTION_BUSY",
  "UNIVERSAL_AUTH_REJECTED",
  "OWNING_TASK_READER_UNAVAILABLE",
])("does not disguise %s as a normal unprepared Batch", async (failure) => {
  const f = setup();
  vi.mocked(f.port.readContext!).mockRejectedValue(Error(failure));
  const r = await universalBoundary(f.request, actor, f.allowed, f.port);
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: { code: "UNIVERSAL_CONTEXT_UNAVAILABLE" } });
  expect(f.port.execute).not.toHaveBeenCalled();
});
