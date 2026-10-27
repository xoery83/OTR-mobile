import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { p1FidelityPack } from "./p1FidelityFixture";
import { durationMinutes, moveProposal } from "./p1MovePilotModel";
import type { FixtureMovePreview } from "./useP1FixtureMove";
// DEV route carries authored preview placement only; instants are recomputed from the frozen Item.
export function p1MoveDetailPreview(
  itemId: string | undefined,
  raw: string | undefined,
): FixtureMovePreview | undefined {
  if (!raw || raw.length > 150) return;
  try {
    const source = p1FidelityPack.items.find(
      (item) => item.id === itemId && item.availability === "AVAILABLE",
    );
    const value = JSON.parse(raw);
    if (
      !source ||
      !value ||
      typeof value.date !== "string" ||
      (value.time !== null &&
        (typeof value.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)))
    )
      return;
    validateCalendarDate(value.date);
    const minutes = value.time
      ? Number(value.time.slice(0, 2)) * 60 + Number(value.time.slice(3))
      : 0;
    const proposal = moveProposal(
      source,
      value.date,
      minutes,
      value.time === null,
      durationMinutes(source),
      true,
    );
    if (proposal.status !== "READY") return;
    return {
      date: proposal.date!,
      time: proposal.time ?? null,
      endDate: proposal.endDate ?? null,
      endTime: proposal.endTime ?? null,
      instant: proposal.instant ?? null,
      endInstant: proposal.endInstant ?? null,
      zone: proposal.zone ?? null,
    };
  } catch {
    return;
  }
}
