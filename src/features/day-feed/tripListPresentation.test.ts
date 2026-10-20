import { expect, it } from "vitest";
import type { Trip } from "@/domain/trip/types";
import { groupLocalTrips, possibleTodayTrips } from "./tripListPresentation";

const trip = (id: string, startDate: string | null, endDate: string | null): Trip => ({
  id,
  serverId: null,
  name: id,
  destination: null,
  startDate,
  endDate,
  createdAt: `2026-01-${id.slice(-2)}T00:00:00Z`,
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
  syncStatus: "PENDING_CREATE",
  syncVersion: 0,
  baseCurrency: null,
  ownerPersonId: null,
});

it("keeps multiple active trips, undated trips, and recent Past order distinct", () => {
  const trips = [
    trip("01", "2026-10-10", "2026-10-15"),
    trip("02", "2026-10-12", "2026-10-13"),
    trip("03", "2026-11-01", "2026-11-05"),
    trip("04", null, null),
    trip("05", "2026-10-01", "2026-10-02"),
    trip("06", "2026-09-01", "2026-09-04"),
  ];
  const grouped = groupLocalTrips(trips, "2026-10-13");
  expect(grouped.active.map((item) => item.id)).toEqual(["01", "02"]);
  expect(grouped.upcoming.map((item) => item.id)).toEqual(["03"]);
  expect(grouped.undated.map((item) => item.id)).toEqual(["04"]);
  expect(grouped.past.map((item) => item.id)).toEqual(["05", "06"]);
});

it("never guesses a lifecycle group from an incomplete or invalid range", () => {
  const grouped = groupLocalTrips(
    [trip("01", "2026-10-20", null), trip("02", "2026-02-30", "2026-03-01")],
    "2026-10-13",
  );
  expect(grouped.undated.map((item) => item.id)).toEqual(["02", "01"]);
});

it("keeps nearby named-zone candidates even when the device date is outside the Trip", () => {
  const candidates = possibleTodayTrips(
    [
      trip("01", "2026-10-15", "2026-10-15"),
      trip("02", "2026-10-11", "2026-10-11"),
      trip("03", "2026-10-16", "2026-10-17"),
      trip("04", null, null),
    ],
    "2026-10-13",
  );
  expect(candidates.map((item) => item.id)).toEqual(["01", "02"]);
  const namedZoneActive = groupLocalTrips(candidates, "2026-10-13", new Set(["01"]));
  expect(namedZoneActive.active.map((item) => item.id)).toEqual(["01"]);
  expect(namedZoneActive.past.map((item) => item.id)).toEqual(["02"]);
});
