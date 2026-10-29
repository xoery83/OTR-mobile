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

it("preserves separately pinned PDF original metadata across the same owning two-read check", async () => {
  const f = fixture();
  const { PDF_V2_OPTIONS_SHA } = await import("./sourcePdfV2Contracts");
  const pdfSource = {
    original: { representationId: randomUUID(), sha256: "c".repeat(64), byteCount: 1700 },
    sealSha256: "d".repeat(64),
    pageMapSha256: "e".repeat(64),
    transformOptionsSha256: PDF_V2_OPTIONS_SHA,
  };
  Object.assign(f.r, { pdfSource });
  Object.assign(f.task.input_pins[0], { transform_sha256: PDF_V2_OPTIONS_SHA });
  const result = await f.read(f.task);
  expect(result.representations[0]).toMatchObject({
    originalSha256: f.r.sha256,
    pdfSource,
  });
  expect(f.readBinary).not.toHaveBeenCalled();
});
it("PDF original metadata drift between snapshots refuses material", async () => {
  const f = fixture();
  const { PDF_V2_OPTIONS_SHA } = await import("./sourcePdfV2Contracts");
  const meta = {
    original: { representationId: randomUUID(), sha256: "c".repeat(64), byteCount: 1700 },
    sealSha256: "d".repeat(64),
    pageMapSha256: "e".repeat(64),
    transformOptionsSha256: PDF_V2_OPTIONS_SHA,
  };
  Object.assign(f.r, { pdfSource: meta });
  Object.assign(f.task.input_pins[0], { transform_sha256: PDF_V2_OPTIONS_SHA });
  let reads = 0;
  f.query.mockImplementation(async (sql) => {
    if (!sql.startsWith("SELECT")) return { rows: [] };
    if (++reads === 2) meta.original.sha256 = "f".repeat(64);
    return { rows: [{ manifest: structuredClone(f.manifest) }] };
  });
  await expect(f.read(f.task)).rejects.toThrow("UNIVERSAL_SOURCE_CHANGED");
});

it.each([
  "missing-transform",
  "wrong-transform",
  "same-parent",
  "wrong-profile",
  "wrong-media",
])("rejects PDF %s before reading material", async (failure) => {
  const f = fixture();
  const { PDF_V2_OPTIONS_SHA } = await import("./sourcePdfV2Contracts");
  const pdfSource = {
    original: { representationId: randomUUID(), sha256: "c".repeat(64), byteCount: 1700 },
    sealSha256: "d".repeat(64),
    pageMapSha256: "e".repeat(64),
    transformOptionsSha256: PDF_V2_OPTIONS_SHA,
  };
  Object.assign(f.r, { pdfSource });
  Object.assign(f.task.input_pins[0], {
    transform_sha256:
      failure === "missing-transform"
        ? null
        : failure === "wrong-transform"
          ? "a".repeat(64)
          : PDF_V2_OPTIONS_SHA,
  });
  if (failure === "same-parent")
    pdfSource.original.representationId = f.r.representationId;
  if (failure === "wrong-profile") pdfSource.transformOptionsSha256 = "a".repeat(64);
  if (failure === "wrong-media") f.r.mime = "text/html";
  await expect(f.read(f.task)).rejects.toThrow("UNIVERSAL_SOURCE_MATERIAL_INVALID");
  expect(f.readBinary).not.toHaveBeenCalled();
});

it("does not let a pinned PDF derivative lose its original provenance", async () => {
  const f = fixture();
  const { PDF_V2_OPTIONS_SHA } = await import("./sourcePdfV2Contracts");
  Object.assign(f.task.input_pins[0], { transform_sha256: PDF_V2_OPTIONS_SHA });
  await expect(f.read(f.task)).rejects.toThrow("UNIVERSAL_SOURCE_MATERIAL_INVALID");
});
