import { expect, it } from "vitest";
import { itemsForLocalDate, type DayProjection } from "@/domain/trip/dayReadModel";
import { composeDayStream, dayRowKey, type TransitionProjection } from "./composition";
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
      status: "AVAILABLE",
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
    openTtr: transition.actions.openTtr,
  });
  expect(row.transition).not.toHaveProperty("route");
  expect(row.transition).not.toHaveProperty("externalMaps");
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
