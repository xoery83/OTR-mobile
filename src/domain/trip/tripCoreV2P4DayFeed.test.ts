import { expect, it } from "vitest";
import { itinerary_eventsSchema } from "./tripCoreV2";
import { emptyCoreGraph } from "./tripCoreV2Mutation";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { projectCoreP4Feed } from "./tripCoreV2P4DayFeed";

const tripId = "c0000000-0000-4000-8000-000000000004";
const accountId = "c0000000-0000-4000-8000-000000000001";
const actor = {
  tripId,
  accountId,
  personId: null,
  personIds: [],
  active: true,
  canManageShared: false,
};
const certificate = {
  generation: 1,
  epoch: "synthetic",
  revision: "1",
  accessRevision: 1,
  actorPersonBindingHash: "synthetic",
  participatingRosterHash: "synthetic",
  manifestSha256: "synthetic",
};
const row = (id: string) =>
  itinerary_eventsSchema.parse({
    ...Object.fromEntries(
      Object.keys(itinerary_eventsSchema.shape).map((key) => [key, null]),
    ),
    id,
    trip_id: tripId,
    owner_account_id: accountId,
    semantic_revision: 1,
    visibility: "PRIVATE",
    created_at: "2027-01-01T00:00:00Z",
    updated_at: "2027-01-01T00:00:00Z",
    field_state: {},
    business_contract_version: 2,
    experience_family: "P4",
    temporal_contract_version: 1,
    temporal_shape: "SPAN",
    title: "Synthetic rental",
    event_type: "car",
    status: "planned",
    participation_mode: "SELF",
    participant_scope: "ASSIGNED",
    ...Object.fromEntries(
      Object.entries(coreDateBoundary("2027-01-15"))
        .filter(([key]) => key !== "instant")
        .map(([key, value]) => [`start_${key}`, value]),
    ),
    ...Object.fromEntries(
      Object.entries(coreDateBoundary("2027-01-18"))
        .filter(([key]) => key !== "instant")
        .map(([key, value]) => [`end_${key}`, value]),
    ),
  });

it("projects separate rental identities on pickup and return dates only", () => {
  const graph = emptyCoreGraph();
  const first = "c0000000-0000-4000-8000-000000000014";
  const second = "c0000000-0000-4000-8000-000000000024";
  graph.itinerary_events = [row(first), row(second)];
  const projection = projectCoreP4Feed(graph, actor, certificate, []);
  const pickup = projection.query("2027-01-15", "Pacific/Auckland");
  const middle = projection.query("2027-01-16", "Pacific/Auckland");
  const back = projection.query("2027-01-18", "Pacific/Auckland");
  expect(pickup.coreRows.map((r) => [r.itemRef, r.rowKey.projectionRole])).toEqual([
    [first, "PICKUP"],
    [second, "PICKUP"],
  ]);
  expect(middle.coreRows).toEqual([]);
  expect(pickup.unresolved).toEqual([]);
  expect(back.unresolved).toEqual([]);
  expect(back.coreRows.map((r) => [r.itemRef, r.rowKey.projectionRole])).toEqual([
    [first, "RETURN"],
    [second, "RETURN"],
  ]);
  expect(projection.items.filter((item) => item.family === "P4")).toHaveLength(2);
});
