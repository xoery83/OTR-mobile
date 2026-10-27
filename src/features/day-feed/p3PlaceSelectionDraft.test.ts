import { expect, it } from "vitest";
import { p3PlaceSelectionDraft, currentP3PlaceSelection } from "./p3PlaceSelectionDraft";
import type { ApplePlaceCandidate } from "@/data/places/applePlaceProvider";
const binding = {
  tripId: "00000000-0000-4000-8000-000000000001",
  itemId: "00000000-0000-4000-8000-000000000002",
  accountGeneration: 2,
  inputRevision: 1,
  location: "1 Example St",
};
const place: ApplePlaceCandidate = {
  provider: "apple",
  kind: "mapItem",
  handle: "handle",
  sessionId: "00000000-0000-4000-8000-000000000003",
  generation: 3,
  title: "My chosen name",
  secondary: "address",
  address: "1 Example St",
  providerPlaceId: "opaque-poi",
  addressComponents: {
    locality: "Springfield",
    administrativeArea: "Illinois",
    country: "United States",
    countryCode: "US",
  },
  point: { latitude: 1, longitude: 2 },
};
it("preserves raw selected components with attribution and explicitly no Canonical acceptance", () => {
  const draft = p3PlaceSelectionDraft(place, binding)!;
  expect(draft).toMatchObject({
    authority: "UNACCEPTED_PROVIDER_DRAFT",
    provider: "apple",
    selectionSessionId: "00000000-0000-4000-8000-000000000003",
    selectionGeneration: 3,
    addressComponents: place.addressComponents,
  });
  expect(draft).not.toHaveProperty("acceptedPlaceId");
  expect(draft).not.toHaveProperty("acceptedCity");
  expect(Object.isFrozen(draft)).toBe(true);
  expect(Object.isFrozen(draft.addressComponents)).toBe(true);
  expect(draft.addressComponents).not.toBe(place.addressComponents);
  expect(currentP3PlaceSelection(draft, binding)).toBe(draft);
});
it.each([
  { tripId: "another-trip" },
  { itemId: "another-stay" },
  { accountGeneration: 3 },
  { inputRevision: 2 },
  { location: "Changed address" },
])("invalidates the draft when its binding changes: %j", (change) => {
  expect(
    currentP3PlaceSelection(p3PlaceSelectionDraft(place, binding), {
      ...binding,
      ...change,
    }),
  ).toBeNull();
});
it("does not infer geography from an address or retain unresolved/mismatched candidates", () => {
  expect(p3PlaceSelectionDraft({ ...place, kind: "completion" }, binding)).toBeNull();
  expect(p3PlaceSelectionDraft(place, { ...binding, location: "Other" })).toBeNull();
  expect(p3PlaceSelectionDraft(place, { ...binding, inputRevision: 0 })).toBeNull();
  const {
    addressComponents: _parts,
    point: _point,
    providerPlaceId: _id,
    ...textOnly
  } = place;
  expect(p3PlaceSelectionDraft(textOnly, binding)).not.toHaveProperty(
    "addressComponents",
  );
});
