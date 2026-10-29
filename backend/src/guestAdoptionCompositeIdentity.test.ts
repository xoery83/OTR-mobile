import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { fixture, seal } from "./guestAdoptionCompositePlan.fixture";
import { prepareGuestAdoptionCompositeIdentity } from "./guestAdoptionCompositeIdentity";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
afterEach(() => vi.useRealTimers());
function receipt(f: ReturnType<typeof fixture>) {
  return {
    ...f.body.trips[0].create,
    actorAccountId: f.user.id,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
}
async function setup() {
  const f = fixture();
  const input = await f.source();
  const staged = { grant: f.grant, preparationSha256: input.sha256 };
  const r = receipt(f);
  return {
    f,
    r,
    input,
    staged,
    run: (readbacks: unknown = [r]) =>
      prepareGuestAdoptionCompositeIdentity(f.user, staged, input, readbacks),
  };
}
it("maps only explicit Person leaves to the owning creator, retaining operation and source hashes", async () => {
  const s = await setup(),
    before = structuredClone(s.input);
  const result = await s.run();
  const parsed = JSON.parse(result.canonicalText),
    trip = parsed.trips[0];
  expect(result.authority).toBe("NONE");
  expect(result.sha256).toBe(hash(result.canonicalText));
  expect(trip.mappings).toEqual([
    { sourcePersonId: s.f.person, targetPersonId: s.r.ownerPersonId },
  ]);
  const intent = trip.intents[0],
    mapped = JSON.parse(intent.mappedCanonicalText);
  expect(mapped.payload.participation.selfPersonId).toBe(s.r.ownerPersonId);
  expect(mapped.payload.acl.people).toEqual([s.r.ownerPersonId]);
  expect(mapped.operationId).toBe(s.f.body.trips[0].coreIntents[0].command.operationId);
  expect(intent.sourceIntentSha256).toBe(s.f.body.trips[0].coreIntents[0].sha256);
  expect(intent.mappedIntentSha256).toBe(
    hash("otr-trip-core-intent-v2\n" + intent.mappedCanonicalText),
  );
  expect(intent.mappedIntentSha256).not.toBe(intent.sourceIntentSha256);
  expect(s.input).toEqual(before);
  expect(await s.run()).toEqual(result);
});
it("retains an already identical explicit owner ID without inferring another identity", async () => {
  const s = await setup();
  s.r.ownerPersonId = s.f.person;
  const intent = JSON.parse((await s.run()).canonicalText).trips[0].intents[0];
  expect(intent.mappedIntentSha256).toBe(intent.sourceIntentSha256);
});
it.each(["actorAccountId", "operationId", "tripId", "name", "startDate"])(
  "rejects mismatched owning %s",
  async (field) => {
    const s = await setup();
    const r = {
      ...s.r,
      [field]:
        field === "name" ? "Other" : field === "startDate" ? "2026-11-02" : randomUUID(),
    };
    await expect(s.run([r])).rejects.toThrow();
  },
);
it.each([{ readbacks: [] }, { readbacks: [{}, {}] }])(
  "rejects absent/invalid/extra readbacks",
  async ({ readbacks }) => {
    const s = await setup();
    await expect(s.run(readbacks)).rejects.toThrow();
  },
);
it("rejects duplicate creation receipts rather than counting them as coverage", async () => {
  const s = await setup();
  await expect(s.run([s.r, s.r])).rejects.toThrow("READBACK_MISMATCH");
});
it("pins readback objects before asynchronous qualification", async () => {
  const s = await setup(),
    owner = s.r.ownerPersonId;
  const pending = s.run();
  s.r.ownerPersonId = randomUUID();
  s.r.actorAccountId = randomUUID();
  expect(
    JSON.parse((await pending).canonicalText).trips[0].mappings[0].targetPersonId,
  ).toBe(owner);
});
it("does not replace UUID-looking title text or match by a display name", async () => {
  const f = fixture();
  f.body.trips[0].coreIntents[0].command.payload.core.title = f.person;
  const input = await f.source(),
    r = receipt(f);
  const result = await prepareGuestAdoptionCompositeIdentity(
    f.user,
    { grant: f.grant, preparationSha256: input.sha256 },
    input,
    [r],
  );
  const mapped = JSON.parse(
    JSON.parse(result.canonicalText).trips[0].intents[0].mappedCanonicalText,
  );
  expect(mapped.payload.core.title).toBe(f.person);
});
it("preserves unlinked people and refuses mapping the owner onto a different local Person", async () => {
  const f = fixture(),
    trip = f.body.trips[0],
    id = randomUUID(),
    op = randomUUID();
  const person = {
    version: 1,
    operationId: op,
    personId: id,
    tripId: trip.create.tripId,
    accountId: f.grant.sourceGuestLocalId,
    tripCreateOperationId: trip.create.operationId,
    displayName: trip.creator.displayName,
  };
  // Fixture deliberately starts with no non-creator people.
  (trip.people as unknown[]).push(person);
  trip.queueOperationIds.push(op);
  f.body.totals.people++;
  f.body.totals.queueOperations++;
  f.grant.resources.people++;
  trip.coreIntents[0].command.payload.acl.people.push(id);
  const input = await f.source(),
    r = receipt(f),
    staged = { grant: f.grant, preparationSha256: input.sha256 };
  const result = await prepareGuestAdoptionCompositeIdentity(f.user, staged, input, [r]);
  const mapped = JSON.parse(result.canonicalText).trips[0];
  expect(mapped.mappings[1]).toEqual({ sourcePersonId: id, targetPersonId: id });
  expect(JSON.parse(mapped.intents[0].mappedCanonicalText).payload.acl.people).toEqual([
    r.ownerPersonId,
    id,
  ]);
  r.ownerPersonId = id;
  await expect(
    prepareGuestAdoptionCompositeIdentity(f.user, staged, input, [r]),
  ).rejects.toThrow("READBACK_MISMATCH");
});
it("rejects untrusted/anonymous target, tampered source and expiry", async () => {
  const s = await setup();
  await expect(
    prepareGuestAdoptionCompositeIdentity(
      { id: s.f.user.id, accountClass: "ANONYMOUS" },
      s.staged,
      s.input,
      [s.r],
    ),
  ).rejects.toThrow("NORMAL_ACCOUNT_REQUIRED");
  await expect(
    prepareGuestAdoptionCompositeIdentity(
      s.f.user,
      s.staged,
      { ...s.input, sha256: "c".repeat(64) },
      [s.r],
    ),
  ).rejects.toThrow();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 60001);
  await expect(s.run()).rejects.toThrow("GRANT_EXPIRED");
});

