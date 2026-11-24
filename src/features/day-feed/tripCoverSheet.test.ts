import { expect, it, vi } from "vitest";
import {
  openTripCoverSheet,
  readTripCoverSheet,
  readTripMetadataCover,
  releaseTripCoverSheet,
  releaseTripMetadataCover,
  setTripCoverSheetBusy,
  tripCoverSheetBusy,
  tripMetadataCoverBusy,
  updateTripCoverSheet,
} from "./tripCoverSheet";

const account = vi.hoisted(() => ({ generation: 1, changed: () => {} }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => account.generation,
  subscribeAccountGeneration: (changed: () => void) => {
    account.changed = changed;
  },
}));

it("keeps cover updates and the in-flight close guard within the owning Trip and account", () => {
  const cover = { trip: { id: "trip-a" }, selectedRaw: "coast", onSelect: vi.fn() };
  const invocation = openTripCoverSheet(1, cover);
  expect(invocation).toBeDefined();
  expect(openTripCoverSheet(1, cover)).toBeUndefined();
  updateTripCoverSheet(invocation, { ...cover, trip: { id: "trip-b" }, selectedRaw: "city" });
  expect(readTripCoverSheet(invocation)).toBe(cover);

  setTripCoverSheetBusy(invocation, true);
  expect(tripCoverSheetBusy(invocation)).toBe(true);
  expect(tripCoverSheetBusy("other")).toBe(false);
  updateTripCoverSheet(invocation, { ...cover, selectedRaw: "city" });
  expect(readTripCoverSheet(invocation)?.selectedRaw).toBe("city");
  expect(tripCoverSheetBusy(invocation)).toBe(true);

  account.generation = 2;
  account.changed();
  expect(readTripCoverSheet(invocation)).toBeUndefined();
  expect(tripCoverSheetBusy(invocation)).toBe(false);
  expect(openTripCoverSheet(1, cover)).toBeUndefined();
  const next = openTripCoverSheet(2, cover);
  releaseTripCoverSheet(invocation);
  expect(readTripCoverSheet(next)).toBe(cover);
  releaseTripCoverSheet(next);
});

it("only exposes and releases a metadata choice for its exact editor invocation", () => {
  const cover = { trip: { id: "trip" }, onSelect: vi.fn() };
  const hero = openTripCoverSheet(account.generation, cover);
  expect(readTripMetadataCover("editor", hero)).toBeUndefined();
  releaseTripCoverSheet(hero);

  const choice = openTripCoverSheet(account.generation, cover, "editor");
  setTripCoverSheetBusy(choice, true);
  expect(readTripMetadataCover("editor", choice)).toBe(cover);
  expect(readTripMetadataCover("other", choice)).toBeUndefined();
  expect(tripMetadataCoverBusy("editor")).toBe(true);
  expect(tripMetadataCoverBusy("other")).toBe(false);
  releaseTripMetadataCover("other", choice);
  expect(readTripMetadataCover("editor", choice)).toBe(cover);
  releaseTripMetadataCover("editor", choice);
  expect(tripMetadataCoverBusy("editor")).toBe(false);
});
