import { expect, it } from "vitest";
import {
  flexibleReactiveContribution,
  flexibleFixtureUpdate,
  flexibleFixtureActions,
} from "../day-feed-lab/flexibleReactiveContribution";
import { composeDayStream, choiceFocusKey } from "./composition";
import { replaceFlexibleSnapshot, type FlexibleSnapshot } from "./flexibleSnapshot";

function setup() {
  const fixture = flexibleReactiveContribution();
  const snapshot = fixture.flexiblePublication.snapshot;
  const compose = (value: FlexibleSnapshot, extra = {}) =>
    composeDayStream(fixture.query(fixture.selectedDate, fixture.zone), fixture.instant, {
      ...fixture.ports,
      flexible: value.blocks,
      ...extra,
    });
  return { fixture, snapshot, compose };
}

it("accepts immutable complete replacements in monotonic order without mutating publisher values", () => {
  const { snapshot } = setup();
  const bytes = JSON.stringify(snapshot);
  const first = replaceFlexibleSnapshot(null, snapshot, snapshot.scope)!;
  const copied = flexibleFixtureUpdate(snapshot, "COPY");
  const second = replaceFlexibleSnapshot(first, copied, snapshot.scope)!;
  const third = replaceFlexibleSnapshot(
    second,
    flexibleFixtureUpdate(copied, "RESIZE"),
    snapshot.scope,
  )!;
  expect(third.revision).toBe(2);
  expect(replaceFlexibleSnapshot(third, copied, snapshot.scope)).toBe(third);
  expect(replaceFlexibleSnapshot(third, third, snapshot.scope)).toBe(third);
  expect(Object.isFrozen(second.blocks[0].choices[0])).toBe(true);
  expect(JSON.stringify(snapshot)).toBe(bytes);
  (copied.blocks[0].choices[0] as { id: string }).id = "tamper";
  expect(second.blocks[0].choices[0].id).toBe("garden");
});

it("rejects malformed snapshots, wrong scope and stale revisions without discarding current state", () => {
  const { snapshot } = setup();
  const current = replaceFlexibleSnapshot(null, snapshot, snapshot.scope)!;
  const next = { ...snapshot, revision: 1 };
  for (const invalid of [
    null,
    { ...next, version: "future" },
    { ...next, revision: -1 },
    { ...next, revision: 1.5 },
    ...["accountId", "tripId", "localDate", "generation"].map((key) => ({
      ...next,
      scope: { ...snapshot.scope, [key]: key === "generation" ? 2 : "wrong" },
    })),
    { ...next, blocks: null },
    { ...next, blocks: [null] },
    { ...next, blocks: [snapshot.blocks[0], snapshot.blocks[0]] },
    { ...next, blocks: [{ ...snapshot.blocks[0], choices: [{}] }] },
    {
      ...next,
      blocks: [
        { ...snapshot.blocks[0], softWindow: { startMinute: 900, endMinute: 800 } },
      ],
    },
    { ...next, blocks: [{ ...snapshot.blocks[0], accountId: "wrong" }] },
  ])
    expect(
      replaceFlexibleSnapshot(current, invalid as FlexibleSnapshot, snapshot.scope),
    ).toBe(current);
});

it.each(flexibleFixtureActions)(
  "%s replaces authorized presentation while preserving canonical membership and keys",
  (action) => {
    const { snapshot, compose } = setup();
    const before = compose(snapshot);
    const after = compose(flexibleFixtureUpdate(snapshot, action));
    expect(after.rows.map((row) => row.key)).toEqual(before.rows.map((row) => row.key));
    expect(new Set(after.rows.map((row) => row.item.event.id)).size).toBe(
      after.rows.length,
    );
    expect(
      after.rows.find((row) => row.item.event.id === "reactive-tns")!.containerId,
    ).toBeNull();
    expect(after.now).toEqual(before.now);
    if (action === "DELETE") {
      expect(after.containers).toEqual([]);
      expect(after.entries.filter((entry) => entry.kind === "ITEM")).toHaveLength(
        before.rows.length,
      );
    } else if (action === "INVALID_AFFILIATION") {
      expect(
        after.rows.find((row) => row.item.event.id === "reactive-item")!.containerId,
      ).toBeNull();
    } else expect(after.containers[0].key).toBe(before.containers[0].key);
    if (action === "NEST_ANCHOR")
      expect(after.rows.every((row) => !row.transition)).toBe(true);
    else
      expect(after.rows.find((row) => row.transition)!.transition).toEqual(
        before.rows.find((row) => row.transition)!.transition,
      );
  },
);

it("suspends Feed Focus in Block Immersive and only restores still-visible authorized targets", () => {
  const { snapshot, compose, fixture } = setup();
  const key = choiceFocusKey("reactive-block", "MY", "garden");
  const suspended = compose(snapshot, { focus: key, immersive: "reactive-block" });
  expect(suspended.focus).toBeNull();
  expect(suspended.suspendedFocus).toBe(key);
  expect(suspended.containers[0].focusedChoiceKey).toBeNull();
  expect(compose(snapshot, { focus: key }).focus).toBe(key);
  const removed = flexibleFixtureUpdate(snapshot, "REMOVE");
  expect(
    compose(removed, { focus: key, immersive: "reactive-block" }).suspendedFocus,
  ).toBeNull();
  expect(compose(removed, { focus: key }).focus).toBeNull();
  expect(compose(removed).containers[0].choiceScope).toBe("GROUP");
  expect(
    composeDayStream(fixture.query(fixture.selectedDate, fixture.zone), fixture.instant, {
      choiceScope: "MY",
      flexible: [
        { id: "legacy-block", itemIds: [], choices: [{ id: "group", scope: "GROUP" }] },
      ],
    }).containers[0].choices,
  ).toEqual([]);
  const query = fixture.query(fixture.selectedDate, fixture.zone);
  expect(
    composeDayStream(
      { ...query, timed: query.timed.filter((row) => row.event.id !== "reactive-item") },
      fixture.instant,
      {
        ...fixture.ports,
        flexible: snapshot.blocks,
        focus: "reactive-item",
        immersive: "reactive-block",
      },
    ).suspendedFocus,
  ).toBeNull();
});
