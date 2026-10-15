import { expect, it } from "vitest";
import { filterSearchRows, searchRows } from "./searchPresentation";
import type { SearchResult } from "@/domain/trip/tripSearch";
it("mixes supported objects by provider relevance, deduplicates identities and keeps distinct segments", () => {
  const base: SearchResult = {
    category: "TRIPS",
    id: "trip",
    tripId: "trip",
    tripName: "Trip",
    title: "Trip",
    date: null,
    family: null,
    rank: 3,
  };
  const item = { ...base, category: "ITINERARY" as const, id: "segment", rank: 0 };
  const data = [base, item, item, { ...item, id: "segment2", rank: 1 }];
  expect(searchRows(data).map((row) => row.id)).toEqual(["segment", "segment2", "trip"]);
  expect(filterSearchRows(data, "ALL")).toHaveLength(3);
  expect(filterSearchRows(data, "ITINERARY")).toHaveLength(2);
  expect(filterSearchRows([], "TRIPS")).toEqual([]);
});
