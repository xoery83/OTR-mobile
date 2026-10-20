import { describe, expect, it } from "vitest";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { composeDayStream, choiceFocusKey } from "@/features/day-feed/composition";
import {
  replaceFlexibleSnapshot,
  type FlexibleSnapshot,
  type FlexibleSnapshotScope,
} from "@/features/day-feed/flexibleSnapshot";
import { scenario, place } from "@/features/day-feed-lab/fixtureFacts";
import { fixtureSnapshot, createSnapshotProducer } from "./snapshot";
import type { FixtureId } from "./fixtures";
const scope: FlexibleSnapshotScope = {
  accountId: "a",
  tripId: "t",
  localDate: "2026-10-12",
  generation: 1,
};
function setup(id: FixtureId = "f04") {
  let host = fixtureSnapshot(id, scope);
  const original = host;
  const producer = createSnapshotProducer(id, host, "future");
  const publish = (candidate: FlexibleSnapshot) => {
    const next = replaceFlexibleSnapshot(host, candidate, scope);
    if (next === host || !next) return false;
    host = next;
    return true;
  };
  return { producer, original, publish, current: () => host };
}
it("supplies immutable both-scoped authorized choices, independent Items and detached scope", () => {
  const s = fixtureSnapshot("f04", scope);
  expect(s.blocks[0].choices.some((c) => c.scope === "MY")).toBe(true);
  expect(s.blocks[0].choices.some((c) => c.scope === "GROUP")).toBe(true);
  expect(s.blocks[0].itemIds).toEqual(["fixture-fixed"]);
  expect(Object.isFrozen(s.blocks[0].choices[0])).toBe(true);
  expect(Reflect.set(s.scope, "generation", 4)).toBe(false);
  expect(scope.generation).toBe(1);
});
it("rapid COPY/remove uses latest accepted revision even before a renderer receives new props", () => {
  const f = setup(),
    before = JSON.stringify(f.original);
  expect(
    f.producer.apply(f.original, scope, { type: "add", id: "museum" }, f.publish),
  ).toBe(true);
  expect(
    f.producer.apply(f.original, scope, { type: "remove", id: "museum" }, f.publish),
  ).toBe(true);
  expect(f.current().revision).toBe(2);
  expect(
    f
      .current()
      .blocks[0].choices.filter((c) => c.scope === "MY")
      .map((c) => c.id),
  ).toEqual(["garden", "cafe"]);
  expect(JSON.stringify(f.original)).toBe(before);
});
it("rejects stale host acceptance without reporting success or advancing feature state", () => {
  const f = setup();
  f.publish({ ...f.original, revision: 5 });
  expect(
    f.producer.apply(f.original, scope, { type: "add", id: "museum" }, f.publish),
  ).toBe(false);
  expect(f.producer.read(f.original)!.my).not.toContain("museum");
  expect(
    f.producer.apply(f.current(), scope, { type: "add", id: "museum" }, f.publish),
  ).toBe(true);
  expect(f.current().revision).toBe(6);
});
describe.each(["accountId", "tripId", "localDate", "generation"] as const)(
  "scope fence %s",
  (field) => {
    it("rejects a departed scope before invoking its callback", () => {
      const f = setup();
      let calls = 0;
      const other = {
        ...scope,
        [field]:
          field === "generation" ? 2 : field === "localDate" ? "2026-10-13" : "other",
      };
      expect(
        f.producer.apply(f.original, other, { type: "delete" }, () => {
          calls++;
          return true;
        }),
      ).toBe(false);
      expect(f.producer.read({ ...f.original, scope: other })).toBeNull();
      expect(calls).toBe(0);
    });
  },
);
it("same-scope departed callback returning false leaves COPY uncommitted", () => {
  const f = setup();
  expect(
    f.producer.apply(f.original, scope, { type: "add", id: "museum" }, () => false),
  ).toBe(false);
  expect(f.producer.read(f.original)!.my).toEqual(["garden", "cafe"]);
});
it("full replacement preserves independent adjacent Blocks, Group edits and affiliation while resizing", () => {
  const f = setup("f13");
  f.publish({
    ...f.original,
    revision: 1,
    blocks: f.original.blocks.map((b, i) =>
      i
        ? b
        : {
            ...b,
            choices: [
              ...b.choices,
              { id: "authorized-extra", name: "Authorized", scope: "GROUP" },
            ],
          },
    ),
  });
  expect(
    f.producer.apply(
      f.current(),
      scope,
      { type: "resize", edge: "start", minute: 720 },
      f.publish,
    ),
  ).toBe(true);
  expect(f.current().blocks).toHaveLength(2);
  const main = f.current().blocks.find((b) => b.id === "fixture-flexible-f13")!;
  expect(main.softWindow!.startMinute).toBe(720);
  expect(main.choices.some((c) => c.id === "authorized-extra")).toBe(true);
  expect(main.itemIds).toEqual(["fixture-fixed"]);
});
it("delete publishes an empty blocks array rather than null, and preserves Canonical query Items", () => {
  const f = setup();
  expect(f.producer.apply(f.original, scope, { type: "delete" }, f.publish)).toBe(true);
  expect(f.current()).toMatchObject({ revision: 1, blocks: [] });
  const trip = scenario("t", "synthetic", [
    place("fixture-fixed", "fixed", scope.localDate, "12:30", "14:00"),
  ]);
  const q = itemsForLocalDate(trip.projection, scope.localDate, "UTC");
  const stream = composeDayStream(q, "2026-10-11T12:00:00Z", {
    flexible: f.current().blocks,
    scope,
  });
  expect(stream.rows).toHaveLength(1);
  expect(stream.rows[0].containerId).toBeNull();
});
it("My removal falls back to Group; Choice scope never filters or duplicates nested Items", () => {
  const f = setup();
  for (const id of ["garden", "cafe"])
    expect(f.producer.apply(f.original, scope, { type: "remove", id }, f.publish)).toBe(
      true,
    );
  const trip = scenario("t", "synthetic", [
    place("fixture-fixed", "fixed", scope.localDate, "12:30", "14:00"),
  ]);
  const q = itemsForLocalDate(trip.projection, scope.localDate, "UTC");
  const stream = composeDayStream(q, "2026-10-11T12:00:00Z", {
    flexible: f.current().blocks,
    scope,
  });
  expect(stream.containers[0].choiceScope).toBe("GROUP");
  expect(stream.containers[0].choices.every((c) => c.scope === "GROUP")).toBe(true);
  expect(stream.rows).toHaveLength(1);
  expect(stream.entries).toHaveLength(1);
});
it("G2 suspends and restores valid Focus; removed Choice never restores", () => {
  const f = setup();
  const key = choiceFocusKey("fixture-flexible-f04", "MY", "garden");
  const trip = scenario("t", "synthetic", []),
    q = itemsForLocalDate(trip.projection, scope.localDate, "UTC");
  const ports = { flexible: f.original.blocks, scope, focus: key };
  expect(
    composeDayStream(q, "2026-10-11T12:00:00Z", {
      ...ports,
      immersive: "fixture-flexible-f04",
    }),
  ).toMatchObject({ focus: null, suspendedFocus: key });
  expect(composeDayStream(q, "2026-10-11T12:00:00Z", ports).focus).toBe(key);
  f.producer.apply(f.original, scope, { type: "remove", id: "garden" }, f.publish);
  expect(
    composeDayStream(q, "2026-10-11T12:00:00Z", {
      ...ports,
      flexible: f.current().blocks,
    }).focus,
  ).toBeNull();
});
it("rejects unauthorized Past edits, read-only Block resize and unknown resources", () => {
  const f = setup("f14");
  expect(
    f.producer.apply(
      f.original,
      scope,
      { type: "resize", edge: "start", minute: 720 },
      f.publish,
    ),
  ).toBe(false);
  expect(
    f.producer.apply(
      f.original,
      scope,
      { type: "add", id: "private-unknown" },
      f.publish,
    ),
  ).toBe(false);
  expect(
    createSnapshotProducer("f04", f.original, "past").apply(
      f.original,
      scope,
      { type: "delete" },
      f.publish,
    ),
  ).toBe(false);
});
it("COPY and soft resize preserve existing TTR identity, input and action", async () => {
  const { getTtrLabFixtures } = await import("@/features/ttr/labFixtures");
  const ttr = getTtrLabFixtures()[0];
  const activeScope = {
    accountId: ttr.projection.accountId,
    tripId: ttr.id,
    localDate: ttr.selectedDate,
    generation: 0,
  };
  let snapshot = fixtureSnapshot("f03", activeScope);
  const producer = createSnapshotProducer("f03", snapshot, "future");
  const query = itemsForLocalDate(ttr.projection, ttr.selectedDate, ttr.zone);
  const before = composeDayStream(query, ttr.instant, {
    ...ttr.ports,
    flexible: snapshot.blocks,
  }).rows.map((r) => r.transition);
  const publish = (next: FlexibleSnapshot) => {
    snapshot = next;
    return true;
  };
  producer.apply(snapshot, activeScope, { type: "add", id: "museum" }, publish);
  producer.apply(
    snapshot,
    activeScope,
    { type: "resize", edge: "start", minute: 720 },
    publish,
  );
  expect(
    composeDayStream(query, ttr.instant, {
      ...ttr.ports,
      flexible: snapshot.blocks,
    }).rows.map((r) => r.transition),
  ).toEqual(before);
  expect(before.some(Boolean)).toBe(true);
});
it("Undo restores only the removed Choice relationship while keeping its favorite", () => {
  const f = setup();
  f.producer.apply(f.original, scope, { type: "remove", id: "garden" }, f.publish);
  f.producer.apply(f.original, scope, { type: "undo" }, f.publish);
  expect(f.producer.read(f.current())!.my).toContain("garden");
  expect(f.producer.read(f.current())!.saved).toContain("garden");
  expect(f.current().revision).toBe(2);
});
