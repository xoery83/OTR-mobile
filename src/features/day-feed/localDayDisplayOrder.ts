import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { stayBasePresentationRows } from "./stayBasePresentationRows";
// Presentation only: qualified timeline and Base slots remain Reader-owned.
export function civilClockDisplayOrder<T>(
  rows: readonly T[],
  owningRow: (row: T) => CoreDayRow | undefined,
): T[] {
  const clock = (row: T) => owningRow(row)?.displayTime?.localTime?.slice(0, 5);
  const sortable = (row: T) => {
    const projection = owningRow(row);
    return projection?.position === "TNS" && !projection.displayTime?.comparable;
  };
  const ordered = rows
    .filter(sortable)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = clock(a.row),
        right = clock(b.row);
      if (left && right) return left.localeCompare(right) || a.index - b.index;
      if (left || right) return left ? 1 : -1;
      return a.index - b.index;
    });
  let cursor = 0;
  return rows.map((row) => (!sortable(row) ? row : ordered[cursor++].row));
}

export function localDayDisplayOrder<T extends CoreDayRow>(rows: readonly T[]): T[] {
  const visible = stayBasePresentationRows(rows).filter(
    (row) => row.family !== "P2" || row.rowKey.projectionRole !== "DESTINATION",
  );
  return civilClockDisplayOrder(visible, (row) => row);
}

// Pending civil rows share the accepted TNS band; qualified rows keep their order.
export function mixedDayDisplayOrder<T>(
  rows: readonly T[],
  position: (row: T) => CoreDayRow["position"] | undefined,
  owningRow: (row: T) => CoreDayRow | undefined,
): T[] {
  return [
    ...civilClockDisplayOrder(
      rows.filter((row) => position(row) === "TNS"),
      owningRow,
    ),
    ...rows.filter((row) => !["TNS", "BASE"].includes(position(row) ?? "")),
    ...rows.filter((row) => position(row) === "BASE"),
  ];
}