it("rejects cross-Trip owner collisions even for independently valid Trip receipts", async () => {
  const f = fixture(),
    second = fixture();
  await second.source();
  f.body.trips.push(second.body.trips[0]);
  for (const key of ["trips", "people", "p1Items", "queueOperations"] as const)
    f.body.totals[key] += second.body.totals[key];
  for (const key of ["trips", "people", "items"] as const) f.grant.resources[key]++;
  const prepared = JSON.parse((await f.source()).canonicalText);
  prepared.tripIds.push(second.body.trips[0].create.tripId);
  const input = seal(prepared),
    staged = { grant: f.grant, preparationSha256: input.sha256 };
  const firstReceipt = receipt(f),
    secondReceipt = { ...receipt(second), actorAccountId: f.user.id };
  const run = () =>
    prepareGuestAdoptionCompositeIdentity(f.user, staged, input, [
      firstReceipt,
      secondReceipt,
    ]);
  expect(JSON.parse((await run()).canonicalText).trips).toHaveLength(2);
  secondReceipt.ownerPersonId = firstReceipt.ownerPersonId;
  await expect(run()).rejects.toThrow("READBACK_MISMATCH");
  secondReceipt.ownerPersonId = f.person;
  await expect(run()).rejects.toThrow("READBACK_MISMATCH");
});
it("compares all V2 structured creation fields without converting them to legacy metadata", async () => {
  const f = fixture();
  Object.assign(f.body.trips[0].create, { formatVersion: 2, destinations: [] });
  Object.assign(f.body.trips[0].metadata, { destinations: [] });
  const input = await f.source(),
    staged = { grant: f.grant, preparationSha256: input.sha256 };
  const r = { ...receipt(f), metadataRevision: 0 };
  const result = await prepareGuestAdoptionCompositeIdentity(f.user, staged, input, [r]);
  expect(JSON.parse(result.canonicalText).trips[0].createReceipt.formatVersion).toBe(2);
  await expect(
    prepareGuestAdoptionCompositeIdentity(f.user, staged, input, [
      {
        ...r,
        formatVersion: undefined,
        destinations: undefined,
        metadataRevision: undefined,
      },
    ]),
  ).rejects.toThrow();
});
