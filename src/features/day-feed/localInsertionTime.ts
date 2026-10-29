import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import type { CoreBoundaryView, CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { localDayDisplayOrder } from "./localDayDisplayOrder";
import { p1InsertionTime, type InsertionTimeRow } from "./p1InsertionTime";
// Advisory form defaults from existing Reader order; never a Core Event or time authority.
export function localInsertionTime(
  read: { items: LocalManualRead["items"]; rows(date: string): readonly CoreDayRow[] },
  itemId: string,
  role: string,
  date: string,
  side: "BEFORE" | "AFTER",
) {
  const rows: InsertionTimeRow[] = localDayDisplayOrder(read.rows(date))
    .filter((row) => row.position !== "BASE")
    .map((row) => {
      const item = read.items.find((i) => i.itemId === row.itemRef);
      const schedule = item?.schedule as
        { start?: CoreBoundaryView; end?: CoreBoundaryView } | undefined;
      const boundary = (role: string, value?: CoreBoundaryView) => ({
        role,
        local_date: value?.localDate ?? null,
        local_time: value?.localTime ?? null,
        zone_id: value?.zoneId ?? null,
      });
      return {
        id: `${row.itemRef}:${row.rowKey.projectionRole}`,
        boundaries:
          item?.family === "P1" && row.rowKey.projectionRole === "START"
            ? [boundary("START", schedule?.start), boundary("END", schedule?.end)]
            : [boundary("START", row.displayTime)],
      };
    });
  return p1InsertionTime(rows, `${itemId}:${role}`, side, date);
}
