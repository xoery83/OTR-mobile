import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
// Civil labels order the authored day without qualifying an instant or duration.
export function localDayDisplayOrder<T extends CoreDayRow>(rows: readonly T[]): T[] {
  const clock = (row: CoreDayRow) => row.displayTime?.localTime?.slice(0, 5);
  const visible = rows.filter(
    (row) => row.family !== "P2" || row.rowKey.projectionRole !== "DESTINATION",
  );
  const sortable = (row: T) =>
    row.position === "TNS" && row.family !== "P2" && !row.displayTime?.comparable;
  const ordered = visible
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
  return visible.map((row) => (!sortable(row) ? row : ordered[cursor++].row));
}
