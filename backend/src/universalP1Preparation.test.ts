import { expect, it, vi } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import {
  prepareCoreSourcePlanV2,
  type CoreSourcePlanStorageV2,
  type CoreSourceStoredPlanV2,
} from "./tripCoreV2Source";
import {
  mintP1OutputPurposeV2,
  assertP1OutputPurposeV2,
  type P1PurposeVerification,
} from "../../src/domain/trip/p1OutputPurposeV2";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
async function fixture(family: "P1" | "P3" | "P5" | "P6" = "P1") {
  const f = await universalP1SourceFixture(undefined, undefined, "2026-11-03", family);
  if (family === "P5" || family === "P6")
    Object.assign(f.input.selection, {
      sourceReview: {
        version:
          family === "P6"
            ? "otr.universal.p6-source-review/1"
            : "otr.universal.p5-source-review/1",
        decision: "NEW",
        sourceRevision: 1,
        title: family === "P6" ? "海滨散步" : "Coastal QA Train",
        localDate: "2026-11-03",
        originalReviewed: true,
        tripReviewed: true,
      },
    });
  const p = await f.run(),
    slot = p.body.plan.slots[0];
  const command = validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: slot.operationId,
    tripId: f.input.context.tripId,
    command: slot.command,
    target: slot.target,
    baseVector: slot.baseVector,
    admission: {
      mode: "REVIEWED_SOURCE",
      sourceIntentId: slot.slotId,
      policyVersion: null,
    },
    payload: slot.payload,
  });
  const verification: P1PurposeVerification = {
    binding: {
      version: 2,
      accountId: f.input.context.accountId,
      tripId: f.input.context.tripId,
      sourceId: p.body.sourceId,
      sourceRevision: p.body.sourceRevision,
      runId: p.body.runId,
      candidateId: p.body.candidateId,
      inputCatalogSha256: p.body.inputCatalogSha256,
      candidateSha256: p.candidateSha256,
      planId: p.body.plan.planId,
      slotId: slot.slotId,
      targetKind: "ITEM",
      targetId: slot.target.id,
      operationId: slot.operationId,
      purposeKind:
        family === "P6"
          ? "P6_ITEM"
          : family === "P5"
            ? "P5_ITEM"
            : family === "P3"
              ? "P3_ITEM"
              : "P1_ITEM",
    },
    command,
    selectedFields: slot.selectedFields as P1PurposeVerification["selectedFields"],
    evidenceRefs: slot.evidenceRefs,
  };
  return { f, p, verification };
}
it("certifies only after owning verification and rejects changed payload/Manual admission", async () => {
  const { f, verification: v } = await fixture(),
    verify = vi.fn(async () => {}),
    cert = await mintP1OutputPurposeV2(v, verify, f.deps.hash);
  expect(verify).toHaveBeenCalledOnce();
  await assertP1OutputPurposeV2(cert, v, f.deps.hash);
  const changed = structuredClone(v);
  (changed.command.payload as { core: { title: string } }).core.title = "different";
  await expect(assertP1OutputPurposeV2(cert, changed, f.deps.hash)).rejects.toThrow();
  changed.command.admission = {
    mode: "MANUAL",
    sourceIntentId: null,
    policyVersion: null,
  };
  await expect(mintP1OutputPurposeV2(changed, verify, f.deps.hash)).rejects.toThrow();
  await expect(
    mintP1OutputPurposeV2(
      v,
      async () => {
        throw Error("OWNING_REVIEW_REQUIRED");
      },
      f.deps.hash,
    ),
  ).rejects.toThrow("OWNING_REVIEW_REQUIRED");
});
it.each(["P1", "P3", "P5", "P6"] as const)(
  "uses existing Source Prepare storage for %s and remains closed without its owning verifier",
  async (family) => {
    const { f, p } = await fixture(family);
    let plan: CoreSourceStoredPlanV2 | null = null;
    const verifyP1Evidence = vi.fn(async () => {}),
      assertCommandAdmission = vi.fn(async () => {});
    const storage = (enabled: boolean): CoreSourcePlanStorageV2 => ({
      withLockedSourcePlan: async (_scope, work) =>
        work({
          readPlan: async () => plan,
          readSealedCatalog: async () => ({
            ...f.input.catalog,
            candidates: [
              {
                candidateId: p.body.candidateId,
                runId: p.body.runId,
                candidateSha256: p.candidateSha256,
                kind: family,
                snapshot: p.body,
                identityFacts: null,
                identityEvidenceRefs: null,
              },
            ],
          }),
          readClaims: async () => [],
          verifyFlightEvidence: async () => {
            throw Error("NO_FLIGHT");
          },
          ...(enabled ? { verifyP1Evidence } : {}),
          assertCommandAdmission,
          readCoreReceipt: async () => null,
          putPlan: async (value) => {
            plan = structuredClone(value);
          },
          finalizeEvidence: async () => ({ state: "COMPLETE", errorCode: null }),
        }),
    });
    const run = (enabled: boolean) =>
      prepareCoreSourcePlanV2(
        storage(enabled),
        f.input.context.accountId,
        f.input.context.tripId,
        p.body.plan,
        f.deps.hash,
      );
    expect((await run(false)).reviewSlots[0].errorCode).toBe("CONTRACT_UNSUPPORTED");
    expect(verifyP1Evidence).not.toHaveBeenCalled();
    plan = null;
    const prepared = await run(true);
    expect(prepared.readyCommands).toHaveLength(1);
    expect(prepared.readyCommands[0].admission.mode).toBe("REVIEWED_SOURCE");
    expect(verifyP1Evidence).toHaveBeenCalledOnce();
    const again = await run(true);
    expect(again).toEqual(prepared);
    expect(verifyP1Evidence).toHaveBeenCalledOnce();
  },
);

it("certifies the three P3 fields through the existing purpose verifier and rejects family substitution", async () => {
  const { f, verification: v } = await fixture("P3");
  const cert = await mintP1OutputPurposeV2(v, async () => {}, f.deps.hash);
  expect(cert.purpose.purposeKind).toBe("P3_ITEM");
  await assertP1OutputPurposeV2(cert, v, f.deps.hash);
  const wrong = structuredClone(v);
  wrong.binding.purposeKind = "P1_ITEM";
  await expect(
    mintP1OutputPurposeV2(wrong, async () => {}, f.deps.hash),
  ).rejects.toThrow();
  const incomplete = structuredClone(v);
  incomplete.selectedFields = incomplete.selectedFields.filter(
    (x) => x !== "END.local_date",
  );
  delete incomplete.evidenceRefs["END.local_date"];
  await expect(
    mintP1OutputPurposeV2(incomplete, async () => {}, f.deps.hash),
  ).rejects.toThrow();
});
