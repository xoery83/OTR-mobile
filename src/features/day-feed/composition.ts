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

export type FlexibleBlockPort = Readonly<{
  version: "g2-flexible/1";
  synthetic: true;
  id: string;
  title: string;
  accountId: string;
  tripId: string;
  localDate: string;
  itemIds: readonly string[];
  softWindow?: Readonly<{ startMinute: number; endMinute: number }>;
  choiceScope?: "MY" | "GROUP";
  choices: readonly Readonly<{ id: string; name: string; scope: "MY" | "GROUP" }>[];
}>;
export const choiceFocusKey = (
  blockId: string,
  scope: "MY" | "GROUP",
  choiceId: string,
) => JSON.stringify(["FLEXIBLE_CHOICE", blockId, scope, choiceId]);
export const blockRowKey = (blockId: string, localDate: string) =>
  JSON.stringify(["FLEXIBLE_BLOCK", blockId, localDate]);
const hasVersion = (
  block: FlexibleContainer | FlexibleBlockPort,
): block is FlexibleBlockPort => (block as FlexibleBlockPort).version !== undefined;

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
  flexible?: readonly (FlexibleContainer | FlexibleBlockPort)[];
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
  const blocks = (ports.flexible ?? []).filter(
    (block, _, all) => all.filter((b) => b.id === block.id).length === 1,
  );
  const flex = blocks.filter(
    (block): block is FlexibleBlockPort =>
      hasVersion(block) &&
      block.version === "g2-flexible/1" &&
      block.synthetic === true &&
      !!ports.scope &&
      block.accountId === ports.scope.accountId &&
      block.tripId === ports.scope.tripId &&
      block.localDate === query.date &&
      !!block.id &&
      !members.some((item) => item.event.id === block.id) &&
      new Set(
        block.choices.map((choice) => choiceFocusKey(block.id, choice.scope, choice.id)),
      ).size === block.choices.length &&
      block.choices.every((choice) => !!choice.id && !!choice.name) &&
      (!block.softWindow ||
        (Number.isInteger(block.softWindow.startMinute) &&
          Number.isInteger(block.softWindow.endMinute) &&
          block.softWindow.startMinute >= 0 &&
          block.softWindow.endMinute <= 1440 &&
          block.softWindow.startMinute < block.softWindow.endMinute)),
  );
  const acceptedBlocks = blocks.filter(
    (block) => !hasVersion(block) || flex.includes(block),
  );
  const containers = acceptedBlocks.map((block) => {
    const scope = hasVersion(block)
      ? (block.choiceScope ??
        (block.choices.some((c) => c.scope === "MY") ? "MY" : "GROUP"))
      : (ports.choiceScope ?? "MY");
    return {
      id: block.id,
      key: blockRowKey(block.id, query.date),
      title: hasVersion(block) ? block.title : undefined,
      softWindow: block.softWindow,
      choiceScope: scope,
      availableScopes: [...new Set(block.choices.map((c) => c.scope))],
      choices: block.choices
        .filter((c) => c.scope === scope)
        .map((c) => ({
          id: c.id,
          name: "name" in c ? String(c.name) : c.id,
          scope: c.scope,
          key: choiceFocusKey(block.id, c.scope, c.id),
        })),
      version: hasVersion(block) ? block.version : undefined,
    };
  });
  const visibleItem = (id: string | null | undefined) =>
    members.some((r) => r.event.id === id) ? id! : null;
  const visibleChoice = (id: string | null | undefined) =>
    containers.some(
      (b) => b.version === "g2-flexible/1" && b.choices.some((c) => c.key === id),
    )
      ? id!
      : null;
  const visibleBlock = (id: string | null | undefined) =>
    flex.some((b) => b.id === id) ? id! : null;
  const immersive = visibleItem(ports.immersive) ?? visibleBlock(ports.immersive);
  const focus =
    visibleItem(ports.immersive) ??
    visibleItem(ports.focus) ??
    visibleChoice(ports.focus);
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
    const affiliations = acceptedBlocks.filter((b) => b.itemIds.includes(item.event.id));
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
      containerId:
        affiliations.length === 1 &&
        (!hasVersion(affiliations[0]) ||
          (item.anchor !== null &&
            !query.coreRows?.some(
              (r) => r.itemRef === item.event.id && r.position === "BASE",
            )))
          ? affiliations[0].id
          : null,
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
  const enriched = containers.map((block) => ({
    ...block,
    rowKeys: rows.filter((r) => r.containerId === block.id).map((r) => r.key),
    focusedChoiceKey: block.choices.find((c) => c.key === focus)?.key ?? null,
  }));
  const time = (instant: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: query.zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    return (
      Number(parts.find((p) => p.type === "hour")?.value) * 60 +
      Number(parts.find((p) => p.type === "minute")?.value)
    );
  };
  const positioned = flex
    .map((block) => ({
      block: enriched.find((b) => b.id === block.id)!,
      minute: block.softWindow?.startMinute ?? 1440,
    }))
    .sort((a, b) => a.minute - b.minute);
  const nestedBlockIds = new Set(flex.map((block) => block.id));
  const entries: (
    | { kind: "ITEM"; row: (typeof rows)[number] }
    | { kind: "BLOCK"; block: (typeof enriched)[number] }
  )[] = [];
  for (const row of rows.slice(0, query.timed.length)) {
    const minute = positioned.length && row.item.anchor ? time(row.item.anchor) : 1440;
    while (positioned.length && positioned[0].minute <= minute)
      entries.push({ kind: "BLOCK", block: positioned.shift()!.block });
    if (!row.containerId || !nestedBlockIds.has(row.containerId))
      entries.push({ kind: "ITEM", row });
  }
  for (const entry of positioned) entries.push({ kind: "BLOCK", block: entry.block });
  for (const row of rows.slice(query.timed.length)) entries.push({ kind: "ITEM", row });
  return {
    rows,
    entries,
    context,
    now,
    focus,
    immersive,
    nowAfter: now.mode === "BETWEEN_EVENTS" && now.beforeIndex === rows.length,
    containers: enriched,
  };
}
