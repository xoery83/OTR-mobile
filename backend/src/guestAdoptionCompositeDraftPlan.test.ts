import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fixture, draftEntries, seal } from "./guestAdoptionCompositePlan.fixture";
import { prepareGuestAdoptionCompositePlan } from "./guestAdoptionCompositePlan";
async function setup() {
  const f = fixture(),
    drafts = draftEntries(f);
  f.grant.resources.liveDrafts = drafts.length;
  const checkpoint = await f.source(drafts);
  const run = (value = checkpoint, grant = f.grant) =>
    prepareGuestAdoptionCompositePlan(
      f.user,
      { grant, preparationSha256: value.sha256 },
      value,
    );
  return { f, drafts, checkpoint, run };
}
it("retains all canonical P1/Trip drafts without creating a published Trip shell or normalizing raw fields", async () => {
  const f = await setup(),
    plan = await f.run();
  const body = JSON.parse(plan.canonicalText),
    prepared = JSON.parse(body.preparation.canonicalText);
  expect(body.schemaId).toBe("otr.auth.guest-composite-plan/2");
  expect(plan.authority).toBe("NONE");
  expect(prepared.drafts).toEqual(f.drafts);
  expect(prepared.tripIds).toEqual([f.f.body.trips[0].create.tripId]);
  const createTrip = JSON.parse(f.drafts[1].canonicalText);
  expect(prepared.tripIds).not.toContain(createTrip.tripId);
  expect(JSON.parse(prepared.drafts[0].canonicalText).fields.title).toBe("  未提交 Å  ");
  expect(JSON.parse(prepared.drafts[0].canonicalText).fields.startDate).toBe("2026-");
  expect(await f.run()).toEqual(plan);
});
it("rejects stale grant draft counts instead of dropping drafts", async () => {
  const f = await setup();
  f.f.grant.resources.liveDrafts--;
  await expect(f.run()).rejects.toThrow("RESOURCE_MISMATCH");
});
it.each(["id", "sha256", "bytes", "duplicate", "foreign Trip", "unknown field"])(
  "refuses invalid draft %s despite a newly sealed outer checkpoint",
  async (kind) => {
    const f = await setup(),
      prepared = JSON.parse(f.checkpoint.canonicalText);
    if (kind === "id") prepared.drafts[0].id = randomUUID();
    if (kind === "sha256") prepared.drafts[0].sha256 = "d".repeat(64);
    if (kind === "bytes") prepared.drafts[0].bytes++;
    if (kind === "duplicate") prepared.drafts.push(prepared.drafts[0]);
    if (kind === "foreign Trip" || kind === "unknown field") {
      const body = JSON.parse(prepared.drafts[0].canonicalText);
      if (kind === "foreign Trip") body.tripId = randomUUID();
      else body.accountToken = "forbidden-test-field";
      prepared.drafts[0] = { id: prepared.drafts[0].id, ...seal(body) };
    }
    await expect(f.run(seal(prepared))).rejects.toThrow();
  },
);
it("refuses unqualified photo references in Trip drafts while preserving the original caller bytes", async () => {
  const f = await setup(),
    prepared = JSON.parse(f.checkpoint.canonicalText);
  const body = JSON.parse(prepared.drafts[2].canonicalText);
  body.value.fields.draftCover = "photo-" + randomUUID();
  prepared.drafts[2] = { id: prepared.drafts[2].id, ...seal(body) };
  const checkpoint = seal(prepared),
    original = checkpoint.canonicalText;
  await expect(f.run(checkpoint)).rejects.toThrow("UNSUPPORTED_DATASET");
  expect(checkpoint.canonicalText).toBe(original);
});
it("keeps the original staged preparation hash when same-count draft text changes", async () => {
  const f = await setup(),
    prepared = JSON.parse(f.checkpoint.canonicalText);
  const body = JSON.parse(prepared.drafts[0].canonicalText);
  body.fields.title = "new text";
  prepared.drafts[0] = { id: prepared.drafts[0].id, ...seal(body) };
  await expect(
    prepareGuestAdoptionCompositePlan(
      f.f.user,
      { grant: f.f.grant, preparationSha256: f.checkpoint.sha256 },
      seal(prepared),
    ),
  ).rejects.toThrow("STAGING_SOURCE_MISMATCH");
});
