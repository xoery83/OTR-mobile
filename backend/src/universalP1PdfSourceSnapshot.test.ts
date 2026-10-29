// Synthetic sealed Source read only; no SQL/runtime activation or real Admission.
import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { sourcePdfV2ProofFixture } from "./__fixtures__/sourcePdfV2Proof";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import { readP1SourceSnapshot } from "./universalP1SourcePg";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const f = await sourcePdfV2ProofFixture(),
    t = await universalP1SourceFixture();
  const source = {
    ...t.input.snapshot.sources[0],
    id: f.catalog.sourceId,
    trip_id: f.catalog.tripId,
    acquired_by: f.catalog.actorAccountId,
    source_kind: "FILE",
    acquisition_channel: "FILES",
    row_revision: 2,
  };
  const derived = {
    ...t.input.snapshot.representations[0],
    ...f.derived,
    mime_type: "text/plain",
    encoding: "UTF-8",
  };
  Object.assign(f.derived, derived);
  f.catalog.source = source;
  const pin = {
    ...t.input.snapshot.materials[0].pin,
    source_id: f.catalog.sourceId,
    representation_id: f.derivedId,
    payload_sha256: f.derived.payload_sha256,
    byte_count: f.derived.byte_count,
    observed_source_row_revision: 2,
  };
  f.catalog.inputs = [pin];
  const binding = {
    alias: "S0",
    inputId: pin.id,
    sourceId: f.catalog.sourceId,
    representationId: f.derivedId,
    revision: 1,
    mime: "text/plain",
    originalSha256: f.derived.payload_sha256,
    submittedSha256: f.derived.payload_sha256,
    status: "READY",
    pdfSource: {
      original: {
        representationId: f.originalId,
        sha256: f.original.payload_sha256,
        byteCount: f.original.byte_count,
      },
      sealSha256: f.sealed.seal_sha256,
      pageMapSha256: f.body.pageMapSha256,
      transformOptionsSha256: PDF_V2_OPTIONS_SHA,
    },
  };
  const lease = {
    retire: f.lease.retire,
    query: async (sql: string, args?: readonly unknown[]) =>
      sql.includes("AS representations,")
        ? { rows: [{ representations: [derived], associations: [], source }] }
        : f.lease.query(sql, args),
  };
  return {
    ...f,
    snapshotRepresentation: derived,
    pin,
    binding,
    read: () => readP1SourceSnapshot(lease, f.catalog, hash, [binding]),
  };
}
it("qualifies sealed derived text using its exact PDF original and published provenance", async () => {
  const f = await fixture(),
    snapshot = await f.read();
  expect(snapshot.materials).toEqual([
    { pin: f.pin, text: f.derived.text_content, media_type: "text/plain", form: "TEXT" },
  ]);
  expect(snapshot.representations[0].role).toBe("DERIVED");
});
it.each([
  "closed",
  "parent",
  "original-hash",
  "original-size",
  "seal",
  "page-map",
  "profile",
  "material",
  "missing-provenance",
  "false-original",
])("refuses PDF %s without qualifying a lifecycle snapshot", async (failure) => {
  const f = await fixture();
  if (failure === "closed") f.close();
  if (failure === "false-original") f.snapshotRepresentation.role = "ORIGINAL";
  if (failure === "parent") f.derived.parent_ids = [randomUUID()];
  if (failure === "original-hash") f.binding.pdfSource.original.sha256 = "c".repeat(64);
  if (failure === "original-size") f.binding.pdfSource.original.byteCount++;
  if (failure === "seal") f.binding.pdfSource.sealSha256 = "c".repeat(64);
  if (failure === "page-map") f.binding.pdfSource.pageMapSha256 = "c".repeat(64);
  if (failure === "profile") f.binding.pdfSource.transformOptionsSha256 = "c".repeat(64);
  if (failure === "material") f.derived.text_content += " changed";
  if (failure === "missing-provenance")
    delete (f.binding as { pdfSource?: unknown }).pdfSource;
  await expect(f.read()).rejects.toThrow();
});

it("keeps ordinary ORIGINAL TEXT lifecycle material unchanged", async () => {
  const f = await universalP1SourceFixture();
  const expected = f.input.snapshot;
  const lease = {
    retire: () => {},
    query: async () => ({
      rows: [
        {
          representations: expected.representations,
          associations: expected.associations,
          source: expected.sources[0],
        },
      ],
    }),
  };
  expect(await readP1SourceSnapshot(lease, f.input.catalog, hash)).toEqual(expected);
});
