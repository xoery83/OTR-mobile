import { expect, it } from "vitest";
import { itinerary_eventsSchema } from "./tripCoreV2";
import { emptyCoreGraph } from "./tripCoreV2Mutation";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { projectCoreP4Feed } from "./tripCoreV2P4DayFeed";
import { projectCoreP5Feed } from "./tripCoreV2P5DayFeed";
import { projectCoreP6Feed } from "./tripCoreV2P6DayFeed";

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

const timedRental = (id: string) => ({
  ...row(id),
  ...Object.fromEntries(
    (["start", "end"] as const).flatMap((prefix) => {
      const hour = prefix === "start" ? "09" : "18";
      return [
        [`planned_${prefix}`, `2027-01-15T${hour}:00:00Z`],
        ...Object.entries({
          local_date: "2027-01-15",
          local_time: `${hour}:00:00`,
          clock_precision: 0,
          quality: "EXACT",
          basis: "SOURCE_INSTANT",
          zone_id: "UTC",
          source_instant: `2027-01-15T${hour}:00:00Z`,
          source_instant_precision: 0,
          civil_resolution: null,
        }).map(([key, value]) => [`${prefix}_${key}`, value]),
      ];
    }),
  ),
});

it("retains both same-day Core endpoint roles, clocks and unchanged Rental identity", () => {
  const graph = emptyCoreGraph();
  const id = "c0000000-0000-4000-8000-000000000014";
  graph.itinerary_events = [timedRental(id)];
  const bytes = JSON.stringify(graph);
  const projection = projectCoreP4Feed(graph, actor, certificate, []);
  const query = projection.query("2027-01-15", "UTC");
  expect(query.timed.map((item) => [item.event.id, item.roles, item.anchor])).toEqual([
    [id, ["START"], "2027-01-15T09:00:00Z"],
    [id, ["END"], "2027-01-15T18:00:00Z"],
  ]);
  expect(query.timed[0].event).toBe(query.timed[1].event);
  expect(projection.items).toHaveLength(1);
  expect(query.nonComparable).toEqual([]);
  expect(JSON.stringify(graph)).toBe(bytes);
});

it("keeps an unknown same-day Return independent in TNS without a fabricated clock", () => {
  const graph = emptyCoreGraph();
  const rental = timedRental("c0000000-0000-4000-8000-000000000014");
  Object.assign(
    rental,
    { planned_end: null },
    Object.fromEntries(
      Object.entries(coreDateBoundary("2027-01-15"))
        .filter(([key]) => key !== "instant")
        .map(([key, value]) => [`end_${key}`, value]),
    ),
  );
  graph.itinerary_events = [rental];
  const query = projectCoreP4Feed(graph, actor, certificate, []).query(
    "2027-01-15",
    "UTC",
  );
  expect(query.timed.map((item) => item.roles)).toEqual([["START"]]);
  expect(query.nonComparable.map((item) => [item.roles, item.anchor])).toEqual([
    [["END"], null],
  ]);
});

it("preserves P4 endpoint order around an intervening Event in downstream P5/P6 projections", () => {
  const graph = emptyCoreGraph();
  const rental = timedRental("c0000000-0000-4000-8000-000000000014");
  const activity = {
    ...timedRental("c0000000-0000-4000-8000-000000000015"),
    experience_family: "P1",
    event_type: "activity",
    temporal_shape: "POINT",
    planned_start: "2027-01-15T12:00:00Z",
    start_local_time: "12:00:00",
    start_source_instant: "2027-01-15T12:00:00Z",
  };
  for (const [key, value] of Object.entries(coreDateBoundary("2027-01-15"))) {
    if (key === "instant") activity.planned_end = null;
    else (activity as Record<string, unknown>)[`end_${key}`] = value;
  }
  graph.itinerary_events = [rental, activity];
  for (const project of [projectCoreP4Feed, projectCoreP5Feed, projectCoreP6Feed]) {
    const query = project(graph, actor, certificate, []).query("2027-01-15", "UTC");
    expect(query.timed.map((item) => item.anchor)).toEqual([
      "2027-01-15T09:00:00Z",
      "2027-01-15T12:00:00Z",
      "2027-01-15T18:00:00Z",
    ]);
  }
});
