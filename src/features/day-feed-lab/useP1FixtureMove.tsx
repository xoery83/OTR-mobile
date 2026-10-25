import type { RefObject } from "react";
import type { DayListHandle } from "@/features/day-feed/WindowedDayList";
import { useP1Move } from "@/features/day-feed/useP1Move";
import { p1FidelityFixture, p1FidelityPack } from "./p1FidelityFixture";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
import { moveProposal, durationMinutes, samePlacement } from "./p1MovePilotModel";
export {
  P1MeasuredMoveRegion,
  type FixtureMovePreview,
  type MovePoint,
} from "@/features/day-feed/useP1Move";
export function useP1FixtureMove(
  list: RefObject<DayListHandle | null>,
  resetKey: string,
  topInset: number,
  bottomInset = 34,
  onFinish?: () => void,
) {
  return useP1Move(
    list,
    resetKey,
    topInset,
    bottomInset,
    {
      item: (id) =>
        p1FidelityPack.items.find(
          (item) => item.id === id && item.availability === "AVAILABLE",
        ),
      rows: (previews) => {
        const fixture = p1FidelityFixture("future", {}, undefined, undefined, {
          previews,
          handlers: { start() {}, change() {}, end() {} },
        });
        return fixture.dates.flatMap((date) => [
          { key: `day:${date}`, date, itemId: "", minute: null },
          ...composeDayStream(
            itemsForLocalDate(fixture.projection, date, fixture.zone),
            fixture.instant,
            { occurrenceFocus: true },
          ).rows.map((row) => {
            const role = row.item.roles.includes("START") ? "START" : "END";
            const time =
              row.position === "TNS"
                ? null
                : row.item.event.boundaries.find((b) => b.role === role)?.local_time;
            return {
              key: row.key,
              date,
              itemId: row.item.event.id,
              minute: time
                ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
                : null,
            };
          }),
        ]);
      },
      propose: (item, date, minute, ntc, duration) =>
        moveProposal(item, date, minute, ntc, duration, true),
      duration: durationMinutes,
      same: samePlacement,
    },
    onFinish,
  );
}
