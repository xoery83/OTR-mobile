import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";

const baseRoles = ["BASE_FROM", "TONIGHT", "BASE_RETURN"];
// P3-02 replaces W0's paired Base presentation with one tail occurrence per Stay/day.
// Retain an original owning row/key; never merge titles or change the Core projection.
export function stayBasePresentationRows<T extends Pick<CoreDayRow, "family" | "rowKey">>(
  rows: readonly T[],
): T[] {
  const chosen = new Map<string, number>();
  const identity = (row: T) => JSON.stringify([row.rowKey.itemId, row.rowKey.localDate]);
  const base = (row: T) =>
    row.family === "P3" && baseRoles.includes(row.rowKey.projectionRole);
  rows.forEach((row, index) => {
    if (!base(row)) return;
    const key = identity(row),
      previous = chosen.get(key);
    if (
      previous === undefined ||
      baseRoles.indexOf(row.rowKey.projectionRole) >
        baseRoles.indexOf(rows[previous].rowKey.projectionRole)
    )
      chosen.set(key, index);
  });
  return rows.filter((row, index) => !base(row) || chosen.get(identity(row)) === index);
}
