import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
// A same-day Flight leg is displayed once; its sort clock is the real departure row.
// No qualified instant/Reader position is changed, and other multi-role families stay untouched.
export function flightDisplayOwningRow(
  rows: readonly CoreDayRow[],
): CoreDayRow | undefined {
  if (rows.length === 1) return rows[0];
  if (rows.length !== 2) return undefined;
  const origin = rows.find((row) => row.rowKey.projectionRole === "ORIGIN");
  const destination = rows.find((row) => row.rowKey.projectionRole === "DESTINATION");
  if (
    !origin ||
    !destination ||
    rows.some(
      (row) =>
        row.family !== "P2" ||
        row.itemRef !== origin.itemRef ||
        row.rowKey.itemId !== origin.rowKey.itemId ||
        row.rowKey.localDate !== origin.rowKey.localDate ||
        row.itemRevision !== origin.itemRevision,
    )
  )
    return undefined;
  return origin;
}
