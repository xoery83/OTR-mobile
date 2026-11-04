import { expect, it } from "vitest";
import { accountTripListPresentation as present } from "./accountTripRestorePresentation";
const a = { accountId: "synthetic-account-a", generation: 4 };
const b = { accountId: "synthetic-account-b", generation: 5 };
const empty = { scope: a, visibleTripCount: 0 };
const base = { current: a, cache: empty, observation: null, waitExpired: false };

it("never treats initially empty or stale empty cache as confirmed empty during returning-account restore", () => {
  expect(present(base)).toBe("RESTORING");
  expect(present({ ...base, observation: { scope: a, status: "RESTORING" } })).toBe(
    "RESTORING",
  );
  expect(
    present({ ...base, cache: null, observation: { scope: a, status: "CONFIRMED" } }),
  ).toBe("RESTORING");
  expect(present({ ...base, observation: { scope: a, status: "CONFIRMED" } })).toBe(
    "CONFIRMED_EMPTY",
  );
});
it("keeps qualified cached Trips accessible offline, pending, failed or beyond the UI wait budget", () => {
  for (const status of ["RESTORING", "UNAVAILABLE", "CONFIRMED"] as const)
    expect(
      present({
        ...base,
        cache: { scope: a, visibleTripCount: 1 },
        observation: { scope: a, status },
        waitExpired: true,
      }),
    ).toBe("SHOW_TRIPS");
});
it("ends unconfirmed loading on failure or UI deadline without inventing an empty result", () => {
  expect(present({ ...base, waitExpired: true })).toBe("UNAVAILABLE");
  expect(present({ ...base, observation: { scope: a, status: "UNAVAILABLE" } })).toBe(
    "UNAVAILABLE",
  );
});
it("rejects late prior Account or generation observations and never presents their cached Trips", () => {
  for (const current of [b, { ...a, generation: a.generation + 1 }]) {
    expect(
      present({
        ...base,
        current,
        cache: { scope: a, visibleTripCount: 2 },
        observation: { scope: a, status: "CONFIRMED" },
      }),
    ).toBe("RESTORING");
    expect(
      present({ ...base, current, observation: { scope: a, status: "CONFIRMED" } }),
    ).toBe("RESTORING");
  }
});
it("projects the actual returning-account sequence without a false empty frame", () => {
  const frames = [
    present(base),
    present({ ...base, observation: { scope: a, status: "RESTORING" } }),
    present({
      ...base,
      cache: { scope: a, visibleTripCount: 1 },
      observation: { scope: a, status: "CONFIRMED" },
    }),
  ];
  expect(frames).toEqual(["RESTORING", "RESTORING", "SHOW_TRIPS"]);
  expect(frames).not.toContain("CONFIRMED_EMPTY");
});
