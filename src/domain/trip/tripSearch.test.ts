import { expect, it } from "vitest";
import { emptyCoreGraph, applyCoreCommand } from "./tripCoreV2Mutation";
import { coreDefaults } from "./tripCoreV2";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { projectCoreItem } from "./tripCoreV2Views";
import { randomUUID } from "node:crypto";
import {
  matchSearchItem,
  matchSearchTrip,
  searchGroups,
  searchPreset,
} from "./tripSearch";
it("keeps scope/category presets independent and ranks lawful IDs/names/prefixes/structured facts", () => {
  const trip = {
    id: randomUUID(),
    name: "New Zealand",
    destination: "Auckland",
    start_date: "2027-01-01",
    end_date: "2027-01-28",
  };
  expect(searchPreset("MY_TRIPS", trip.id)).toMatchObject({
    tripId: null,
    category: "TRIPS",
  });
  expect(searchPreset("HOME", trip.id)).toMatchObject({
    tripId: trip.id,
    category: "ALL",
  });
  expect(searchPreset("DAY", trip.id)).toMatchObject({
    tripId: trip.id,
    category: "ITINERARY",
  });
  expect(matchSearchTrip(trip, trip.id.replaceAll("-", ""))?.rank).toBe(0);
  expect(matchSearchTrip(trip, " new   ZEALAND ")?.rank).toBe(1);
  expect(matchSearchTrip(trip, "New")?.rank).toBe(2);
  expect(matchSearchTrip(trip, "Auckland")?.rank).toBe(3);
  expect(matchSearchTrip(trip, "")).toBeNull();
});
it("matches only projected Item allowlist, never private linked references or raw detail fields", () => {
  const trip = {
      id: randomUUID(),
      name: "Trip",
      destination: null,
      start_date: null,
      end_date: null,
    },
    actor = {
      accountId: randomUUID(),
      tripId: trip.id,
      active: true,
      canManageShared: false,
      personId: null,
      personIds: [],
    },
    id = randomUUID();
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: trip.id,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P1",
        core: { title: "Museum" },
        schedule: { start: coreDateBoundary("2027-01-27") },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2027-01-01T00:00:00Z",
  ).graph;
  const item = projectCoreItem(graph, actor, id)!;
  expect(matchSearchItem(item, trip, "2027-01-27")?.id).toBe(id);
  item.details.rawPrivateReference = "UNEXPOSED";
  item.bookingSummaries.push({
    title: "UNEXPOSED",
    confirmationCode: "UNEXPOSED",
  } as never);
  expect(matchSearchItem(item, trip, "UNEXPOSED")).toBeNull();
  expect(matchSearchItem({ ...item, hidden: true }, trip, "Museum")).toBeNull();
});
it("All caps each identity category at3; See all preserves distinct Item identities and zero selected category", () => {
  const trip = {
    id: randomUUID(),
    name: "Trip",
    destination: null,
    start_date: null,
    end_date: null,
  };
  const root = matchSearchTrip(trip, "Trip")!;
  const items = Array.from({ length: 6 }, (_, i) => ({
    ...root,
    id: String(i),
    category: "ITINERARY" as const,
    title: `Segment${i}`,
    family: "P2",
  }));
  const all = searchGroups([root, ...items], "ALL");
  expect(all.map((group) => [group.category, group.count, group.rows.length])).toEqual([
    ["TRIPS", 1, 1],
    ["ITINERARY", 6, 3],
  ]);
  expect(searchGroups(items, "ITINERARY")[1].rows).toHaveLength(6);
  expect(searchGroups([], "ITINERARY")[1]).toMatchObject({ count: 0, rows: [] });
});

it("review: lawful sparse Flight literal matches when an independent title is supplied", () => {
  const trip = {
    id: randomUUID(),
    name: "Trip",
    destination: null,
    start_date: null,
    end_date: null,
  };
  const actor = {
    accountId: randomUUID(),
    tripId: trip.id,
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const id = randomUUID();
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: trip.id,
      command: "CREATE_SPARSE_FLIGHT",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        flightNumberLiteral: "NZ5069",
        departureDate: "2027-01-27",
        core: { title: "Flight to Tokyo" },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2027-01-01T00:00:00Z",
  ).graph;
  const item = projectCoreItem(graph, actor, id)!;
  expect(item.details.flightNumberLiteral).toBe("NZ5069");
  expect(matchSearchItem(item, trip, "NZ5069")?.id).toBe(id);
});

it("review: actor-readable canonical Item description is a lawful weak match", () => {
  const trip = {
    id: randomUUID(),
    name: "Trip",
    destination: null,
    start_date: null,
    end_date: null,
  };
  const actor = {
    accountId: randomUUID(),
    tripId: trip.id,
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const id = randomUUID();
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: trip.id,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P1",
        core: { title: "Museum", description: "Bring an umbrella" },
        schedule: { start: coreDateBoundary("2027-01-27") },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2027-01-01T00:00:00Z",
  ).graph;
  expect(graph.itinerary_events[0].description).toBe("Bring an umbrella");
  const item = projectCoreItem(graph, actor, id)!;
  expect(item).not.toBeNull();
  expect(
    matchSearchItem(item, trip, "umbrella", String(graph.itinerary_events[0].description))
      ?.id,
  ).toBe(id);
  expect(
    matchSearchItem(item, trip, "umbrella", String(graph.itinerary_events[0].description))
      ?.rank,
  ).toBe(5);
});
