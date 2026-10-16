import { afterEach, expect, it, vi } from "vitest";
import { referenceTripHomePerspective } from "./referenceTripHomePerspective";
afterEach(() => vi.unstubAllGlobals());
const read = {
  scope: { accountId: "3a44420f-ec2b-4d7e-9770-410a5ed5e77e", generation: 1 },
  observed: {
    sourceStatus: "CURRENTLY_MATCHES_SOURCE",
    projection: {
      version: 2,
      generation: 2,
      accountId: "3a44420f-ec2b-4d7e-9770-410a5ed5e77e",
      tripId: "b61b0000-0061-4000-8000-000000000001",
      source: {
        epoch: "72ac3662-e554-4f7c-9819-c18702d10650",
        revision: "70",
        accessRevision: 1,
        manifestSha256:
          "225f00979f5251869f080df9e9565c1628af8b20ca38804545989390615a37d2",
      },
    },
  },
};
const apply = (value: unknown = read, scenario: unknown = "TODAY", generation = 1) =>
  referenceTripHomePerspective(
    value as Parameters<typeof referenceTripHomePerspective>[0],
    scenario,
    generation,
  );
it("only selects the three approved views against exact accepted Reference identity", () => {
  vi.stubGlobal("__DEV__", true);
  expect(apply()).toEqual({
    now: "2027-02-06T03:00:00Z",
    date: "2027-02-06",
    zone: "Asia/Tokyo",
  });
  expect(apply(read, "FUTURE")?.date).toBe("2027-01-20");
  expect(apply(read, "PAST")?.date).toBe("2027-02-20");
  expect(apply(read, "constructor")).toBeUndefined();
  expect(apply(read, "2027-02-03")).toBeUndefined();
  expect(apply(read, "TODAY", 2)).toBeUndefined();
  expect(apply(null)).toBeUndefined();
  const other = structuredClone(read);
  other.observed.projection.tripId = "other";
  expect(apply(other)).toBeUndefined();
  const revoked = structuredClone(read);
  revoked.observed.projection.source.accessRevision = 2;
  expect(apply(revoked)).toBeUndefined();
  const stale = structuredClone(read);
  stale.observed.sourceStatus = "STALE";
  expect(apply(stale)).toBeUndefined();
});
it("is closed in Release and without an explicit scenario", () => {
  vi.stubGlobal("__DEV__", false);
  expect(apply()).toBeUndefined();
  vi.stubGlobal("__DEV__", true);
  expect(apply(read, null)).toBeUndefined();
});
