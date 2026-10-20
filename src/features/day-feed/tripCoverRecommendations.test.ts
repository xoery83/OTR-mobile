import { expect, it } from "vitest";
import { rankedTripCovers } from "@/features/trip-cover/coverDecision";
import { suggestedCoverIds } from "./tripCoverRecommendations";
const trip = { id: "qa", name: "Iceland winter", destination: "Iceland" };
it("shows the other six of the ranked seven when the current built-in is recommended", () => {
  const firstSeven = rankedTripCovers(trip, 7).map((r) => r.asset.id);
  const current = firstSeven[0];
  expect(suggestedCoverIds(trip, current)).toEqual(firstSeven.slice(1));
});
it("shows the top six when a manual selection is outside the top seven", () => {
  expect(suggestedCoverIds(trip, "cultural-oldtown")).toEqual(
    rankedTripCovers(trip, 7)
      .map((r) => r.asset.id)
      .filter((id) => id !== "cultural-oldtown")
      .slice(0, 6),
  );
});
it("keeps personal cover outside ranking and recomputes suggestions with draft metadata", () => {
  const photo = "photo-00000000-0000-4000-8000-000000000001";
  const changed = { ...trip, name: "Tokyo city tour", destination: "Tokyo" };
  expect(suggestedCoverIds(trip, photo)).toEqual(
    rankedTripCovers(trip, 6).map((r) => r.asset.id),
  );
  expect(suggestedCoverIds(changed, photo)).toEqual(
    rankedTripCovers(changed, 6).map((r) => r.asset.id),
  );
  expect(suggestedCoverIds(changed, photo)).not.toEqual(suggestedCoverIds(trip, photo));
});
