import {
  mintP1OutputPurposeV2,
  type P1PurposeVerification,
} from "../../src/domain/trip/p1OutputPurposeV2";
import { expect, it } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
async function fixture() {
  const f = await universalP1SourceFixture(undefined, undefined, "2026-11-04", "P5");
  Object.assign(f.input, { owningLifecycleRelationships: undefined });
  Object.assign(f.input.selection, {
    sourceReview: {
      version: "otr.universal.p5-source-review/1",
      decision: "NEW",
      sourceRevision: 1,
      title: "Coastal QA Train",
      localDate: "2026-11-04",
      originalReviewed: true,
      tripReviewed: true,
    },
  });
  return f;
}
it("qualifies a reviewed evidenced Train through existing Source lifecycle without inventing endpoints or canonical supplier identity", async () => {
  const f = await fixture(),
    r = await f.run(),
    slot = r.body.plan.slots[0];
  expect(r.qualification.eligibleNewRecords).toHaveLength(1);
  expect(r.body.schemaId).toBe("otr.core.universal-p5-source/1");
  expect(slot.payload).toMatchObject({
    family: "P5",
    core: { title: "Coastal QA Train" },
    endpoints: {
      origin: { time: { local_date: "2026-11-04", local_time: null, zone_id: null } },
      destination: { time: { local_date: null, local_time: null, zone_id: null } },
    },
    service: {
      service_key: "main",
      transport_subtype: "TRAIN",
      service_literal: "Coastal QA Train",
      operator_literal: "Coastal QA Rail",
      service_number: "CQ101",
    },
  });
  expect(
    Object.values((slot.payload as any).endpoints.origin.place).every((v) => v === null),
  ).toBe(true);
  validateCoreCommand({
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
  });
  expect(r.grantsAdmission).toBe(false);
  expect((await f.run()).candidateSha256).toBe(r.candidateSha256);
});
it.each([
  "subtype",
  "no-subtype-evidence",
  "no-operator-evidence",
  "no-number-evidence",
  "source-bytes",
  "no-review",
  "wrong-family",
  "title",
  "trip",
])("rejects P5 %s mismatch", async (kind) => {
  const f = await fixture(),
    candidate = f.input.result.candidates[0] as any,
    review = (f.input.selection as any).sourceReview;
  if (kind === "subtype") candidate.subtype = "TAXI";
  if (kind === "no-subtype-evidence")
    candidate.fields = candidate.fields.filter(
      (v: any) => v.path !== "transport_subtype",
    );
  if (kind === "no-operator-evidence")
    candidate.fields = candidate.fields.filter((v: any) => v.path !== "operator.name");
  if (kind === "no-number-evidence")
    candidate.fields = candidate.fields.filter((v: any) => v.path !== "service.number");
  if (kind === "source-bytes") f.input.snapshot.materials[0].text = "changed";
  if (kind === "no-review") delete (f.input.selection as any).sourceReview;
  if (kind === "wrong-family") review.version = "otr.universal.p4-source-review/1";
  if (kind === "title") review.title = "forged";
  if (kind === "trip") review.tripReviewed = false;
  await expect(f.run()).rejects.toThrow();
});

it("certifies only P5 purpose with exact Train subtype evidence and rejects cross-family or missing proof", async () => {
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
      purposeKind: "P5_ITEM",
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
  expect(
    (await mintP1OutputPurposeV2(input, async () => {}, f.deps.hash)).purpose.purposeKind,
  ).toBe("P5_ITEM");
  const missing = structuredClone(input);
  missing.selectedFields = missing.selectedFields.filter(
    (k) => k !== "SERVICE.main.transport_subtype",
  );
  delete missing.evidenceRefs["SERVICE.main.transport_subtype"];
  await expect(
    mintP1OutputPurposeV2(missing, async () => {}, f.deps.hash),
  ).rejects.toThrow("INCOMPLETE_SOURCE_EVIDENCE");
  await expect(
    mintP1OutputPurposeV2(
      { ...input, binding: { ...input.binding, purposeKind: "P4_ITEM" } },
      async () => {},
      f.deps.hash,
    ),
  ).rejects.toThrow("INVALID_PROVENANCE");
});

it("keeps one operator proof after alias agreement and rejects conflicting literal aliases", async () => {
  const f = await fixture();
  const candidate = f.input.result.candidates[0] as any;
  const operator = candidate.fields.find((v: any) => v.path === "operator.name");
  candidate.fields.push({ ...operator, path: "operator" });
  expect((await f.run()).body.evidence).toHaveLength(5);
  candidate.fields[candidate.fields.length - 1].raw = "Different operator";
  await expect(f.run()).rejects.toThrow("INCOMPLETE_SOURCE_EVIDENCE");
});
