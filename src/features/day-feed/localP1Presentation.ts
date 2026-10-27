import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import type { CoreBoundaryView } from "@/domain/trip/tripCoreV2Day";
import type { P1RowDisplay } from "./P1Row";
import type { P1ReadFacts } from "./p1ReadPresentation";
type Item = LocalManualRead["items"][number];
// Only display actor-filtered Reader facts. No certificate, Event, instant or capability is created.
export function localP1Presentation(item: Item, occurrence: "START" | "END" = "START") {
  if (
    !Number.isSafeInteger(item.itemRevision) ||
    Number(item.itemRevision) < 1 ||
    item.family !== "P1" ||
    item.hidden ||
    ["cancelled", "skipped"].includes(String(item.status))
  )
    return null;
  const schedule = item.schedule as { start?: CoreBoundaryView; end?: CoreBoundaryView };
  const boundary = <R extends "START" | "END">(role: R, value?: CoreBoundaryView) =>
    value
      ? {
          role,
          local_date: value.localDate ?? null,
          local_time: value.localTime ?? null,
          qualified: value.comparable,
        }
      : undefined;
  const start = boundary("START", schedule.start),
    end = boundary("END", schedule.end);
  const clock = (value?: CoreBoundaryView) => value?.localTime?.slice(0, 5) ?? null;
  const mode = item.participation.mode;
  const personIds = item.participation.personIds.filter(
    (id): id is string => typeof id === "string",
  );
  const participation: P1ReadFacts["participation"] =
    mode === "WHOLE_GROUP" || mode === "SELF"
      ? { mode }
      : mode === "SELECTED_MEMBERS" && personIds.length
        ? { mode, personIds }
        : undefined;
  const display: P1RowDisplay = {
    id: item.itemId,
    semantic_revision: item.itemRevision as number,
    title: String(item.title),
    status: item.status as P1RowDisplay["status"],
    authored_label: item.place?.authoredLabel ?? null,
    accepted_address: item.place?.acceptedAddress ?? null,
    authored_address: item.place?.authoredAddress ?? null,
    accepted_address_line1: null,
    authored_address_line1: null,
    clocks: {
      start,
      end,
      primary: clock(occurrence === "END" ? schedule.end : schedule.start),
      secondary: occurrence === "START" ? clock(schedule.end) : null,
      dayOffset:
        start?.local_date && end?.local_date
          ? Math.max(
              0,
              Math.round(
                (Date.parse(end.local_date + "T12:00:00Z") -
                  Date.parse(start.local_date + "T12:00:00Z")) /
                  86400000,
              ),
            )
          : 0,
    },
  };
  const facts: P1ReadFacts = {
    itemId: item.itemId,
    semanticRevision: display.semantic_revision,
    pending: item.localState === "PENDING",
    participation,
    ...(typeof item.description === "string" ? { note: item.description } : {}),
    documentIds: item.documentSummaries
      .map((d) => d.id)
      .filter((id): id is string => typeof id === "string"),
  };
  return { display, facts };
}
