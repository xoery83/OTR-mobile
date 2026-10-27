import { sourceReviewCivilDate } from "../../src/domain/trip/universalP1SourceReview";
import {
  mintP1OutputPurposeV2,
  type P1PurposeVerification,
} from "../../src/domain/trip/p1OutputPurposeV2";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import { expect, it } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
async function fixture(pickupDate = "2026-11-03") {
  const f = await universalP1SourceFixture(undefined, undefined, pickupDate, "P4");
  f.input.result.quality!.decisions[0].tier = "REVIEWABLE";
  Object.assign(f.input, { owningLifecycleRelationships: undefined });
  Object.assign(f.input.selection, {
    sourceReview: {
      version: "otr.universal.p4-source-review/1",
      decision: "NEW",
      sourceRevision: 1,
      title: "海滨租车",
      localDate: sourceReviewCivilDate(pickupDate),
      endLocalDate: "2026-11-05",
      originalReviewed: true,
      tripReviewed: true,
    },
  });
  return f;
}
it("qualifies reviewed Rental evidence through the existing Source plan", async () => {
  const f = await fixture(),
    r = await f.run();
  expect(r.qualification.eligibleNewRecords).toHaveLength(1);
  expect(r.body.schemaId).toBe("otr.core.universal-p4-source/1");
  expect(r.body.plan.slots[0]).toMatchObject({
    command: "CREATE_ITEM",
    payload: {
      family: "P4",
      core: { title: "海滨租车" },
      schedule: {
        start: { local_date: "2026-11-03" },
        end: { local_date: "2026-11-05" },
      },
    },
  });
  expect(r.grantsAdmission).toBe(false);
  expect((r.body.plan.slots[0].payload as any).details).toBeUndefined();
  expect((await f.run()).candidateSha256).toBe(r.candidateSha256);
});
it("does not require supplier, actual vehicle, contact, booking or unknown return date", async () => {
  const f = await fixture();
  delete (f.input.selection as any).sourceReview.endLocalDate;
  const candidate = f.input.result.candidates[0] as { fields: { path: string }[] };
  candidate.fields = candidate.fields.filter(
    (x) => !["return.date", "rental.company"].includes(x.path),
  );
  const r = await f.run();
  expect(r.qualification.eligibleNewRecords).toHaveLength(1);
  expect((r.body.plan.slots[0].payload as any).schedule.end).toBeUndefined();
  expect(r.body.plan.slots[0].selectedFields).toEqual(["ROOT.title", "START.local_date"]);
});
it.each(["date", "title", "bytes", "wrong-review", "unread", "no-review"])(
  "rejects Rental %s mismatch",
  async (kind) => {
    const f = await fixture(),
      review = (f.input.selection as any).sourceReview;
    if (kind === "date") review.endLocalDate = "2026-11-02";
    if (kind === "title") review.title = "Forged";
    if (kind === "bytes") f.input.snapshot.materials[0].text = "changed";
    if (kind === "wrong-review") review.version = "otr.universal.p3-source-review/1";
    if (kind === "unread") review.originalReviewed = false;
    if (kind === "no-review") delete (f.input.selection as any).sourceReview;
    await expect(f.run()).rejects.toThrow();
  },
);

it("requires END proof when a Rental return is selected and rejects a cross-family purpose", async () => {
  const f = await fixture(),
    r = await f.run(),
    slot = r.body.plan.slots[0];
  const input: P1PurposeVerification = {
    binding: {
      version: 2,
      accountId: r.body.accountId,
      tripId: r.body.tripId,
      sourceId: r.body.sourceId,
      sourceRevision: r.body.sourceRevision,
      runId: r.body.runId,
      candidateId: r.body.candidateId,
      inputCatalogSha256: r.body.inputCatalogSha256,
      candidateSha256: r.candidateSha256,
      planId: r.body.plan.planId,
      slotId: slot.slotId,
      targetKind: "ITEM",
      targetId: slot.target.id,
      operationId: slot.operationId,
      purposeKind: "P4_ITEM",
    },
    command: validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      tripId: r.body.tripId,
      operationId: slot.operationId,
      command: slot.command,
      target: slot.target,
      baseVector: slot.baseVector,
      admission: {
        mode: "REVIEWED_SOURCE",
        sourceIntentId: slot.slotId,
        policyVersion: null,
      },
      payload: slot.payload,
    }),
    selectedFields: slot.selectedFields as P1PurposeVerification["selectedFields"],
    evidenceRefs: slot.evidenceRefs,
  };
  const verify = async () => {};
  expect(
    (await mintP1OutputPurposeV2(input, verify, f.deps.hash)).purpose.purposeKind,
  ).toBe("P4_ITEM");
  const missing = structuredClone(input);
  missing.selectedFields = missing.selectedFields.filter((k) => k !== "END.local_date");
  delete missing.evidenceRefs["END.local_date"];
  await expect(mintP1OutputPurposeV2(missing, verify, f.deps.hash)).rejects.toThrow(
    "INCOMPLETE_SOURCE_EVIDENCE",
  );
  await expect(
    mintP1OutputPurposeV2(
      { ...input, binding: { ...input.binding, purposeKind: "P3_ITEM" } },
      verify,
      f.deps.hash,
    ),
  ).rejects.toThrow("INVALID_PROVENANCE");
});

it("allows a same-day Rental and rejects a return before the actual pinned pickup", async () => {
  const same = await fixture("Nov 5, 2026");
  expect((await same.run()).qualification.eligibleNewRecords).toHaveLength(1);
  const reverse = await fixture("2026-11-06");
  await expect(reverse.run()).rejects.toThrow("INVALID_RENTAL_DATE_RANGE");
});
