import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { assertUniversalP2Publication } from "./tripCoreV2SourcePgAuthority";
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

async function owningPublicationFixture() {
  const f = await proposalFixture(),
    deps = { hash, getAccountId: async () => f.result.accountId };
  const proposed = await projectUniversalP2SourceProposal(f, deps),
    pin = f.material.pin;
  const state = {
    family: "P2",
    command: "CREATE_SPARSE_FLIGHT",
    text: f.material.text,
    afterHash: owning.task.result_sha256,
  };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("trip_sustained_import_p1_capabilities"))
      return {
        rows: [
          {
            runtime_enabled: true,
            enabled_commands: [state.command],
            enabled_families: [state.family],
            enabled_admission_modes: ["REVIEWED_SOURCE"],
          },
        ],
      };
    if (sql.startsWith("SELECT to_jsonb(s)"))
      return {
        rows: [
          {
            source: {
              id: pin.source_id,
              trip_id: f.result.tripId,
              acquired_by: f.result.accountId,
              lifecycle: "ACTIVE",
              retention_state: "RETAINED",
              current_material_revision: 1,
            },
          },
        ],
      };
    if (sql.startsWith("SELECT to_jsonb(r)"))
      return {
        rows: [
          {
            run: {
              id: f.runId,
              extractor_key: "otr-universal-interpretation-v1",
              capture_batch_id: f.result.batchId,
              interpretation_task_id: f.result.taskId,
              state: "PENDING",
              retention_state: "RETAINED",
              input_sha256: f.inputCatalogSha256,
              scope_source_ids: [pin.source_id],
            },
          },
        ],
      };
    if (sql.startsWith("SELECT to_jsonb(i)"))
      return {
        rows: [{ pin: { ...pin, run_id: f.runId, confirmation_id: null }, valid: true }],
      };
    if (sql.includes("trip_import_run_input_hash"))
      return { rows: [{ hash: f.inputCatalogSha256 }] };
    if (sql.startsWith("SELECT id,run_id,candidate_kind")) return { rows: [] };
    if (sql.startsWith("SELECT original_representation_ids"))
      return {
        rows: [
          {
            original_representation_ids: [pin.representation_id],
            retention_state: "RETAINED",
          },
        ],
      };
    if (sql.startsWith("SELECT role,material_kind"))
      return {
        rows: [
          {
            role: "ORIGINAL",
            material_kind: "TEXT",
            text_content: state.text,
            payload_sha256: pin.payload_sha256,
            byte_count: pin.byte_count,
            retention_state: "RETAINED",
          },
        ],
      };
    throw Error("UNEXPECTED_SQL");
  });
  const lease = { query, retire: vi.fn() };
  const read = vi.fn(async (_scope: unknown, currentLease: unknown) => {
    expect(currentLease).toBe(lease);
    return {
      runId: f.runId,
      resultSha256:
        read.mock.calls.length > 1 ? state.afterHash : owning.task.result_sha256,
      result: f.result,
    };
  });
  const scope = {
    actorAccountId: f.result.accountId,
    tripId: f.result.tripId,
    sourceId: pin.source_id,
    planId: proposed.plan.planId,
  };
  return { f, proposed, state, query, lease, read, scope };
}
it("rebuilds the proposed publication through the same owning Published/Source lease before accepting its binding", async () => {
  const f = await owningPublicationFixture();
  const checked = await assertUniversalP2Publication(
    f.lease as never,
    f.scope,
    f.proposed.publication,
    hash,
    f.read as never,
  );
  expect(checked?.run).toMatchObject({
    taskId: f.f.result.taskId,
    resultSha256: owning.task.result_sha256,
  });
  expect(f.read).toHaveBeenCalledTimes(2);
  expect(f.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
});
it.each([
  "reader",
  "p1-window",
  "client-hash",
  "source-bytes",
  "after-hash",
  "catalog",
  "forged-fact",
  "forged-plan-hash",
])("rejects %s without trusting client publication pins", async (kind) => {
  const f = await owningPublicationFixture();
  if (kind === "p1-window") {
    f.state.family = "P1";
    f.state.command = "CREATE_ITEM";
  }
  if (kind === "client-hash")
    f.proposed.publication.universalP2!.resultSha256 = "b".repeat(64);
  if (kind === "source-bytes") f.state.text = "NX501 AKL→CHC 2026-11-02\n";
  if (kind === "after-hash") f.state.afterHash = "b".repeat(64);
  if (kind === "catalog") f.proposed.publication.inputCatalogSha256 = "b".repeat(64);
  if (kind === "forged-plan-hash")
    f.proposed.publication.universalP2!.proposedPlanSha256 = "b".repeat(64);
  if (kind === "forged-fact")
    f.proposed.publication.candidates[0].facts.flightNumberLiteral = "NZ502";
  await expect(
    assertUniversalP2Publication(
      f.lease as never,
      f.scope,
      f.proposed.publication,
      hash,
      kind === "reader" ? undefined : (f.read as never),
    ),
  ).rejects.toThrow();
  expect(f.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  if (kind === "reader" || kind === "p1-window") expect(f.read).not.toHaveBeenCalled();
});
it("leaves legacy Flight publication binding behavior unchanged", async () => {
  const f = await owningPublicationFixture();
  delete f.proposed.publication.universalP2;
  expect(
    await assertUniversalP2Publication(
      f.lease as never,
      f.scope,
      f.proposed.publication,
      hash,
      f.read as never,
    ),
  ).toBeUndefined();
  expect(f.query).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
});

it("pins the complete deterministic Sparse Source Plan inside owning publication metadata", async () => {
  const f = await owningPublicationFixture();
  const { coreHashValue } = await import("../../src/domain/trip/tripCoreV2Read");
  expect(f.proposed.binding.proposedPlanSha256).toBe(
    await coreHashValue("otr-trip-core-source-plan-v2", f.proposed.plan, hash),
  );
});

it.each(["changed-hash", "changed-plan-id"])(
  "rejects %s at Source Plan admission despite a legitimate sealed publication",
  async (kind) => {
    const f = await owningPublicationFixture();
    await expect(
      assertUniversalP2Publication(
        f.lease as never,
        kind === "changed-plan-id" ? { ...f.scope, planId: f.f.runId } : f.scope,
        f.proposed.publication,
        hash,
        f.read as never,
        false,
        kind === "changed-hash" ? "b".repeat(64) : f.proposed.binding.proposedPlanSha256,
      ),
    ).rejects.toThrow("INVALID_PROVENANCE");
  },
);
