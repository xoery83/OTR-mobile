import { instantMicroseconds } from "./dayReadModel";
import type { JourneySnapshotItem } from "./journeySnapshot";

export const preparationFamilies = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;
export type PreparationFamily = (typeof preparationFamilies)[number];
export type PreparationEntry = {
  item: JourneySnapshotItem;
  createdAt: string | null;
};

// Consume owning, actor-filtered Items; pending IDs must come from the strict local-manual reader.
export function selectTripPreparation(
  input: readonly PreparationEntry[],
  committedPendingIds: ReadonlySet<string> = new Set(),
) {
  const items = [
    ...new Map(
      input
        .filter(
          ({ item }) =>
            item.localState === "ACCEPTED" ||
            (item.localState === "PENDING" && committedPendingIds.has(item.itemId)),
        )
        .map((entry) => [entry.item.itemId, entry]),
    ).values(),
  ].filter(
    ({ item }) =>
      !item.hidden &&
      !["cancelled", "skipped"].includes(String(item.status)) &&
      preparationFamilies.includes(item.family as PreparationFamily),
  );
  const counts = preparationFamilies.flatMap((family) => {
    const count = items.filter(({ item }) => item.family === family).length;
    return count ? [{ family, count }] : [];
  });
  const recent = items
    .flatMap((entry) => {
      if (!entry.createdAt) return [];
      try {
        return [{ ...entry, timestamp: instantMicroseconds(entry.createdAt) }];
      } catch {
        return [];
      }
    })
    .sort((a, b) =>
      a.timestamp === b.timestamp
        ? a.item.itemId.localeCompare(b.item.itemId)
        : a.timestamp > b.timestamp
          ? -1
          : 1,
    )
    .slice(0, 3)
    .map(({ item, createdAt }) => ({ item, createdAt }));
  return { itemCount: items.length, counts, recent };
}
export type TripPreparation = ReturnType<typeof selectTripPreparation>;
