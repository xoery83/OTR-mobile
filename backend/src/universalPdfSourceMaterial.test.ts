import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { sourcePdfV2ProofFixture } from "./__fixtures__/sourcePdfV2Proof";
import { readUniversalPdfSourceMaterial } from "./universalPdfSourceMaterial";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const f = await sourcePdfV2ProofFixture();
  const expected = {
    representationId: f.originalId,
    sha256: f.original.payload_sha256,
    byteCount: f.original.byte_count,
  };
  return {
    ...f,
    expected,
    read: () => readUniversalPdfSourceMaterial(f.lease, f.catalog, expected, hash),
  };
}
it("separates the exact retained original from the sealed derived Run representation", async () => {
  const f = await fixture();
  expect(await f.read()).toEqual({
    actorId: f.catalog.actorAccountId,
    tripId: f.catalog.tripId,
    sourceId: f.catalog.sourceId,
    materialRevision: 1,
    original: f.expected,
    derived: {
      representationId: f.derivedId,
      sha256: f.derived.payload_sha256,
      byteCount: f.derived.byte_count,
      text: f.derived.text_content,
    },
    sealSha256: f.sealed.seal_sha256,
    pageMapSha256: f.body.pageMapSha256,
  });
});
it.each([
  "missing",
  "multiple",
  "parent",
  "captureHash",
  "captureBytes",
  "captureIdentity",
  "source",
  "revision",
  "seal",
  "closed",
  "text",
  "oversize",
])("rejects %s without promoting PDF bytes to plain text", async (failure) => {
  const f = await fixture();
  if (failure === "missing") f.selections.splice(0);
  if (failure === "multiple") f.selections.push(f.selections[0]);
  if (failure === "parent") f.derived.parent_ids = [randomUUID()];
  if (failure === "captureHash") f.expected.sha256 = "c".repeat(64);
  if (failure === "captureBytes") f.expected.byteCount++;
  if (failure === "captureIdentity") f.expected.representationId = randomUUID();
  if (failure === "source") f.derived.source_id = randomUUID();
  if (failure === "revision") f.derived.introduced_revision = 2;
  if (failure === "seal") f.sealed.seal_sha256 = "c".repeat(64);
  if (failure === "closed") f.close();
  if (failure === "text") f.derived.text_content += "changed";
  if (failure === "oversize") f.expected.byteCount = 4194305;
  await expect(f.read()).rejects.toThrow();
});
