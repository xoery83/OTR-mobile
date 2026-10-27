import { expect, it } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";

async function fixture() {
  const f = await universalP1SourceFixture(undefined, undefined, "2026-11-03", "P6");
  Object.assign(f.input, { owningLifecycleRelationships: undefined });
  Object.assign(f.input.selection, {
    sourceReview: {
      version: "otr.universal.p6-source-review/1",
      decision: "NEW",
      sourceRevision: 1,
      title: "海滨散步",
      localDate: "2026-11-03",
      originalReviewed: true,
      tripReviewed: true,
    },
  });
  return f;
}
it("qualifies only explicitly reviewed P6 name/date through existing Source and Core without rights or invented time", async () => {
  const f = await fixture(),
    r = await f.run(),
    slot = r.body.plan.slots[0];
  expect(r.body.schemaId).toBe("otr.core.universal-p6-source/1");
  expect(r.qualification.eligibleNewRecords).toHaveLength(1);
  expect(slot.payload).toMatchObject({
    family: "P6",
    core: { title: "海滨散步" },
    schedule: { start: { local_date: "2026-11-03", local_time: null, zone_id: null } },
  });
  expect(slot.selectedFields).toEqual(["ROOT.title", "START.local_date"]);
  expect(slot.payload).not.toHaveProperty("details");
  expect(slot.payload).not.toHaveProperty("entryPlace");
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
  "no-review",
  "wrong-family",
  "title",
  "trip",
  "bytes",
  "missing-date",
  "booking",
  "ticket",
])("rejects P6 %s", async (kind) => {
  const f = await fixture(),
    c = f.input.result.candidates[0] as any,
    review = (f.input.selection as any).sourceReview;
  if (kind === "no-review") delete (f.input.selection as any).sourceReview;
  if (kind === "wrong-family") review.version = "otr.universal.p1-source-review/1";
  if (kind === "title") review.title = "invented";
  if (kind === "trip") review.tripReviewed = false;
  if (kind === "bytes") f.input.snapshot.materials[0].text = "changed";
  if (kind === "missing-date")
    c.fields = c.fields.filter((f: { path: string }) => f.path !== "activity.date");
  if (kind === "booking") c.bookingTokens = ["b1"];
  if (kind === "ticket") c.ticketTokens = ["t1"];
  await expect(f.run()).rejects.toThrow();
});
