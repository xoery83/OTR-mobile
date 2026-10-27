import type { RefObject } from "react";
import type { DayListHandle } from "@/features/day-feed/WindowedDayList";
import { useP1Move } from "@/features/day-feed/useP1Move";
import { composeDayStream } from "@/features/day-feed/composition";
import {
  stayMoveItem,
  stayMoveProposal,
} from "@/features/day-feed/bookingReadPresentation";
import { stayFidelityFixture } from "./stayFidelityFixture";
import type { StayRole } from "@/features/day-feed/StayReadView";
export function useStayFixtureMove(
  list: RefObject<DayListHandle | null>,
  id: string,
  clock: string,
  role: StayRole,
  top: number,
  bottom: number,
  onFinish: () => void,
) {
  const fixture = stayFidelityFixture(
    id,
    clock,
    () => {},
    () => {},
    () => {},
    role,
  );
  return useP1Move(
    list,
    JSON.stringify([id, clock, role]),
    top,
    bottom,
    {
      item(key) {
        const stay = fixture.stays.find(
          (s) => key === `${s.id}:CHECKIN` || key === `${s.id}:CHECKOUT`,
        );
        return stay
          ? stayMoveItem(stay, key.endsWith(":CHECKOUT") ? "CHECKOUT" : "CHECKIN")
          : undefined;
      },
      rows: () =>
        fixture.dates.flatMap((date) => [
          { key: `day:${date}`, date, itemId: "", minute: null },
          ...composeDayStream(fixture.query!(date, fixture.zone), fixture.instant, {
            occurrenceFocus: true,
          }).rows.flatMap((row) =>
            row.coreRowKeys.map((key) => ({
              key: `${row.key}:${key.projectionRole}`,
              date,
              itemId: `${row.item.event.id}:${key.projectionRole}`,
              minute: null,
            })),
          ),
        ]),
      duration: () => null,
      propose: stayMoveProposal,
      same: (item, proposal) =>
        proposal.status === "READY" &&
        proposal.date === item.date &&
        proposal.time === item.time,
    },
    onFinish,
  );
}
