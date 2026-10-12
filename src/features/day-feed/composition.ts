import { localCalendarDate, type DayQuery } from "@/domain/trip/dayReadModel";
import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { placeNow } from "@/domain/trip/experience/nowIndicator";

export const dayRowKey = (itemId: string, role: string, localDate: string) =>
  JSON.stringify([itemId, role, localDate]);

// Read-only fixture port; Flexible owns affiliation and Choice authorization.
export type FlexibleContainer = Readonly<{
  id: string;
  itemIds: readonly string[];
  softWindow?: Readonly<{
    start?: import("@/domain/trip/tripCoreV2Day").CoreBoundaryView;
    end?: import("@/domain/trip/tripCoreV2Day").CoreBoundaryView;
  }>;
  choices: readonly Readonly<{ id: string; scope: "MY" | "GROUP" }>[];
}>;

type RelationIdentity = Readonly<{
  accountId: string;
  tripId: string;
  fromEventId: string;
  toEventId: string;
  occurrenceDiscriminator: string;
}>;
// Structural subset of the owning ttr-presentation/1 output; no provider observations.
export type TransitionProjection = Readonly<{
  version: "ttr-presentation/1";
  identity: RelationIdentity | null;
  qualification: "QUALIFIED" | "UNQUALIFIED";
  unavailableReason: string | null;
  publicationVersion: number;
  visibility: "HIDDEN" | "STRAIGHT_LINE" | "SELECTED_MODE" | "SUGGESTED_MODE";
  modeOrigin: "NONE" | "USER_CONFIRMED" | "SYSTEM_SUGGESTED";
  mode: "walking" | "driving" | "transit" | null;
  geometricDistance?: Readonly<{
    kind: "STRAIGHT_LINE";
    source: "LOCAL_GEOMETRY";
    meters: number;
  }>;
  anchors: Readonly<{ fromRowKey: string; toRowKey: string }> | null;
  actions: Readonly<{
    openTtr: Readonly<{
      identity: RelationIdentity;
      publicationVersion: number;
    }> | null;
  }>;
}>;
export type DayStreamPorts = {
  focus?: string | null;
  immersive?: string | null;
  flexible?: readonly FlexibleContainer[];
  choiceScope?: "MY" | "GROUP";
  transitions?: readonly TransitionProjection[];
  scope?: { accountId: string; tripId: string };
};
const relationKey = (identity: RelationIdentity) =>
  JSON.stringify([
    identity.accountId,
    identity.tripId,
    identity.fromEventId,
    identity.toEventId,
    identity.occurrenceDiscriminator,
  ]);

