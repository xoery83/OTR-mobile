import { expect, it } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";

const actor = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
const trip = "8b5ceb55-b3c2-462a-9a15-59de91fdabe5";
async function fixture() {
  const f = await universalP1SourceFixture(actor, trip, "2026-11-06", "P6");
  Object.assign(f.input, { owningLifecycleRelationships: undefined });
  const review = {
    version: "otr.universal.p6-source-review/1",
    decision: "NEW",
    sourceRevision: 1,
    title: "Harbour QA Gallery Visit",
    localDate: "2026-11-06",
    originalReviewed: true,
    tripReviewed: true,
  };
  Object.assign(f.input.selection, { sourceReview: review });
  return { ...f, review };
}
it("keeps exact new-QA P6 owning Review separate from Admission and projects stable identities", async () => {
  const f = await fixture(), a = await f.run(), b = await f.run();
  expect(a.body.accountId).toBe(actor);
  expect(a.body.tripId).toBe(trip);
  expect(a.body.reviewedBy).toBe(actor);
  expect(a.body.sourceReview).toEqual(f.review);
  expect(a.body.plan.mode).toBe("REVIEWED_SOURCE");
  expect(a.body.plan.slots[0].payload).toMatchObject({ family: "P6" });
  expect(a.body.plan.slots[0]).toEqual(b.body.plan.slots[0]);
  expect(a.grantsAdmission).toBe(false);
  expect(a.body).not.toHaveProperty("version");
  expect(a.body).not.toHaveProperty("publicationId");
});
it.each(["missing", "version", "decision", "revision", "original", "trip-review", "title", "date", "actor", "trip"])(
  "new-QA P6 refuses %s Review or scope before persistence",
  async (kind) => {
    const f = await fixture();
    if (kind === "missing") Object.assign(f.input.selection, { sourceReview: undefined });
    if (kind === "version") f.review.version = "otr.universal.p3-source-review/1";
    if (kind === "decision") f.review.decision = "UPDATE";
    if (kind === "revision") f.review.sourceRevision = 2;
    if (kind === "original") f.review.originalReviewed = false;
    if (kind === "trip-review") f.review.tripReviewed = false;
    if (kind === "title") f.review.title = "Unobserved title";
    if (kind === "date") f.review.localDate = "2026-11-07";
    if (kind === "actor") Object.assign(f.input, { context: { ...f.input.context, accountId: "00000000-0000-4000-8000-000000000001" } });
    if (kind === "trip") Object.assign(f.input, { context: { ...f.input.context, tripId: "00000000-0000-4000-8000-000000000002" } });
    await expect(f.run()).rejects.toThrow();
  },
);
