import { readFileSync } from "node:fs";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { Task } from "../../src/domain/intelligence/persistence";
import { createUniversalSourceReader } from "./universalSourceRead";
import { createUniversalBackendRuntime } from "./universalRuntime";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";

function fixture(binary = false) {
  const bytes = binary
      ? readFileSync(
          new URL("../../output/photo/universal-photo-activity-qa.png", import.meta.url),
        )
      : Buffer.from("Museum walk"),
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
  const pngSource = {
    actorAccountId: manifest.accountId,
    tripId: manifest.tripId,
    sourceId: r.sourceId,
    representationId: r.representationId,
    sourceRevision: r.revision,
    sourceRowRevision: 1,
    sha256: r.sha256,
    byteCount: r.byteCount,
    verification: {
      attemptId: randomUUID(),
      operationId: randomUUID(),
      terminalEvidenceSha256: "e".repeat(64),
      profileId: "PNG_STATIC_RGB8_RGBA8_V1" as const,
      profileSha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
    },
  };
  // Synthetic owning proof only, not a real Source authority claim.
  const representation = r as typeof r & { pngSource?: typeof pngSource };
  if (binary) representation.pngSource = pngSource;
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
    r: representation,
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

it.each(["missing", "foreign", "text", "derived"])(
  "does not disclose PNG bytes with %s owning proof",
  async (fault) => {
    const f = fixture(true);
    if (fault === "missing") delete f.r.pngSource;
    if (fault === "foreign") f.r.pngSource!.representationId = randomUUID();
    if (fault === "text") f.r.text = "OCR is relevance only";
    if (fault === "derived")
      f.task.input_pins[0] = {
        ...f.task.input_pins[0],
        transform_sha256: "a".repeat(64),
      } as (typeof f.task.input_pins)[0];
    await expect(f.read(f.task)).rejects.toThrow("UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED");
    expect(f.readBinary).not.toHaveBeenCalled();
  },
);
it("discloses only original PNG bytes after two matching Source proof snapshots", async () => {
  const f = fixture(true);
  const result = await f.read(f.task);
  expect(result.representations[0].bytes).toEqual(f.bytes);
  expect(result.representations[0].mime).toBe("image/png");
  expect(f.query.mock.calls.filter(([sql]) => sql.startsWith("SELECT"))).toHaveLength(2);
});
it("reads TXT, sealed PDF text and one verified PNG from the same snapshot", async () => {
  const png = fixture(true);
  const txt = fixture();
  const pdf = fixture();
  const pdfSource = {
    original: { representationId: randomUUID(), sha256: "a".repeat(64), byteCount: 1700 },
    sealSha256: "b".repeat(64),
    pageMapSha256: "c".repeat(64),
    transformOptionsSha256: PDF_V2_OPTIONS_SHA,
  };
  Object.assign(pdf.r, { pdfSource });
  Object.assign(pdf.task.input_pins[0], { transform_sha256: PDF_V2_OPTIONS_SHA });
  png.manifest.representations.push(txt.r, pdf.r);
  png.task.input_pins.push(txt.task.input_pins[0], pdf.task.input_pins[0]);

  const result = await png.read(png.task);
  expect(result.representations.map((r) => r.bytes)).toEqual([
    png.bytes,
    txt.bytes,
    pdf.bytes,
  ]);
  expect(result.representations[2].pdfSource).toEqual(pdfSource);
  expect(png.readBinary).toHaveBeenCalledOnce();
  expect(png.query.mock.calls.filter(([sql]) => sql.startsWith("SELECT"))).toHaveLength(
    2,
  );
});
it("rejects two verified PNG representations before any binary read", async () => {
  const first = fixture(true);
  const second = fixture(true);
  Object.assign(second.r.pngSource!, {
    actorAccountId: first.manifest.accountId,
    tripId: first.manifest.tripId,
  });
  first.manifest.representations.push(second.r);
  first.task.input_pins.push(second.task.input_pins[0]);

  await expect(first.read(first.task)).rejects.toThrow(
    "UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED",
  );
  expect(first.readBinary).not.toHaveBeenCalled();
});
it("withholds PNG after the owning execution witness changes during custody I/O", async () => {
  const f = fixture(true);
  f.readBinary.mockImplementationOnce(async () => {
    f.r.pngSource!.verification.terminalEvidenceSha256 = "f".repeat(64);
    return f.bytes;
  });
  await expect(f.read(f.task)).rejects.toThrow("UNIVERSAL_SOURCE_CHANGED");
});
