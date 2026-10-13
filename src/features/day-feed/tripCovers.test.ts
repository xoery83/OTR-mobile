import { expect, it } from "vitest";
import { tripCoverId } from "./tripCoverSelection";

it("keeps a curated offline fallback stable and honors a manual built-in choice", () => {
  const trip = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const fallback = tripCoverId(trip);
  expect(fallback).toBe("coast");
  expect(tripCoverId(trip)).toBe("coast");
  expect(tripCoverId({ ...trip, selectedCoverAssetId: "mountain" })).toBe("mountain");
});