// G2 owns final presentation; selectors and E1B remain upstream semantic inputs.
export function composeDayStream(
  query: DayQuery & { coreRows?: readonly CoreDayRow[] },
  instant: string,
  ports: DayStreamPorts = {},
) {
  const members = [...query.timed, ...query.nonComparable];
  if (new Set(members.map((r) => r.event.id)).size !== members.length)
    throw new Error("DAY_STREAM_DUPLICATE_ITEM");
  const now = placeNow(query, members, instant);
  let context: "FUTURE" | "TODAY" | "PAST" | "UNKNOWN" = "UNKNOWN";
  try {
    const today = localCalendarDate(instant, query.zone);
    context = query.date < today ? "PAST" : query.date > today ? "FUTURE" : "TODAY";
  } catch {
    // Invalid view time cannot qualify a Transition presentation.
  }
  const visible = (id: string | null | undefined) =>
    members.some((r) => r.event.id === id) ? id! : null;
  const focus = visible(ports.immersive) ?? visible(ports.focus);
  const blocks = (ports.flexible ?? []).filter(
    (block, _, all) => all.filter((b) => b.id === block.id).length === 1,
  );
  const rows = members.map((item, index) => {
    const coreRowKeys =
      query.coreRows
        ?.filter((row) => row.itemRef === item.event.id)
        .map((row) => row.rowKey) ?? [];
    const owningKeys = coreRowKeys.map((row) => [
      row.itemId,
      row.projectionRole,
      row.localDate,
    ]);
    const key =
      owningKeys.length === 1
        ? JSON.stringify(owningKeys[0])
        : owningKeys.length > 1
          ? JSON.stringify(owningKeys)
          : dayRowKey(item.event.id, "EVENT", query.date);
    const affiliations = blocks.filter((b) => b.itemIds.includes(item.event.id));
    const nowBefore = now.mode === "BETWEEN_EVENTS" && now.beforeIndex === index;
    // shortcut: same-day adjacent EVENT anchors only, expand after Core's role/occurrence port is accepted.
    const candidates = (ports.transitions ?? []).filter((p) => {
      const id = p.identity,
        action = p.actions.openTtr;
      if (
        context === "PAST" ||
        context === "UNKNOWN" ||
        p.version !== "ttr-presentation/1" ||
        p.qualification !== "QUALIFIED" ||
        p.unavailableReason !== null ||
        p.visibility === "HIDDEN" ||
        !id ||
        !action ||
        !ports.scope ||
        !p.anchors ||
        index === 0 ||
        id.accountId !== ports.scope.accountId ||
        id.tripId !== ports.scope.tripId ||
        !id.occurrenceDiscriminator ||
        id.fromEventId !== members[index - 1].event.id ||
        id.toEventId !== item.event.id ||
        p.anchors.toRowKey !== key ||
        p.anchors.fromRowKey !== dayRowKey(id.fromEventId, "EVENT", query.date) ||
        !Number.isSafeInteger(p.publicationVersion) ||
        p.publicationVersion < 0 ||
        action.publicationVersion !== p.publicationVersion ||
        relationKey(action.identity) !== relationKey(id)
      )
        return false;
      const distance = p.geometricDistance;
      if (
        distance &&
        (distance.kind !== "STRAIGHT_LINE" ||
          distance.source !== "LOCAL_GEOMETRY" ||
          !Number.isFinite(distance.meters) ||
          distance.meters < 0)
      )
        return false;
      return p.visibility === "STRAIGHT_LINE"
        ? !!distance && p.mode === null && p.modeOrigin === "NONE"
        : ["walking", "driving", "transit"].includes(p.mode ?? "") &&
            p.modeOrigin ===
              (p.visibility === "SELECTED_MODE" ? "USER_CONFIRMED" : "SYSTEM_SUGGESTED");
    });
    const projection = candidates.length === 1 ? candidates[0] : null;
    return {
      key,
      coreRowKeys,
      item,
      position: query.coreRows
        ?.filter((r) => r.itemRef === item.event.id)
        .some((r) => r.position === "BASE")
        ? ("BASE" as const)
        : item.anchor === null
          ? ("TNS" as const)
          : ("TIMELINE" as const),
      focused: focus === item.event.id,
      nowBefore,
      nowWithin: now.mode === "WITHIN_EVENT_WINDOW" && now.eventId === item.event.id,
      containerId: affiliations.length === 1 ? affiliations[0].id : null,
      transition: projection
        ? {
            key: relationKey(projection.identity!),
            mode: projection.mode,
            modeOrigin: projection.modeOrigin,
            ...(projection.geometricDistance
              ? { geometricDistance: projection.geometricDistance }
              : {}),
            suppressConnector: nowBefore,
            openTtr: projection.actions.openTtr!,
          }
        : null,
    };
  });
  return {
    rows,
    context,
    now,
    focus,
    immersive: visible(ports.immersive),
    nowAfter: now.mode === "BETWEEN_EVENTS" && now.beforeIndex === rows.length,
    containers: blocks.map((b) => ({
      id: b.id,
      ...(b.softWindow ? { softWindow: b.softWindow } : {}),
      rowKeys: rows.filter((r) => r.containerId === b.id).map((r) => r.key),
      choices: b.choices.filter((c) => c.scope === (ports.choiceScope ?? "MY")),
    })),
  };
}
