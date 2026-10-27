import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { advanceAccountGeneration } from "../../src/data/auth/accountGeneration";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { reviewUniversalP2Selection } from "./universalP2SourceReview";
const receipt = JSON.parse(
  readFileSync(
    new URL(
      "../../docs/ops/universal-p2-formal-save-20261027/P2_BATCH9_SETTLED_RESULTS.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const result = structuredClone(receipt.results),
    binding = result.sourceBindings[0];
  const context = await captureAccountRequestContext(
    result.tripId,
    async () => result.accountId,
  );
  return {
    context,
    result,
    resultSha256: receipt.proof.oldResultsDigest,
    selection: {
      token: "i1",
      resultSha256: receipt.proof.oldResultsDigest,
      sourceReview: {
        version: "otr.universal.p2-source-review/1",
        decision: "NEW",
        sourceRevision: 1,
        flightNumberLiteral: "NZ501",
        departureDate: "2026-11-02",
        originalReviewed: true,
        tripReviewed: true,
      },
    },
    material: {
      inputId: binding.inputId,
      sourceId: binding.sourceId,
      sourceRevision: 1,
      representationId: binding.representationId,
      sha256: binding.originalSha256,
      bytes: Buffer.from("NZ501 AKL→CHC 2026-11-02\n"),
    },
  };
}
it("reviews the retained real P2 spans without promoting generic service or airport observations to authority", async () => {
  const f = await fixture(),
    before = structuredClone(f.result);
  const r = await reviewUniversalP2Selection(f, {
    hash,
    getAccountId: async () => f.result.accountId,
  });
  expect(r.flightNumberLiteral).toBe("NZ501");
  expect(r.departureDate).toBe("2026-11-02");
  expect(r.grantsAdmission).toBe(false);
  expect(r.requiresOwningFlightProof).toBe(true);
  expect(r.sourceObservations.map((o) => o.raw)).toEqual(["AKL", "CHC"]);
  expect(
    r.evidence.map((e) => [
      e.path,
      "start" in e ? e.start : null,
      "end" in e ? e.end : null,
    ]),
  ).toEqual([
    ["service", 0, 5],
    ["origin.local_date", 16, 26],
  ]);
  expect(f.result).toEqual(before);
  expect(f.result.minimumFacts[0].minimumFacts).toBe("INCOMPLETE");
});
it.each([
  "missing-review",
  "date",
  "literal",
  "bytes",
  "source",
  "revision",
  "result",
  "unknown",
  "ambiguous",
  "no-trip-review",
  "account",
])("rejects %s without a Manual fallback", async (failure) => {
  const f = await fixture();
  if (failure === "missing-review") delete (f.selection as any).sourceReview;
  if (failure === "date") f.selection.sourceReview.departureDate = "2026-11-03";
  if (failure === "literal") f.selection.sourceReview.flightNumberLiteral = "NZ502";
  if (failure === "bytes") f.material.bytes[0] = 65;
  if (failure === "source") f.material.sourceId = f.result.tripId;
  if (failure === "revision") f.material.sourceRevision = 2;
  if (failure === "result") f.selection.resultSha256 = "a".repeat(64);
  if (failure === "unknown") f.result.providerOutcome = "UNKNOWN";
  if (failure === "ambiguous")
    f.result.candidates[0].fields.push({
      ...f.result.candidates[0].fields[0],
      raw: "NZ502",
    });
  if (failure === "no-trip-review") f.selection.sourceReview.tripReviewed = false;
  const getAccountId = async () =>
    failure === "account" ? f.result.tripId : f.result.accountId;
  await expect(reviewUniversalP2Selection(f, { hash, getAccountId })).rejects.toThrow();
});

it("rejects duplicate candidate tokens", async () => {
  const f = await fixture();
  f.result.candidates.push(structuredClone(f.result.candidates[0]));
  await expect(
    reviewUniversalP2Selection(f, { hash, getAccountId: async () => f.result.accountId }),
  ).rejects.toThrow();
});
it("rejects invalid UTF8 even when the supplied hash matches", async () => {
  const f = await fixture();
  f.material.bytes[0] = 255;
  f.material.sha256 = await hash(f.material.bytes);
  f.result.sourceBindings[0].originalSha256 = f.material.sha256;
  f.result.sourceBindings[0].submittedSha256 = f.material.sha256;
  await expect(
    reviewUniversalP2Selection(f, { hash, getAccountId: async () => f.result.accountId }),
  ).rejects.toThrow();
});
it("fences an account generation change during hashing", async () => {
  const f = await fixture();
  await expect(
    reviewUniversalP2Selection(f, {
      hash: async (bytes) => {
        const digest = await hash(bytes);
        advanceAccountGeneration();
        return digest;
      },
      getAccountId: async () => f.result.accountId,
    }),
  ).rejects.toThrow();
});
