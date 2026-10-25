import { acceptedBoundaryAnchor, type DayEvent } from "@/domain/trip/dayReadModel";

// Presentation facts only; callers must supply actor-visible owning-reader results.
export type P1ReadFacts = Readonly<{
  itemId: string;
  semanticRevision: number;
  note?: string;
  participation?:
    | { mode: "WHOLE_GROUP" | "SELF" }
    | { mode: "SELECTED_MEMBERS"; personIds: readonly string[] };
  photoIds?: readonly string[];
  documentIds?: readonly string[];
  expenseIds?: readonly string[];
  navigationQualified?: boolean;
  pending?: boolean;
}>;
export type P1ReadActions = Partial<
  Record<
    | "map"
    | "navigate"
    | "participants"
    | "photos"
    | "attachments"
    | "expenses"
    | "addPhoto"
    | "addAttachment"
    | "addExpense"
    | "linkExpense",
    () => void
  >
>;
export function currentP1Facts(event: DayEvent, facts?: P1ReadFacts) {
  return facts?.itemId === event.id && facts.semanticRevision === event.semantic_revision
    ? facts
    : undefined;
}
export function p1ReadClocks(event: DayEvent, role: "START" | "END" = "START") {
  const start = event.boundaries.find((b) => b.role === "START"),
    end = event.boundaries.find((b) => b.role === "END");
  const clock = (b: typeof start) => b?.local_time?.slice(0, 5) ?? null;
  const offset =
    start?.local_date && end?.local_date
      ? Math.round(
          (Date.parse(end.local_date + "T12:00:00Z") -
            Date.parse(start.local_date + "T12:00:00Z")) /
            86400000,
        )
      : 0;
  return {
    start,
    end,
    primary: clock(role === "END" ? end : start),
    secondary: role === "START" ? clock(end) : null,
    dayOffset: Number.isSafeInteger(offset) && offset > 0 ? offset : 0,
  };
}
export const distinctP1Count = (ids?: readonly string[]) =>
  ids === undefined ? null : new Set(ids.filter(Boolean)).size;
export function p1NoteExcerpt(note: string) {
  const points = Array.from(note);
  return points.length > 56 ? points.slice(0, 56).join("") + "…" : note;
}
export function p1InsertionEligible(
  event: DayEvent,
  role: "START" | "END",
  context: string,
  now: string,
  pending: boolean,
) {
  const start = event.boundaries.find((b) => b.role === "START"),
    end = event.boundaries.find((b) => b.role === "END");
  const finish = end && acceptedBoundaryAnchor(end);
  return (
    role === "START" &&
    !pending &&
    ["FUTURE", "TODAY"].includes(context) &&
    start?.quality === "EXACT" &&
    !!acceptedBoundaryAnchor(start) &&
    !(context === "TODAY" && finish && Date.parse(finish) <= Date.parse(now))
  );
}

// Fresh direct-entry presentation only; never used for Home/Open Today or clock ticks.
export function p1FreshEntryFocus(
  events: readonly DayEvent[],
  now: string,
  pendingIds: ReadonlySet<string>,
) {
  const instant = Date.parse(now);
  if (!Number.isFinite(instant)) return null;
  const qualified = events.flatMap((event) => {
    const start = event.boundaries.find((b) => b.role === "START"),
      end = event.boundaries.find((b) => b.role === "END");
    const a = start && acceptedBoundaryAnchor(start),
      b = end && acceptedBoundaryAnchor(end);
    return a &&
      !pendingIds.has(event.id) &&
      !["cancelled", "skipped"].includes(event.status)
      ? [{ id: event.id, start: Date.parse(a), end: b ? Date.parse(b) : null }]
      : [];
  });
  const covering = qualified
    .filter((e) => e.end !== null && e.start <= instant && instant < e.end)
    .sort((a, b) => b.start - a.start || a.id.localeCompare(b.id));
  return (
    covering[0]?.id ??
    qualified
      .filter((e) => e.start > instant)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))[0]?.id ??
    null
  );
}
