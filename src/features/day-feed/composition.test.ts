import { expect, it } from "vitest";
import { itemsForLocalDate, type DayProjection } from "@/domain/trip/dayReadModel";
import { closedItemCapabilities, type CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import {
  composeDayStream,
  dayRowKey,
  choiceFocusKey,
  type TransitionProjection,
} from "./composition";
import { flexibleContribution } from "../day-feed-lab/flexibleContribution";
import { faroeNegativeFixtures, syntheticDate } from "./faroeNegative.test.fixtures";
const now = `${syntheticDate}T09:30:00Z`;
function setup() {
  const f = faroeNegativeFixtures();
  const query = itemsForLocalDate(f.day, syntheticDate, "UTC");
  const identity = {
    accountId: f.day.accountId,
    tripId: f.day.tripId,
    fromEventId: f.before.id,
    toEventId: f.segment.id,
    occurrenceDiscriminator: "synthetic-owning-occurrence-relation",
  };
  const transition: TransitionProjection = {
    version: "ttr-presentation/1",
    identity,
    qualification: "QUALIFIED",
    unavailableReason: null,
    publicationVersion: 1,
    visibility: "STRAIGHT_LINE",
    modeOrigin: "NONE",
    mode: null,
    geometricDistance: { kind: "STRAIGHT_LINE", source: "LOCAL_GEOMETRY", meters: 1200 },
    anchors: {
      fromRowKey: dayRowKey(f.before.id, "EVENT", syntheticDate),
      toRowKey: dayRowKey(f.segment.id, "EVENT", syntheticDate),
    },
    actions: { openTtr: { identity, publicationVersion: 1 } },
  };
  return {
    f,
    query,
    transition,
    scope: { accountId: identity.accountId, tripId: identity.tripId },
  };
}
it("preserves selector order, unique stable keys, input facts and one manual Focus", () => {
  const { f, query } = setup(),
    bytes = JSON.stringify(query);
  const first = composeDayStream(query, now, { focus: f.before.id });
  expect(first.rows.map((r) => r.item.event.id)).toEqual(
    query.timed.map((r) => r.event.id),
  );
  expect(new Set(first.rows.map((r) => r.key)).size).toBe(first.rows.length);
  expect(first.rows.filter((r) => r.focused).map((r) => r.item.event.id)).toEqual([
    f.before.id,
  ]);
  const later = composeDayStream(query, `${syntheticDate}T11:00:00Z`, {
    focus: f.before.id,
  });
  expect(later.rows.map((r) => r.key)).toEqual(first.rows.map((r) => r.key));
  expect(later.focus).toBe(f.before.id);
  expect(composeDayStream(query, now).focus).toBeNull();
  expect(composeDayStream(query, now, { focus: "removed" }).focus).toBeNull();
  expect(
    composeDayStream(query, now, {
      focus: f.before.id,
      immersive: f.segment.id,
    }).rows.filter((r) => r.focused),
  ).toHaveLength(1);
  expect(JSON.stringify(query)).toBe(bytes);
});
it("date-only rows stay in TNS without inventing midnight or clock", () => {
  const { f } = setup();
  const dateOnly = structuredClone(f.before);
  dateOnly.temporal_shape = "CALENDAR";
  dateOnly.boundaries = [dateOnly.boundaries[0]];
  Object.assign(dateOnly.boundaries[0], {
    instant: null,
    source_instant: null,
    local_time: null,
    quality: "UNKNOWN",
    clock_precision: null,
  });
  const query = itemsForLocalDate({ ...f.day, events: [dateOnly] }, syntheticDate, "UTC");
  const stream = composeDayStream(query, now);
  expect(stream.rows[0]).toMatchObject({ position: "TNS", item: { anchor: null } });
  expect(stream.now.mode).toBe("HIDDEN");
  expect(stream.rows[0].item.event.boundaries[0].local_time).toBeNull();
});
it("presents shared TNS above timed rows and Flexible Blocks while leaving BASE and NOW in place", () => {
  const { f } = setup();
  const tns = structuredClone(f.before);
  tns.id = "tns";
  tns.boundaries[0] = {
    ...tns.boundaries[0],
    instant: null,
    source_instant: null,
    local_time: null,
    quality: "UNKNOWN",
    clock_precision: null,
    source_instant_precision: null,
  };
  const base = structuredClone(tns);
  base.id = "base";
  const query = itemsForLocalDate(
    { ...f.day, events: [f.segment, tns, base] },
    syntheticDate,
    "UTC",
  );
  const coreRows: CoreDayRow[] = [
    {
      rowKey: { itemId: base.id, projectionRole: "BASE_FROM", localDate: syntheticDate },
      itemRevision: 1,
      projectionVersion: 2,
      certificateGeneration: 1,
      family: "P3",
      title: base.title,
      status: "planned",
      position: "BASE",
      itemRef: base.id,
      capabilities: closedItemCapabilities,
    },
  ];
  const stream = composeDayStream({ ...query, coreRows }, `${syntheticDate}T23:00:00Z`, {
    focus: tns.id,
    scope: { accountId: f.day.accountId, tripId: f.day.tripId },
    flexible: [
      {
        version: "g2-flexible/1",
        synthetic: true,
        id: "block",
        title: "Synthetic block",
        accountId: f.day.accountId,
        tripId: f.day.tripId,
        localDate: syntheticDate,
        itemIds: [],
        choices: [],
        softWindow: { startMinute: 480, endMinute: 540 },
      },
    ],
  });
  expect(stream.rows.map((row) => row.item.event.id)).toEqual([
    f.segment.id,
    ...query.nonComparable.map((item) => item.event.id),
  ]);
  expect(
    stream.entries.map((entry) =>
      entry.kind === "ITEM" ? entry.row.item.event.id : entry.block.id,
    ),
  ).toEqual([tns.id, "block", f.segment.id, base.id]);
  expect(stream.focus).toBe(tns.id);
  expect(stream.now).toEqual(composeDayStream(query, `${syntheticDate}T23:00:00Z`).now);
  expect(stream.nowAfter).toBe(false);
});
it("rejects duplicate Event insertion rather than rendering ambiguous keys", () => {
  const { query } = setup();
  expect(() =>
    composeDayStream({ ...query, timed: [...query.timed, query.timed[0]] }, now),
  ).toThrow("DAY_STREAM_DUPLICATE_ITEM");
});
it("Flexible affiliation is explicit, unique, independent of Choice scope and reversible", () => {
  const { f, query } = setup();
  const block = {
    id: "synthetic-block",
    itemIds: [f.before.id, f.after.id],
    choices: [
      { id: "mine", scope: "MY" as const },
      { id: "group", scope: "GROUP" as const },
    ],
  };
  const my = composeDayStream(query, now, { flexible: [block], choiceScope: "MY" });
  const group = composeDayStream(query, now, { flexible: [block], choiceScope: "GROUP" });
  expect(group.rows).toEqual(my.rows);
  expect(my.containers[0].choices.map((c) => c.id)).toEqual(["mine"]);
  expect(group.containers[0].choices.map((c) => c.id)).toEqual(["group"]);
  expect(my.rows.find((r) => r.item.event.id === f.segment.id)!.containerId).toBeNull();
  expect(my.containers[0].rowKeys).toHaveLength(2);
  expect(my.entries.map((entry) => entry.kind)).toEqual(my.rows.map(() => "ITEM"));
  expect(
    my.entries.filter((entry) => entry.kind === "ITEM").map((entry) => entry.row.key),
  ).toEqual(my.rows.map((row) => row.key));
  expect(composeDayStream(query, now).rows.map((r) => r.key)).toEqual(
    my.rows.map((r) => r.key),
  );
  const conflicted = composeDayStream(query, now, {
    flexible: [block, { ...block, id: "other" }],
  });
  expect(conflicted.rows.every((r) => r.containerId === null)).toBe(true);
  expect(
    composeDayStream(query, now, { flexible: [block], immersive: f.before.id }).immersive,
  ).toBe(f.before.id);
});
it("qualified straight-line-only Transition survives NOW collision without mode or route facts", () => {
  const { query, transition, scope } = setup();
  const enriched = {
    ...transition,
    route: {
      status: "AVAILABLE" as const,
      observation: { provider: "APPLE", seconds: 42, meters: 1500 },
    },
  };
  const stream = composeDayStream(query, now, { transitions: [enriched], scope });
  const row = stream.rows[1];
  expect(row.nowBefore).toBe(true);
  expect(row.transition).toMatchObject({
    mode: null,
    geometricDistance: { meters: 1200 },
    suppressConnector: true,
    visibility: "STRAIGHT_LINE",
    routeStatus: "AVAILABLE",
    openTtr: transition.actions.openTtr,
  });
  expect(row.transition).not.toHaveProperty("route");
  expect(row.transition).not.toHaveProperty("externalMaps");
  const withBlock = composeDayStream(query, now, {
    transitions: [enriched],
    scope,
    flexible: [
      {
        version: "g2-flexible/1",
        synthetic: true,
        id: "choice-only",
        title: "",
        accountId: scope.accountId,
        tripId: scope.tripId,
        localDate: syntheticDate,
        itemIds: [],
        choices: [{ id: "idea", name: "Idea", scope: "MY" }],
        softWindow: { startMinute: 540, endMinute: 600 },
      },
    ],
  });
  expect(withBlock.rows[1].transition).toEqual(row.transition);
  expect(withBlock.entries.filter((entry) => entry.kind === "BLOCK")).toHaveLength(1);
});
it("carries each accepted route status without route metrics or invented ETA", () => {
  const { query, transition, scope } = setup();
  for (const status of ["MISSING", "PENDING", "AVAILABLE", "FAILED"] as const) {
    const row = composeDayStream(query, now, {
      scope,
      transitions: [{ ...transition, route: { status } }],
    }).rows[1];
    expect(row.transition).toMatchObject({
      visibility: "STRAIGHT_LINE",
      routeStatus: status,
      geometricDistance: { meters: 1200 },
      suppressConnector: true,
    });
    expect(row.transition).not.toHaveProperty("route");
  }
});
it("withholds Transition placement when a versioned Flexible block nests either anchor", () => {
  const { f, query, transition, scope } = setup();
  for (const itemId of [f.before.id, f.segment.id]) {
    const stream = composeDayStream(query, now, {
      scope,
      transitions: [transition],
      flexible: [
        {
          version: "g2-flexible/1",
          synthetic: true,
          id: "nested",
          title: "Synthetic block",
          accountId: scope.accountId,
          tripId: scope.tripId,
          localDate: syntheticDate,
          itemIds: [itemId],
          choices: [],
        },
      ],
    });
    expect(stream.rows[1].transition).toBeNull();
    expect(stream.rows.filter((row) => row.containerId === "nested")).toHaveLength(1);
  }
});
it("confirmed mode persists without ETA and relation identity excludes display date and revision", () => {
  const { f, query, transition, scope } = setup();
  const selected = {
    ...transition,
    visibility: "SELECTED_MODE" as const,
    modeOrigin: "USER_CONFIRMED" as const,
    mode: "walking" as const,
  };
  const first = composeDayStream(query, now, { transitions: [selected], scope }).rows[1]
    .transition!;
  expect(first.mode).toBe("walking");
  expect(first).not.toHaveProperty("eta");
  const day = structuredClone(f.day);
  const nextDate = "2027-02-04";
  for (const e of day.events) {
    e.title += " enriched";
    e.semantic_revision++;
    for (const b of e.boundaries) {
      if (b.local_date) b.local_date = nextDate;
      if (b.instant) b.instant = b.instant.replace(syntheticDate, nextDate);
      if (b.source_instant)
        b.source_instant = b.source_instant.replace(syntheticDate, nextDate);
    }
  }
  const moved = {
    ...selected,
    anchors: {
      fromRowKey: dayRowKey(f.before.id, "EVENT", nextDate),
      toRowKey: dayRowKey(f.segment.id, "EVENT", nextDate),
    },
  };
  const next = composeDayStream(
    itemsForLocalDate(day as DayProjection, nextDate, "UTC"),
    now,
    { transitions: [moved], scope },
  );
  expect(next.rows[1].transition!.key).toBe(first.key);
  expect(next.rows[1].key).not.toBe(composeDayStream(query, now).rows[1].key);
});
it("Past, unknown clock, unqualified, stale anchors/action, scope mismatch and duplicate projections fail closed", () => {
  const { query, transition, scope } = setup();
  for (const bad of [
    { ...transition, qualification: "UNQUALIFIED" as const },
    { ...transition, unavailableReason: "UNKNOWN_CONTINUITY" },
    { ...transition, anchors: null },
    { ...transition, actions: { openTtr: null } },
    { ...transition, publicationVersion: 2 },
    {
      ...transition,
      geometricDistance: { ...transition.geometricDistance!, meters: NaN },
    },
    { ...transition, visibility: "HIDDEN" as const },
    { ...transition, route: { status: "INVALID" as "MISSING" } },
    { ...transition, identity: { ...transition.identity!, occurrenceDiscriminator: "" } },
  ])
    expect(
      composeDayStream(query, now, { transitions: [bad], scope }).rows.every(
        (r) => !r.transition,
      ),
    ).toBe(true);
  for (const instant of ["2027-02-10T11:00:00Z", "invalid"])
    expect(
      composeDayStream(query, instant, { transitions: [transition], scope }).rows.every(
        (r) => !r.transition,
      ),
    ).toBe(true);
  for (const context of [undefined, { ...scope, accountId: "other" }])
    expect(
      composeDayStream(query, now, {
        transitions: [transition],
        scope: context,
      }).rows.every((r) => !r.transition),
    ).toBe(true);
  expect(
    composeDayStream(query, now, {
      transitions: [transition, transition],
      scope,
    }).rows.every((r) => !r.transition),
  ).toBe(true);
});
it("W0 role-bearing presentation keys retain role/date and never claim edit-stable occurrence tokens", () => {
  expect(dayRowKey("same-item", "ORIGIN", syntheticDate)).not.toBe(
    dayRowKey("same-item", "DESTINATION", syntheticDate),
  );
  expect(dayRowKey("same-item", "START", syntheticDate)).not.toBe(
    dayRowKey("same-item", "START", "2027-02-04"),
  );
});

it("G2-F01/F02/F03 composes empty and Choice-only Blocks independently with one global Focus", () => {
  const fixture = flexibleContribution();
  const query = itemsForLocalDate(fixture.projection, fixture.selectedDate, fixture.zone);
  const ports = fixture.ports!;
  const base = composeDayStream(query, fixture.instant, ports);
  expect(base.entries.filter((entry) => entry.kind === "BLOCK")).toHaveLength(3);
  expect(base.containers.find((block) => block.id === "flex-empty")).toMatchObject({
    rowKeys: [],
    choices: [],
  });
  expect(
    base.containers
      .find((block) => block.id === "flex-choices")
      ?.choices.map((c) => c.id),
  ).toEqual(["cafe"]);
  expect(
    base.containers.find((block) => block.id === "flex-nested")?.rowKeys,
  ).toHaveLength(1);
  expect(base.rows.find((row) => row.item.event.id === "flex-tns")).toMatchObject({
    position: "TNS",
    containerId: null,
  });
  expect(
    base.rows.find((row) => row.item.event.id === "flex-outer")?.containerId,
  ).toBeNull();
  expect(
    base.entries
      .filter((entry) => entry.kind === "ITEM")
      .map((entry) => entry.row.item.event.id),
  ).toEqual(["flex-tns", "flex-outer"]);
  const key = choiceFocusKey("flex-nested", "MY", "garden");
  const choice = composeDayStream(query, fixture.instant, { ...ports, focus: key });
  expect(choice.focus).toBe(key);
  expect(
    choice.containers.find((block) => block.id === "flex-nested")?.focusedChoiceKey,
  ).toBe(key);
  expect(choice.rows.some((row) => row.focused)).toBe(false);
  expect(
    composeDayStream(query, fixture.instant, {
      ...ports,
      focus: "flex-item",
    }).rows.filter((row) => row.focused),
  ).toHaveLength(1);
  const blockImmersive = composeDayStream(query, fixture.instant, {
    ...ports,
    immersive: "flex-empty",
  });
  expect(blockImmersive.immersive).toBe("flex-empty");
  expect(blockImmersive.focus).toBeNull();
  expect(base.now).toEqual(composeDayStream(query, fixture.instant).now);
  const outsideSoftWindow = composeDayStream(query, fixture.instant, {
    ...ports,
    flexible: ports.flexible!.map((block) =>
      block.id === "flex-nested" && "version" in block
        ? { ...block, softWindow: { startMinute: 900, endMinute: 960 } }
        : block,
    ),
  });
  expect(
    outsideSoftWindow.rows.find((row) => row.item.event.id === "flex-item")?.containerId,
  ).toBe("flex-nested");
});

it("G2 affiliation fails to outer rows for conflicts, TNS, removed Blocks and wrong scope", () => {
  const fixture = flexibleContribution();
  const query = itemsForLocalDate(fixture.projection, fixture.selectedDate, fixture.zone);
  const ports = fixture.ports!;
  const nested = ports.flexible!.find((b) => b.id === "flex-nested")!;
  const conflicted = composeDayStream(query, fixture.instant, {
    ...ports,
    flexible: [...ports.flexible!, { ...nested, id: "other" }],
  });
  expect(
    conflicted.rows.find((row) => row.item.event.id === "flex-item")?.containerId,
  ).toBeNull();
  expect(conflicted.entries.filter((entry) => entry.kind === "ITEM")).toHaveLength(3);
  for (const flexible of [[], [{ ...nested, tripId: "other" }]]) {
    const stream = composeDayStream(query, fixture.instant, { ...ports, flexible });
    expect(stream.rows.every((row) => row.containerId === null)).toBe(true);
    expect(stream.entries.filter((entry) => entry.kind === "ITEM")).toHaveLength(3);
  }
  const group = composeDayStream(query, fixture.instant, {
    ...ports,
    flexible: ports.flexible!.map((b) =>
      b.id === "flex-nested" ? { ...b, choiceScope: "GROUP" as const } : b,
    ),
    focus: choiceFocusKey("flex-nested", "MY", "garden"),
  });
  expect(group.focus).toBeNull();
  expect(
    group.containers.find((b) => b.id === "flex-nested")?.choices.map((c) => c.id),
  ).toEqual(["cafe"]);
});
