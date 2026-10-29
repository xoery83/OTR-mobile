// Synthetic immutable-seal protocol only; not a Source registration/runtime receipt.
import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { readSourcePdfCoreProof } from "./sourcePdfCoreProof";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { sourcePdfV2ProofFixture as fixture } from "./__fixtures__/sourcePdfV2Proof";
const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const hash = async (v: Uint8Array) => sha(v);

it("dispatches a real stored /2 shape through the ordinary proof reader without weakening /1", async () => {
  const f = await fixture();
  expect(await readSourcePdfCoreProof(f.lease, f.catalog, f.derivedId, hash)).toEqual({
    originalRepresentationId: f.originalId,
    representationId: f.derivedId,
    sealSha256: f.sealed.seal_sha256,
  });
});
it.each(["closed", "stale", "wrong key", "parent", "text", "hash", "profile", "page"])(
  "rejects %s instead of minting Core proof",
  async (failure) => {
    const f = await fixture();
    if (failure === "closed") f.close();
    if (failure === "stale") f.original.row_revision++;
    if (failure === "wrong key") f.original.object_key = "capture/not-a-source-key";
    if (failure === "parent") f.derived.parent_ids = [randomUUID()];
    if (failure === "text") f.derived.text_content += "changed";
    if (failure === "hash") f.sealed.seal_sha256 = "c".repeat(64);
    if (failure === "profile") f.body.profileSha256 = "c".repeat(64);
    if (failure === "page") {
      f.body.pages[0].end = 5;
      f.body.pageMapSha256 = sha(canonicalCoreJson(f.body.pages));
      await f.rehash();
    }
    await expect(
      readSourcePdfCoreProof(f.lease, f.catalog, f.derivedId, hash),
    ).rejects.toThrow();
  },
);
