import { coreUuid } from "./tripCoreV2";
import { validateCalendarDate } from "./dayReadModel";
import type { CoreBoundaryView, CorePlaceView } from "./tripCoreV2Day";
import type { projectCoreItem } from "./tripCoreV2Views";

export type JourneySnapshotItem = NonNullable<ReturnType<typeof projectCoreItem>>;
export type SnapshotTripFacts = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
};
const families = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;
export function snapshotItemDate(item: JourneySnapshotItem): string | null {
  const schedule = item.schedule as {
    start?: CoreBoundaryView;
    origin?: { time?: CoreBoundaryView };
  };
  const value = schedule.start?.localDate ?? schedule.origin?.time?.localDate;
  if (!value) return null;
  try {
    return validateCalendarDate(value);
  } catch {
    return null;
  }
}
function places(item: JourneySnapshotItem): (CorePlaceView | undefined)[] {
  const schedule = item.schedule as {
    origin?: { place?: CorePlaceView };
    destination?: { place?: CorePlaceView };
  };
  if (["P2", "P5"].includes(item.family))
    return [schedule.origin?.place, schedule.destination?.place];
  if (item.family === "P4")
    return [
      item.details.pickupPlace as CorePlaceView | undefined,
      item.details.returnPlace as CorePlaceView | undefined,
    ];
  if (item.family === "P6")
    return [(item.details.entryPlace ?? item.place) as CorePlaceView | undefined];
  return [item.place as CorePlaceView | undefined];
}
function knownDays(root: SnapshotTripFacts | null): number | null {
  if (!root?.startDate || !root.endDate) return null;
  try {
    const start = validateCalendarDate(root.startDate),
      end = validateCalendarDate(root.endDate);
    if (end < start) return null;
    return (
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1
    );
  } catch {
    return null;
  }
}
// Presentation selection only. Caller supplies owning actor-readable canonical Items.
export function selectJourneySnapshot(
  root: SnapshotTripFacts | null,
  input: readonly JourneySnapshotItem[],
) {
  const items = [
    ...new Map(
      input
        .filter(
          (item) =>
            !item.hidden &&
            !["cancelled", "skipped"].includes(String(item.status)) &&
            families.includes(item.family as (typeof families)[number]),
        )
        .map((item) => [item.itemId, item]),
    ).values(),
  ];
  const allPlaces = items.flatMap(places);
  const placeCount =
    allPlaces.length &&
    allPlaces.every(
      (place) =>
        place?.qualification === "QUALIFIED" && coreUuid.safeParse(place.placeId).success,
    )
      ? new Set(allPlaces.map((place) => place!.placeId)).size
      : null;
  const buckets = families.map((family) => {
    const dates = new Map<string, JourneySnapshotItem[]>();
    for (const item of items
      .filter((item) => item.family === family)
      .sort((a, b) => a.itemId.localeCompare(b.itemId))) {
      const date = snapshotItemDate(item) ?? "UNKNOWN";
      dates.set(date, [...(dates.get(date) ?? []), item]);
    }
    const chronological = [...dates.keys()].sort(),
      spread: string[] = [];
    while (chronological.length) {
      spread.push(chronological.shift()!);
      if (chronological.length) spread.push(chronological.pop()!);
    }
    return spread.map((date) => dates.get(date)!);
  });
  const selected: JourneySnapshotItem[] = [];
  while (
    selected.length < 20 &&
    buckets.some((family) => family.some((date) => date.length))
  ) {
    for (const family of buckets) {
      if (selected.length === 20) break;
      const date = family.shift();
      if (!date) continue;
      const item = date.shift();
      if (item) selected.push(item);
      if (date.length) family.push(date);
    }
  }
  return {
    days: knownDays(root),
    places: placeCount,
    activities: items.filter((item) => ["P1", "P6"].includes(item.family)).length,
    itemCount: items.length,
    tags: selected.map((item, slot) => ({
      itemId: item.itemId,
      family: item.family,
      title: String(item.title),
      date: snapshotItemDate(item),
      slot,
    })),
  };
}

// Full authorized Item input, not the capped tag selection. These are candidates;
// the owning Day reader must still qualify an explicit date/zone context.
export function journeySnapshotDayCandidates(
  root: SnapshotTripFacts | null,
  items: readonly JourneySnapshotItem[],
): string[] {
  const dates = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") {
      try {
        dates.add(validateCalendarDate(value));
      } catch {
        /* Unknown/invalid is not a date candidate. */
      }
    }
  };
  add(root?.startDate);
  add(root?.endDate);
  for (const item of items) {
    if (item.hidden || ["cancelled", "skipped"].includes(String(item.status))) continue;
    const schedule = item.schedule as {
      start?: CoreBoundaryView;
      end?: CoreBoundaryView;
      origin?: { time?: CoreBoundaryView };
      destination?: { time?: CoreBoundaryView };
    };
    for (const boundary of [
      schedule.start,
      schedule.end,
      schedule.origin?.time,
      schedule.destination?.time,
    ])
      add(boundary?.localDate);
    const facts = item.details.operationalFacts;
    if (Array.isArray(facts))
      for (const fact of facts)
        add((fact as { time?: CoreBoundaryView }).time?.localDate);
  }
  return [...dates].sort();
}
