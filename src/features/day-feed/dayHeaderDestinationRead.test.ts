import { expect, it } from "vitest";
import {
  dayHeaderDestinationRead,
  resolveDayHeaderDestination,
} from "./dayHeaderDestinationRead";
const none = { kind: "unresolved", label: null, source: "none" };
const stay = (
  id = "stay",
  start = "2026-10-27",
  end = "2026-10-30",
  city = "Nelson",
  region = "Nelson",
) =>
  ({
    itemId: id,
    tripId: "trip",
    family: "P3",
    title: "SkyCity Hotel",
    itemRevision: 1,
    hidden: false,
    status: "planned",
    visibility: "GROUP",
    participation: { mode: "WHOLE_GROUP", personIds: [] },
    schedule: { start: { localDate: start }, end: { localDate: end } },
    place: {
      qualification: "QUALIFIED",
      latitude: 1,
      longitude: 2,
      acceptedAddressLocality: city,
      acceptedAddressRegion: region,
      acceptedAddressCountry: "New Zealand",
      locationInputRevision: 1,
      spatialProvenanceRefs: {
        source: "MANUAL_USER_REVIEWED_APPLE_SELECTION_V1",
        acceptance: "USER_CONFIRMED_SAVE",
        input_revision: "1",
      },
    },
  }) as any;
const read = (items: any[]) => ({
  tripId: "trip",
  accountId: "viewer",
  generation: 1,
  items,
});
it.each(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"])(
  "uses only a qualified covering Stay, including empty nights and checkout base: %s",
  (date) => {
    expect(resolveDayHeaderDestination(read([stay()]), date)).toEqual({
      kind: "single",
      source: "stay",
      label: "Nelson",
    });
  },
);
it("does not extend a Stay to unrelated empty days", () => {
  expect(resolveDayHeaderDestination(read([stay()]), "2026-10-31")).toEqual(none);
});
it("resolves same-day check-out/check-in with verified different identities and collapses the same city", () => {
  const from = stay("first", "2026-10-26", "2026-10-28", "Auckland", "Auckland"),
    to = stay("second", "2026-10-28", "2026-10-30");
  expect(resolveDayHeaderDestination(read([from, to]), "2026-10-28")).toEqual({
    kind: "route",
    source: "stay",
    label: "Auckland → Nelson",
  });
  expect(
    resolveDayHeaderDestination(
      read([to, stay("third", "2026-10-26", "2026-10-28")]),
      "2026-10-28",
    ),
  ).toEqual({ kind: "single", source: "stay", label: "Nelson" });
});
it("keeps overlapping conflicting cities unresolved, including homonyms in different regions", () => {
  expect(
    resolveDayHeaderDestination(
      read([stay(), stay("other", "2026-10-27", "2026-10-30", "Auckland", "Auckland")]),
      "2026-10-28",
    ),
  ).toEqual(none);
  expect(
    resolveDayHeaderDestination(
      read([
        stay("a", undefined, undefined, "Springfield", "Illinois"),
        stay("b", undefined, undefined, "Springfield", "Massachusetts"),
      ]),
      "2026-10-28",
    ),
  ).toEqual(none);
});
it("never promotes POI/address text, draft metadata or stale geography", () => {
  const qualified = stay();
  for (const place of [
    {
      qualification: "QUALIFIED",
      authoredLabel: "Nelson Airport",
      acceptedAddress: "Nelson, New Zealand",
      latitude: 1,
      longitude: 2,
    },
    {
      ...qualified.place,
      spatialProvenanceRefs: {
        ...qualified.place.spatialProvenanceRefs,
        acceptance: "UNACCEPTED_PROVIDER_DRAFT",
      },
    },
    { ...qualified.place, locationInputRevision: 2 },
    { ...qualified.place, acceptedAddressCountry: undefined },
  ])
    expect(
      resolveDayHeaderDestination(read([{ ...qualified, place }]), "2026-10-28"),
    ).toEqual(none);
});
it("does not leak private, selected-member, hidden, cancelled or foreign Trip places into the Header", () => {
  for (const change of [
    { visibility: "PRIVATE" },
    { visibility: "SELECTED_PERSONS" },
    { participation: { mode: "SELF" } },
    { participation: { mode: "SELECTED_MEMBERS" } },
    { hidden: true },
    { status: "cancelled" },
    { tripId: "foreign" },
  ])
    expect(
      resolveDayHeaderDestination(read([{ ...stay(), ...change }]), "2026-10-28"),
    ).toEqual(none);
});
it("uses region only when its accepted country-qualified locality is absent", () => {
  const item = stay();
  delete item.place.acceptedAddressLocality;
  expect(resolveDayHeaderDestination(read([item]), "2026-10-28")).toEqual({
    kind: "single",
    source: "stay",
    label: "Nelson",
  });
});
it("overlays by stable Item ID, keeps viewer scope and has no cross-Account derived cache", () => {
  const old = stay(),
    current = stay();
  current.place.acceptedAddressLocality = "Auckland";
  const result = dayHeaderDestinationRead({
    scope: { tripId: "trip", accountId: "viewer", generation: 2 },
    observed: { projection: { version: 2, tripId: "trip", items: [old] } },
    localManual: { items: [current] },
  } as any)!;
  expect(result.items).toEqual([current]);
  expect(result.generation).toBe(2);
  expect(resolveDayHeaderDestination(result, "2026-10-28").label).toBe("Auckland");
  expect(resolveDayHeaderDestination(read([]), "2026-10-28")).toEqual(none);
});
