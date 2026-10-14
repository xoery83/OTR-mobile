import { expect, it } from "vitest";
import { applyCoreCommand, emptyCoreGraph } from "./tripCoreV2Mutation";
import { coreDefaults, corePlaceSchema } from "./tripCoreV2";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { projectCoreItem } from "./tripCoreV2Views";
import { selectJourneySnapshot, journeySnapshotDayCandidates } from "./journeySnapshot";
const tripId = "a0000000-0000-4000-8000-000000000001",
  accountId = "a0000000-0000-4000-8000-000000000002";
const actor = {
  tripId,
  accountId,
  active: true,
  canManageShared: false,
  personId: null,
  personIds: [],
};
const root = {
  id: tripId,
  name: "Contract Trip",
  startDate: "2027-01-01",
  endDate: "2027-01-12",
};
function fixture(count: number) {
  let graph = emptyCoreGraph();
  for (let index = 0; index < count; index++) {
    const family = (["P1", "P3", "P4", "P6"] as const)[index % 4];
    const id = `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const date = `2027-01-${String((index % 12) + 1).padStart(2, "0")}`;
    graph = applyCoreCommand(
      graph,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          family,
          core: { title: `Contract ${family} ${index + 1}` },
          schedule: {
            start: coreDateBoundary(date),
            ...(family === "P3" || family === "P4"
              ? { end: coreDateBoundary("2027-01-20") }
              : {}),
          },
          ...coreDefaults("member"),
        },
      },
      actor,
      "2027-01-01T00:00:00Z",
    ).graph;
  }
  return graph.itinerary_events.map((row) =>
    projectCoreItem(graph, actor, String(row.id))!,
  );
}
it("counts the whole permitted canonical dataset before a stable balanced twenty-tag selection", () => {
  const items = fixture(48),
    before = JSON.stringify(items);
  const first = selectJourneySnapshot(root, items),
    again = selectJourneySnapshot(root, [...items].reverse());
  expect(first).toEqual(again);
  expect(first.tags).toHaveLength(20);
  expect(first.itemCount).toBe(48);
  expect(first.activities).toBe(24);
  expect(first.days).toBe(12);
  expect(new Set(first.tags.map((tag) => tag.family)).size).toBe(4);
  expect(new Set(first.tags.map((tag) => tag.date)).size).toBeGreaterThan(4);
  expect(new Set(first.tags.map((tag) => tag.itemId)).size).toBe(20);
  expect(JSON.stringify(items)).toBe(before);
});
it("counts one multi-night Stay and one Rental without repeating role or night appearances", () => {
  const items = fixture(4).filter((item) => ["P3", "P4"].includes(item.family));
  const snapshot = selectJourneySnapshot(root, items);
  expect(snapshot.itemCount).toBe(2);
  expect(snapshot.tags).toHaveLength(2);
  expect(snapshot.activities).toBe(0);
});
it("uses only real sparse Items and truthful root facts for empty input", () => {
  for (const count of [0, 1, 2, 3])
    expect(selectJourneySnapshot(root, fixture(count)).tags).toHaveLength(count);
  expect(selectJourneySnapshot(root, [])).toMatchObject({
    days: 12,
    places: null,
    activities: 0,
    itemCount: 0,
    tags: [],
  });
});
it("omits unknown or invalid day spans and incomplete reliable place counts", () => {
  const item = fixture(1)[0];
  expect(selectJourneySnapshot({ ...root, endDate: null }, [item]).days).toBeNull();
  expect(
    selectJourneySnapshot({ ...root, endDate: "2026-12-31" }, [item]).days,
  ).toBeNull();
  expect(
    selectJourneySnapshot({ ...root, startDate: "2027-02-30" }, [item]).days,
  ).toBeNull();
  expect(selectJourneySnapshot(root, [item]).places).toBeNull();
  const qualified = {
    ...item,
    place: {
      qualification: "QUALIFIED",
      placeId: "a0000000-0000-4000-8000-000000000099",
      latitude: 1,
      longitude: 2,
    },
  } as typeof item;
  expect(selectJourneySnapshot(root, [qualified]).places).toBe(1);
  expect(
    selectJourneySnapshot(root, [qualified, { ...qualified, itemId: "another" }]).places,
  ).toBe(1);
  expect(
    selectJourneySnapshot(root, [qualified, { ...item, itemId: "unknown" }]).places,
  ).toBeNull();
});

it("uncapped Day candidates retain Rental return and independent P5 endpoint dates from full canonical Items", () => {
  const items = fixture(48);
  const place = Object.fromEntries(
    Object.keys(corePlaceSchema.shape).map((key) => [key, null]),
  );
  const id = "b0000000-0000-4000-8000-000000000999";
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: "c0000000-0000-4000-8000-000000000999",
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P5",
        core: { title: "Contract independent segment" },
        endpoints: {
          origin: { time: coreDateBoundary("2026-12-31"), place },
          destination: { time: coreDateBoundary("2027-01-02"), place },
        },
        service: {
          service_key: "RAIL",
          transport_subtype: "TRAIN",
          attribution: "UNSPECIFIED",
          operator_namespace: "NAME",
          operator_issuer: "Test authority",
          operator_value: "Test rail",
          operator_literal: "Test rail",
          service_literal: "Test service",
          service_number: "T1",
          codeshare_operating_key: null,
        },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2027-01-01T00:00:00Z",
  ).graph;
  items.push(projectCoreItem(graph, actor, id)!);
  const candidates = journeySnapshotDayCandidates(root, items);
  expect(candidates[0]).toBe("2026-12-31");
  expect(candidates).toContain("2027-01-20");
  expect(candidates).toContain("2027-01-04");
  expect(candidates).toEqual(journeySnapshotDayCandidates(root, [...items].reverse()));
});
