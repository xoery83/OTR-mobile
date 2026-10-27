import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { advanceAccountGeneration } from "../../src/data/auth/accountGeneration";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  reviewUniversalP2Selection,
  projectUniversalP2SourceProposal,
} from "./universalP2SourceReview";
import { extractCoreFlightPublication } from "./tripCoreV2CandidatePublication";
const receipt = JSON.parse(
  readFileSync(
    new URL(
      "../../docs/ops/universal-p2-formal-save-20261027/P2_BATCH9_SETTLED_RESULTS.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const owning = JSON.parse(
  readFileSync(
    new URL(
      "../../docs/ops/universal-p2-formal-save-20261027/P2_BATCH9_OWNING_TASK_RECEIPT.json",
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
    resultSha256: owning.task.result_sha256,
    selection: {
      token: "i1",
      resultSha256: owning.task.result_sha256,
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

async function proposalFixture() {
  const f = await fixture(),
    b = f.result.sourceBindings[0];
  return {
    ...f,
    runId: "8af82103-55f2-84ea-8e6f-445a15321cf6",
    inputCatalogSha256: "a".repeat(64),
    material: {
      pin: {
        id: b.inputId,
        source_id: b.sourceId,
        material_revision: b.revision,
        representation_id: b.representationId,
        payload_sha256: b.originalSha256,
        byte_count: 27,
        observed_source_row_revision: 1,
        historical_selection: false,
      },
      form: "TEXT" as const,
      media_type: "text/plain" as const,
      text: "NZ501 AKL→CHC 2026-11-02\n",
    },
  };
}
it("maps the actual reviewed P2 through existing Flight publication and one stable Sparse-only plan without granting admission", async () => {
  const f = await proposalFixture(),
    deps = { hash, getAccountId: async () => f.result.accountId };
  const r = await projectUniversalP2SourceProposal(f, deps);
  expect(r.grantsAdmission).toBe(false);
  expect(r.publication.candidates).toHaveLength(1);
  expect(r.publication.candidates[0].facts.flightNumberLiteral).toBe("NZ501");
  expect(r.plan.slots.map((s) => s.command)).toEqual(["CREATE_SPARSE_FLIGHT"]);
  expect(r.plan.slots[0].payload).not.toHaveProperty("origin");
  expect(r.plan.slots[0].payload).not.toHaveProperty("services");
  expect(r.binding).toMatchObject({
    taskId: f.result.taskId,
    batchId: f.result.batchId,
    runId: f.runId,
    resultSha256: owning.task.result_sha256,
    token: "i1",
  });
  expect(await projectUniversalP2SourceProposal(f, deps)).toEqual(r);
  const checked = await extractCoreFlightPublication(
    r.publication,
    [f.material],
    f.result.accountId,
    f.result.tripId,
    hash,
    async () => null,
  );
  expect(checked.sealed[0]).toMatchObject({
    status: "REVIEW",
    errorCode: "UNRESOLVED_IDENTITY",
    identityFacts: null,
  });
});
it.each(["extra-leg", "ignored-source", "change-notice", "historical", "date-drift"])(
  "does not manufacture an eligible P2 from %s",
  async (kind) => {
    const f = await proposalFixture();
    if (kind === "extra-leg") f.material.text += "NZ502 CHC→AKL 2026-11-03\n";
    if (kind === "ignored-source") f.material.text += "Cancellation: NZ501 cancelled\n";
    if (kind === "change-notice") f.material.text += "change=Flight cancelled\n";
    if (kind === "historical") f.material.pin.historical_selection = true;
    if (kind === "date-drift") f.selection.sourceReview.departureDate = "2026-11-03";
    if (kind === "extra-leg" || kind === "ignored-source" || kind === "change-notice") {
      const sha = await hash(Buffer.from(f.material.text));
      f.material.pin.payload_sha256 = sha;
      f.material.pin.byte_count = Buffer.byteLength(f.material.text);
      f.result.sourceBindings[0].originalSha256 = sha;
      f.result.sourceBindings[0].submittedSha256 = sha;
    }
    await expect(
      projectUniversalP2SourceProposal(f, {
        hash,
        getAccountId: async () => f.result.accountId,
      }),
    ).rejects.toThrow();
  },
);
