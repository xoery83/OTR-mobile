import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import { flightInputSchema } from "../../src/domain/trip/flightImportReview";
import { readUniversalPngSourceMaterial } from "./universalPngSourceMaterial";

async function fixture() {
  const f = await universalP1SourceFixture();
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    "base64",
  );
  const pin = {
    ...flightInputSchema.parse(f.input.catalog.inputs[0]),
    payload_sha256: await f.deps.hash(bytes),
    byte_count: bytes.length,
  };
  const proof = {
    actorAccountId: f.input.catalog.actorAccountId,
    tripId: f.input.catalog.tripId,
    sourceId: pin.source_id,
    representationId: pin.representation_id,
    sourceRevision: 1,
    sourceRowRevision: 1,
    sha256: pin.payload_sha256,
    byteCount: bytes.length,
    verification: {
      attemptId: randomUUID(),
      operationId: randomUUID(),
      terminalEvidenceSha256: "a".repeat(64),
      profileId: "PNG_STATIC_RGB8_RGBA8_V1",
      profileSha256: "526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5",
    },
  };
  const query = vi.fn(async () => ({ rows: [{ proof: structuredClone(proof) }] }));
  const read = vi.fn(async () => new Uint8Array(bytes));
  const run = () =>
    readUniversalPngSourceMaterial(
      { query } as never,
      f.input.catalog,
      pin,
      f.deps.hash,
      read,
    );
  return { ...f, pin, proof, query, read, run };
}
it("binds owning proof and exact retained bytes under the same Source scope and rechecks before disclosure", async () => {
  const f = await fixture(),
    material = await f.run();
  expect(material).toMatchObject({
    form: "IMAGE",
    width: 1,
    height: 1,
    pin: f.pin,
    verification: f.proof.verification,
  });
  expect(f.read).toHaveBeenCalledExactlyOnceWith({
    accountId: f.input.context.accountId,
    tripId: f.input.context.tripId,
    sourceId: f.pin.source_id,
    representationId: f.pin.representation_id,
    sha256: f.pin.payload_sha256,
    byteCount: f.pin.byte_count,
  });
  expect(f.query).toHaveBeenCalledTimes(2);
});
it.each(["scope", "hash", "revision", "profile", "custody", "late-change", "closed"])(
  "refuses %s owning material without a text fallback",
  async (failure) => {
    const f = await fixture();
    if (failure === "scope") f.proof.actorAccountId = randomUUID();
    if (failure === "hash") f.proof.sha256 = "b".repeat(64);
    if (failure === "revision") f.proof.sourceRowRevision++;
    if (failure === "profile") f.proof.verification.profileSha256 = "b".repeat(64);
    if (failure === "custody") f.read.mockResolvedValue(new Uint8Array([1, 2, 3]));
    if (failure === "late-change")
      f.query
        .mockImplementationOnce(async () => ({
          rows: [{ proof: structuredClone(f.proof) }],
        }))
        .mockImplementationOnce(async () => ({
          rows: [{ proof: { ...f.proof, sourceRowRevision: 2 } }],
        }));
    if (failure === "closed")
      f.query.mockRejectedValue(Error("UNIVERSAL_PNG_SCOPE_CLOSED"));
    await expect(f.run()).rejects.toThrow();
    if (["scope", "hash", "revision", "profile", "closed"].includes(failure))
      expect(f.read).not.toHaveBeenCalled();
  },
);
