import { instantMicroseconds } from "./dayReadModel";
import type { JourneySnapshotItem } from "./journeySnapshot";

export const preparationFamilies = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;
export type PreparationFamily = (typeof preparationFamilies)[number];
export type PreparationEntry = {
  item: JourneySnapshotItem;
  createdAt: string | null;
};

// Consume only owning, actor-filtered formal Items; never Import candidates or files.
export function selectTripPreparation(input: readonly PreparationEntry[]) {
  const items = [
    ...new Map(
      input
        .filter(
          ({ item }) =>
            item.localState === "ACCEPTED" &&
            !item.hidden &&
            !["cancelled", "skipped"].includes(String(item.status)) &&
            preparationFamilies.includes(item.family as PreparationFamily),
        )
        .map((entry) => [entry.item.itemId, entry]),
    ).values(),
  ];
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
