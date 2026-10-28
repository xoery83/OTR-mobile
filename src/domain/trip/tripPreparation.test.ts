import { expect, it } from "vitest";
import { selectTripPreparation, type PreparationEntry } from "./tripPreparation";
import { applyCoreCommand, emptyCoreGraph } from "./tripCoreV2Mutation";
import { coreDefaults } from "./tripCoreV2";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { projectCoreItem } from "./tripCoreV2Views";
const tripId = "a0000000-0000-4000-8000-000000000001";
const accountId = "a0000000-0000-4000-8000-000000000002";
const actor = {
  tripId,
  accountId,
  active: true,
  canManageShared: false,
  personId: null,
  personIds: [],
};
function entries(): PreparationEntry[] {
  let graph = emptyCoreGraph();
  for (let index = 0; index < 5; index++) {
    const id = `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
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
          family: index % 2 ? "P6" : "P1",
          core: { title: `Real ${index}` },
          schedule: {
            start: coreDateBoundary(`2027-01-${String(10 - index).padStart(2, "0")}`),
          },
          ...coreDefaults("member"),
        },
      },
      actor,
      `2026-10-1${index}T00:00:00Z`,
    ).graph;
  }
  return graph.itinerary_events.map((row) => ({
    item: projectCoreItem(graph, actor, String(row.id))!,
    createdAt: String(row.created_at),
  }));
}
it("orders three persisted creation times, never travel dates, and counts whole authorized formal Items", () => {
  const input = entries(),
    projection = selectTripPreparation([...input, input[0]]);
  expect(projection.itemCount).toBe(5);
  expect(projection.counts).toEqual([
    { family: "P1", count: 3 },
    { family: "P6", count: 2 },
  ]);
  expect(projection.recent.map((entry) => entry.item.title)).toEqual([
    "Real 4",
    "Real 3",
    "Real 2",
  ]);
  expect(selectTripPreparation([...input].reverse())).toEqual(projection);
});
it("does not admit pending/cancelled/skipped/hidden content or fabricate missing timestamps", () => {
  const input = entries();
  input[0].item.localState = "PENDING";
  input[1].item.hidden = true;
  input[2].item.status = "cancelled";
  input[3].item.status = "skipped";
  input[4].createdAt = null;
  expect(selectTripPreparation(input)).toMatchObject({
    itemCount: 1,
    recent: [],
    counts: [{ family: "P1", count: 1 }],
  });
  input[4].createdAt = "not-a-time";
  expect(selectTripPreparation(input).recent).toEqual([]);
});
it("keeps microsecond order and offers no arbitrary recent list for untimed data", () => {
  const input = entries().slice(0, 2);
  input[0].createdAt = "2026-10-16T00:00:00.000001Z";
  input[1].createdAt = "2026-10-16T00:00:00.000002Z";
  expect(selectTripPreparation(input).recent[0].item.itemId).toBe(input[1].item.itemId);
  input.forEach((entry) => (entry.createdAt = null));
  expect(selectTripPreparation(input).recent).toEqual([]);
  expect(selectTripPreparation([])).toEqual({ itemCount: 0, counts: [], recent: [] });
});

it("counts only explicit owning pending Item IDs without changing their local state", () => {
  const input = entries();
  input.forEach(({ item }) => {
    item.localState = "PENDING";
  });
  expect(selectTripPreparation(input).itemCount).toBe(0);
  const ids = new Set(input.slice(0, 2).map(({ item }) => item.itemId));
  const result = selectTripPreparation(input, ids);
  expect(result.itemCount).toBe(2);
  expect(result.recent.every(({ item }) => item.localState === "PENDING")).toBe(true);
  expect(input.every(({ item }) => item.localState === "PENDING")).toBe(true);
  input[0].item.hidden = true;
  input[1].item.status = "cancelled";
  expect(selectTripPreparation(input, ids).itemCount).toBe(0);
});

it("does not resurrect an accepted duplicate after a verified pending hide or cancellation", () => {
  const accepted = entries()[0];
  const pending = {
    ...accepted,
    item: { ...accepted.item, localState: "PENDING" as const, hidden: true },
  };
  const ids = new Set([pending.item.itemId]);
  expect(selectTripPreparation([accepted, pending], ids).itemCount).toBe(0);
  expect(selectTripPreparation([accepted, pending]).itemCount).toBe(1);
  pending.item.hidden = false;
  pending.item.status = "cancelled";
  expect(selectTripPreparation([accepted, pending], ids).itemCount).toBe(0);
  expect(
    selectTripPreparation([accepted, pending], new Set(["unknown-item"])).itemCount,
  ).toBe(1);
});
