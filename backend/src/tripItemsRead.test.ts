import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import { buildCoreActorCollection } from "./tripCoreV2Collection";
import {
  buildTripItemSnapshot,
  buildTripItemPage,
  tripItemListQuerySchema,
  tripItemsBoundary,
} from "./tripItemsRead";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const now = "2026-11-16T00:00:00Z";
const actor: CoreActor = {
  accountId: randomUUID(),
  tripId: randomUUID(),
  personId: randomUUID(),
  personIds: [],
  active: true,
  canManageShared: false,
};
actor.personIds = [actor.personId!];
function create(graph: CoreGraph, title: string, by = actor) {
  const id = randomUUID();
  return {
    id,
    graph: applyCoreCommand(
      graph,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId: actor.tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          family: "P1",
          core: { title, description: "Visible description" },
          schedule: { start: coreDateBoundary("2026-12-01") },
          ...coreDefaults("member"),
        },
      },
      by,
      now,
    ).graph,
  };
}
const collection = (graph: CoreGraph, accessRevision = 1) =>
  buildCoreActorCollection(
    graph,
    actor,
    {
      epoch: "10000000-0000-4000-8000-000000000001",
      revision: 1,
      accessRevision,
      generatedAt: now,
    },
    [
      {
        person_id: actor.personId!,
        account_id: actor.accountId,
        active: true,
        participating: true,
        revision: 1,
      },
    ],
    hash,
  );
it("returns all eleven child coverages and preserves redaction without claiming missing Expense authority is empty", async () => {
  const { id, graph } = create(emptyCoreGraph(), "Plan");
  const state = graph.itinerary_events[0].field_state as Record<
    string,
    Record<string, unknown>
  >;
  state["itinerary_events.description"] = {
    ...state["itinerary_events.description"],
    origin: "SOURCE",
    protected: false,
    evidence_ref: "secret/source-evidence",
  };
  const c = await collection(graph),
    result = buildTripItemSnapshot(graph, actor, c, id, {}, false);
  expect(result.item.description).toBe("Visible description");
  expect(result.record.revision).toBe(result.item.itemRevision);
  expect(Object.keys(result.coverage.children)).toHaveLength(11);
  expect(result.coverage.root).toBe("REDACTED_OR_PARTIAL");
  expect(result.coverage.relations.expenseLinks).toBe("UNAVAILABLE");
  expect(result.coverage.fieldAvailability).toContainEqual({
    path: "/record/body/field_state/itinerary_events.description/evidence_ref",
    state: "REDACTED",
  });
  expect(JSON.stringify(result)).not.toContain("secret/source-evidence");
});
it("searches full-folded authorized text and binds pagination to filters and access revision", async () => {
  const first = create(emptyCoreGraph(), "Straße"),
    second = create(first.graph, "Straße Museum"),
    c = await collection(second.graph);
  const q = tripItemListQuerySchema.parse({ family: "P1", query: "STRASSE", limit: "1" });
  const page = await buildTripItemPage(second.graph, actor, c, new Set(), q, hash);
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).toBeTruthy();
  const next = await buildTripItemPage(
    second.graph,
    actor,
    c,
    new Set(),
    { ...q, cursor: page.nextCursor! },
    hash,
  );
  expect(next.items).toHaveLength(1);
  expect(next.items[0].itemId).not.toBe(page.items[0].itemId);
  await expect(
    buildTripItemPage(
      second.graph,
      actor,
      c,
      new Set(),
      { ...q, includeHidden: true, cursor: page.nextCursor! },
      hash,
    ),
  ).rejects.toThrow("STALE_CURSOR");
  await expect(
    buildTripItemPage(
      second.graph,
      actor,
      await collection(second.graph, 2),
      new Set(),
      { ...q, cursor: page.nextCursor! },
      hash,
    ),
  ).rejects.toThrow("STALE_CURSOR");
});
it("does not reveal private other-account text or deleted objects to a non-manager", async () => {
  const own = create(emptyCoreGraph(), "Own");
  const otherActor = { ...actor, accountId: randomUUID() };
  const other = create(own.graph, "Secret same Trip", otherActor);
  const c = await collection(other.graph);
  const page = await buildTripItemPage(
    other.graph,
    actor,
    c,
    new Set(),
    tripItemListQuerySchema.parse({ family: "P1", query: "Secret" }),
    hash,
  );
  expect(page.items).toEqual([]);
  expect(() => buildTripItemSnapshot(other.graph, actor, c, other.id, {}, true)).toThrow(
    "NOT_VISIBLE",
  );
  const shared = structuredClone(other.graph);
  shared.itinerary_events.find((row) => row.id === other.id)!.visibility = "GROUP";
  const sharedCollection = await collection(shared);
  expect(() =>
    buildTripItemSnapshot(shared, actor, sharedCollection, other.id, {}, true, true),
  ).toThrow("NOT_VISIBLE");
});
it("rejects duplicate/unknown query values before dispatching a normal read", async () => {
  const items = vi.fn(),
    canRead = vi.fn(async () => true),
    url = `http://unit/v2/trips/${actor.tripId}/items`;
  for (const suffix of [
    "?family=P1&family=P3",
    "?family=P1&includeHidden=0",
    "?family=P1&actor=forged",
    "?family=P1&limit=1e1",
  ]) {
    expect(
      (
        await tripItemsBoundary(new Request(url + suffix), actor.accountId, canRead, {
          items,
        })
      ).status,
    ).toBe(400);
  }
  expect(items).not.toHaveBeenCalled();
  expect(canRead).not.toHaveBeenCalled();
});
