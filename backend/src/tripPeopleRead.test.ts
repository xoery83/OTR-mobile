import { randomUUID, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { projectTripRoster, tripPeopleBoundary } from "./tripPeopleRead";
const actor = randomUUID(),
  trip = randomUUID(),
  person = randomUUID();
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const row = {
  personId: person,
  tripId: trip,
  ledgerMemberId: person,
  ledgerTripId: trip,
  authority: "JOURNEY_MEMBERS_A1",
  displayName: "Same Name",
  role: "owner",
  participationActive: true,
  participationRevision: 1,
};
it("proves A1 mapping from its owning evidence and binds actor/Trip/roster", async () => {
  const a = await projectTripRoster([row], actor, trip, hash);
  expect(a.people[0]).toMatchObject({
    personId: person,
    ledgerMemberId: person,
    memberMappingStatus: "VERIFIED",
    mappingReasonCode: null,
    role: "OWNER",
  });
  expect(a.memberMappingsComplete).toBe(true);
  expect(
    (await projectTripRoster([row], randomUUID(), trip, hash)).memberMappingHash,
  ).not.toBe(a.memberMappingHash);
});
it.each([
  ["group_member", "MEMBER"],
  ["member", "MEMBER"],
  ["organizer", "ORGANIZER"],
  ["toString", null],
  ["unknown", null],
])("projects the authoritative role %s without guessing", async (role, expected) => {
  const result = await projectTripRoster([{ ...row, role }], actor, trip, hash);
  expect(result.people[0].role).toBe(expected);
});
it.each([
  [{ ledgerMemberId: null, ledgerTripId: null }, "MISSING_LEDGER_MEMBER"],
  [{ ledgerMemberId: randomUUID() }, "A1_IDENTITY_MISMATCH"],
  [{ ledgerTripId: randomUUID() }, "CROSS_TRIP_MAPPING"],
])("returns unavailable for unproven mapping %j", async (changes, reason) => {
  const a = await projectTripRoster([{ ...row, ...changes }], actor, trip, hash);
  expect(a.people[0]).toMatchObject({
    ledgerMemberId: null,
    memberMappingStatus: "UNAVAILABLE",
    mappingReasonCode: reason,
  });
  expect(a.memberMappingsComplete).toBe(false);
});
it("does not infer mappings from duplicate display names or reuse an ambiguous Member", async () => {
  const other = randomUUID(),
    a = await projectTripRoster(
      [row, { ...row, personId: other, ledgerMemberId: other }],
      actor,
      trip,
      hash,
    );
  expect(a.people.map((p) => p.ledgerMemberId).sort()).toEqual([person, other].sort());
  const b = await projectTripRoster(
    [row, { ...row, personId: other }],
    actor,
    trip,
    hash,
  );
  expect(b.people.every((p) => p.memberMappingStatus === "UNAVAILABLE")).toBe(true);
  await expect(
    projectTripRoster([{ ...row, tripId: randomUUID() }], actor, trip, hash),
  ).rejects.toThrow("NOT_VISIBLE");
});
it("rejects query forgery and denies before invoking the owning reader", async () => {
  const people = vi.fn(),
    canRead = vi.fn().mockResolvedValue(false),
    path = `https://local.test/v2/trips/${trip}/people`;
  expect(
    (
      await tripPeopleBoundary(new Request(path + "?actor=forged"), actor, canRead, {
        people,
      })
    ).status,
  ).toBe(400);
  expect(
    (await tripPeopleBoundary(new Request(path), actor, canRead, { people })).status,
  ).toBe(403);
  expect(people).not.toHaveBeenCalled();
});
