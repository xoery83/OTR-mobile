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

export function validFlexibleBlock(
  block: FlexibleBlockPort,
  scope: { accountId: string; tripId: string; localDate: string },
) {
  return (
    block?.version === "g2-flexible/1" &&
    block.synthetic === true &&
    block.accountId === scope.accountId &&
    block.tripId === scope.tripId &&
    block.localDate === scope.localDate &&
    typeof block.id === "string" &&
    !!block.id &&
    typeof block.title === "string" &&
    Array.isArray(block.itemIds) &&
    block.itemIds.every((id) => typeof id === "string" && !!id) &&
    Array.isArray(block.choices) &&
    block.choices.every(
      (choice) =>
        choice &&
        typeof choice.id === "string" &&
        !!choice.id &&
        typeof choice.name === "string" &&
        !!choice.name &&
        (choice.scope === "MY" || choice.scope === "GROUP"),
    ) &&
    new Set(
      block.choices.map((choice) => choiceFocusKey(block.id, choice.scope, choice.id)),
    ).size === block.choices.length &&
    (block.choiceScope === undefined ||
      block.choiceScope === "MY" ||
      block.choiceScope === "GROUP") &&
    (!block.softWindow ||
      (Number.isInteger(block.softWindow.startMinute) &&
        Number.isInteger(block.softWindow.endMinute) &&
        block.softWindow.startMinute >= 0 &&
        block.softWindow.endMinute <= 1440 &&
        block.softWindow.startMinute < block.softWindow.endMinute))
  );
}

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
  inputFingerprint?: string | null;
  visibility: "HIDDEN" | "STRAIGHT_LINE" | "SELECTED_MODE" | "SUGGESTED_MODE";
  modeOrigin: "NONE" | "USER_CONFIRMED" | "SYSTEM_SUGGESTED";
  mode: "walking" | "driving" | "transit" | null;
  geometricDistance?: Readonly<{
    kind: "STRAIGHT_LINE";
    source: "LOCAL_GEOMETRY";
    meters: number;
  }>;
  route?: Readonly<{ status: "MISSING" | "PENDING" | "AVAILABLE" | "FAILED" }>;
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
  occurrenceFocus?: boolean;
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
  const owningRows = members.map(
    (item) =>
      query.coreRows?.filter(
        (row) =>
          row.itemRef === item.event.id &&
          (row.family !== "P4" ||
            (item.roles.length === 1 &&
              ["START", "END"].includes(item.roles[0]) &&
              row.rowKey.itemId === item.event.id &&
              row.rowKey.localDate === query.date &&
              row.rowKey.projectionRole ===
                (item.roles[0] === "END" ? "RETURN" : "PICKUP"))),
      ) ?? [],
  );
  const keys = members.map((item, index) => {
    const owningKeys = owningRows[index].map((row) => [
      row.rowKey.itemId,
      row.rowKey.projectionRole,
      row.rowKey.localDate,
    ]);
    return owningKeys.length === 1
      ? JSON.stringify(owningKeys[0])
      : owningKeys.length > 1
        ? JSON.stringify(owningKeys)
        : dayRowKey(item.event.id, "EVENT", query.date);
  });
  const focusKeys = members.map((item, index) =>
    ports.occurrenceFocus ||
    members.filter((other) => other.event.id === item.event.id).length > 1
      ? keys[index]
      : item.event.id,
  );
  if (new Set(keys).size !== members.length) throw new Error("DAY_STREAM_DUPLICATE_ITEM");
  const now = placeNow(query, members, instant);
  let context: "FUTURE" | "TODAY" | "PAST" | "UNKNOWN" = "UNKNOWN";
  try {
    if (query.zone !== null) {
      const today = localCalendarDate(instant, query.zone);
      context = query.date < today ? "PAST" : query.date > today ? "FUTURE" : "TODAY";
    }
  } catch {
    // Invalid view time cannot qualify a Transition presentation.
  }
  const blocks = (ports.flexible ?? []).filter(
    (block, _, all) => all.filter((b) => b.id === block.id).length === 1,
  );
  const flex = blocks.filter(
    (block): block is FlexibleBlockPort =>
      hasVersion(block) &&
      !!ports.scope &&
      validFlexibleBlock(block, { ...ports.scope, localDate: query.date }) &&
      !members.some((item) => item.event.id === block.id),
  );
  const acceptedBlocks = blocks.filter(
    (block) => !hasVersion(block) || flex.includes(block),
  );
  const containers = acceptedBlocks.map((block) => {
    const preferred = hasVersion(block)
      ? (block.choiceScope ??
        (block.choices.some((c) => c.scope === "MY") ? "MY" : "GROUP"))
      : (ports.choiceScope ?? "MY");
    const scope =
      hasVersion(block) &&
      block.choices.length &&
      !block.choices.some((choice) => choice.scope === preferred)
        ? block.choices[0].scope
        : preferred;
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
    focusKeys.includes(id ?? "") ? id! : null;
  const visibleChoice = (id: string | null | undefined) =>
    containers.some(
      (b) => b.version === "g2-flexible/1" && b.choices.some((c) => c.key === id),
    )
      ? id!
      : null;
  const visibleBlock = (id: string | null | undefined) =>
    flex.some((b) => b.id === id) ? id! : null;
  const immersive = visibleItem(ports.immersive) ?? visibleBlock(ports.immersive);
  const retainedFocus = visibleItem(ports.focus) ?? visibleChoice(ports.focus);
  const blockImmersive = !!visibleBlock(immersive);
  const focus = blockImmersive ? null : (visibleItem(immersive) ?? retainedFocus);
  const suspendedFocus = blockImmersive ? retainedFocus : null;
  const rows = members.map((item, index) => {
    const coreRowKeys = owningRows[index].map((row) => row.rowKey);
    const key = keys[index];
    const focusKey = focusKeys[index];
    const affiliations = acceptedBlocks.filter((b) => b.itemIds.includes(item.event.id));
    const nowBefore = now.mode === "BETWEEN_EVENTS" && now.beforeIndex === index;
    // Only exact owning presentation anchors qualify; visual adjacency supplies no authority.
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
        (p.route &&
          !["MISSING", "PENDING", "AVAILABLE", "FAILED"].includes(p.route.status)) ||
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
        p.anchors.fromRowKey !==
          (owningRows[index - 1].length === 1 && owningRows[index - 1][0].family === "P4"
            ? keys[index - 1]
            : dayRowKey(id.fromEventId, "EVENT", query.date)) ||
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
    const nested = flex.some(
      (block) =>
        block.itemIds.includes(item.event.id) ||
        (index > 0 && block.itemIds.includes(members[index - 1].event.id)),
    );
    const projection = candidates.length === 1 && !nested ? candidates[0] : null;
    return {
      key,
      coreRowKeys,
      focusKey,
      item,
      position: query.coreRows
        ?.filter((r) => r.itemRef === item.event.id)
        .some((r) => r.position === "BASE")
        ? ("BASE" as const)
        : item.anchor === null
          ? ("TNS" as const)
          : ("TIMELINE" as const),
      focused: focus === focusKey,
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
            inputFingerprint: projection.inputFingerprint ?? null,
            visibility: projection.visibility,
            mode: projection.mode,
            modeOrigin: projection.modeOrigin,
            routeStatus: projection.route?.status ?? "MISSING",
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
    if (query.zone === null) return null;
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
  for (const row of rows.slice(query.timed.length))
    if (row.position === "TNS") entries.push({ kind: "ITEM", row });
  for (const row of rows.slice(0, query.timed.length)) {
    // Unknown Day context cannot position relative blocks against an absolute clock.
    const minute = !query.zone
      ? -1
      : positioned.length && row.item.anchor
        ? (time(row.item.anchor) ?? -1)
        : 1440;
    while (positioned.length && positioned[0].minute <= minute)
      entries.push({ kind: "BLOCK", block: positioned.shift()!.block });
    if (!row.containerId || !nestedBlockIds.has(row.containerId))
      entries.push({ kind: "ITEM", row });
  }
  for (const entry of positioned) entries.push({ kind: "BLOCK", block: entry.block });
  for (const row of rows.slice(query.timed.length))
    if (row.position === "BASE") entries.push({ kind: "ITEM", row });
  return {
    rows,
    entries,
    context,
    now,
    focus,
    suspendedFocus,
    immersive,
    nowAfter: now.mode === "BETWEEN_EVENTS" && now.beforeIndex === rows.length,
    containers: enriched,
  };
}
