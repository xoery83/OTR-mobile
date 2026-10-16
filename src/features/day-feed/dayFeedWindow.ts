import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import type { DayQuery } from "@/domain/trip/dayReadModel";

export type DayWindowRow<T> = {
  key: string;
  date: string;
  value: T;
  isDayHeader?: boolean;
};
export type DayScrollAnchor = { key: string; date: string; within: number };
export type DaySummary = {
  date: string;
  placeTransitionLabel?: string;
  markers: ("Plans" | "Stay" | "Transport")[];
  itemCount: number;
};

// The owning query already decides date membership, permissions and endpoint-local time.
export function summarizeDay(
  query: Pick<DayQuery, "date" | "timed" | "nonComparable">,
  localRows: readonly { itemRef: string; family: string }[] = [],
): DaySummary {
  validateCalendarDate(query.date);
  const items = new Map<string, DaySummary["markers"][number]>();
  for (const { event } of [...query.timed, ...query.nonComparable])
    items.set(
      event.id,
      event.event_type === "hotel"
        ? "Stay"
        : event.temporal_shape === "TRANSPORT" ||
            ["car", "flight", "transport"].includes(event.event_type)
          ? "Transport"
          : "Plans",
    );
  for (const row of localRows)
    items.set(
      row.itemRef,
      row.family === "P3"
        ? "Stay"
        : ["P2", "P4", "P5"].includes(row.family)
          ? "Transport"
          : "Plans",
    );
  return {
    date: query.date,
    itemCount: items.size,
    markers: (["Plans", "Stay", "Transport"] as const).filter((type) =>
      [...items.values()].includes(type),
    ),
  };
}

export function indexDayRows<T>(rows: readonly DayWindowRow<T>[]) {
  const keys = new Map<string, number>(),
    dates = new Map<string, number>();
  rows.forEach((row, index) => {
    validateCalendarDate(row.date);
    if (!row.key || keys.has(row.key)) throw new Error("DAY_ROW_KEY_DUPLICATE");
    keys.set(row.key, index);
    if (!dates.has(row.date) || row.isDayHeader) dates.set(row.date, index);
  });
  return { keys, dates };
}

export function resolveDayAnchor<T>(
  rows: readonly DayWindowRow<T>[],
  anchor: DayScrollAnchor,
) {
  const index = indexDayRows(rows);
  const exact = index.keys.get(anchor.key);
  const target = exact ?? index.dates.get(anchor.date);
  if (target === undefined) return null;
  return {
    index: target,
    within:
      exact === undefined
        ? 0
        : Math.max(0, Number.isFinite(anchor.within) ? anchor.within : 0),
  };
}

// Native cell measurements are layout facts, never time/zone or Canonical Item facts.
export function captureDayAnchor<T>(
  rows: readonly DayWindowRow<T>[],
  layouts: ReadonlyMap<string, { y: number; height: number }>,
  offset: number,
): DayScrollAnchor | null {
  let current: DayScrollAnchor | null = null;
  for (const row of rows) {
    const layout = layouts.get(row.key);
    if (layout && layout.y <= offset && offset < layout.y + layout.height)
      current = { key: row.key, date: row.date, within: offset - layout.y };
  }
  return current;
}

export const dayListWindow = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  windowSize: 5,
} as const;
