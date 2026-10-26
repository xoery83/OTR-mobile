import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { Task } from "../../src/domain/intelligence/persistence";
import { createUniversalSourceReader } from "./universalSourceRead";
import { createUniversalBackendRuntime } from "./universalRuntime";

function fixture(binary = false) {
  const bytes = Buffer.from(binary ? "synthetic-png-custody" : "Museum walk"),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  const r = {
    inputId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
    revision: 1,
    sha256,
    byteCount: bytes.length,
    mime: binary ? "image/png" : "text/plain",
    text: binary ? null : bytes.toString(),
  };
  const manifest = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    batchId: randomUUID(),
    taskId: randomUUID(),
    runId: randomUUID(),
    submissionSha256: "b".repeat(64),
    representations: [r],
  };
  const task = {
    account_id: manifest.accountId,
    trip_id: manifest.tripId,
    import_id: manifest.batchId,
    task_id: manifest.taskId,
    run_id: manifest.runId,
    manifest_sha256: manifest.submissionSha256,
    input_pins: [
      {
        kind: "SOURCE",
        source_id: r.sourceId,
        representation_id: r.representationId,
        material_revision: 1,
        payload_sha256: r.sha256,
        byte_count: r.byteCount,
        input_id: r.inputId,
      },
    ],
  } as Task;
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith("SELECT") ? [{ manifest: structuredClone(manifest) }] : [],
  }));
  const connection = {
    withLease: async <T>(
      f: (l: { query: typeof query; retire: () => void }) => Promise<T>,
    ) => f({ query, retire: vi.fn() }),
  };
  const readBinary = vi.fn(async () => bytes);
  return {
    bytes,
    manifest,
    r,
    task,
    query,
    readBinary,
    read: createUniversalSourceReader({ connection, readBinary }),
  };
}
it("reads real owning SQL TEXT pins twice without requiring a READY result Run", async () => {
  const f = fixture();
  const result = await f.read(f.task);
  expect(result.representations[0].bytes).toEqual(f.bytes);
  expect(f.readBinary).not.toHaveBeenCalled();
  expect(f.query.mock.calls.filter(([q]) => q.startsWith("SELECT"))).toHaveLength(2);
});
it("rechecks owning Source retention after binary custody I/O", async () => {
  const f = fixture(true);
  f.readBinary.mockImplementationOnce(async () => {
    f.manifest.representations[0].sha256 = "a".repeat(64);
    return f.bytes;
  });
  await expect(f.read(f.task)).rejects.toThrow("UNIVERSAL_SOURCE_CHANGED");
});
it("rejects changed Account and forged input identity before material read", async () => {
  const f = fixture();
  f.manifest.accountId = randomUUID();
  await expect(f.read(f.task)).rejects.toThrow("UNIVERSAL_SOURCE_BINDING_INVALID");
  const g = fixture(true);
  g.task.input_pins = [];
  await expect(g.read(g.task)).rejects.toThrow("UNIVERSAL_SOURCE_BINDING_INVALID");
  expect(g.readBinary).not.toHaveBeenCalled();
});
it("rejects binary custody bytes which do not match the owning hash", async () => {
  const f = fixture(true);
  f.readBinary.mockResolvedValueOnce(Buffer.from("different"));
  await expect(f.read(f.task)).rejects.toThrow("UNIVERSAL_SOURCE_MATERIAL_INVALID");
});
it("ordinary startup composition stays CLOSED without owning provisioning", async () => {
  expect(await createUniversalBackendRuntime()).toEqual({ status: "CLOSED" });
});
