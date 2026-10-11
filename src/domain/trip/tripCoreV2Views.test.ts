import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  coreDefaults,
  corePlaceSchema,
  itinerary_transport_servicesSchema,
} from "./tripCoreV2";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "./tripCoreV2Mutation";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { projectCoreDay } from "./tripCoreV2Day";
import { projectCoreItem, coreOccurrenceRef } from "./tripCoreV2Views";
const actor: CoreActor = {
  accountId: randomUUID(),
  tripId: randomUUID(),
  personId: null,
  personIds: [],
  active: true,
  canManageShared: true,
};
const now = "2026-10-12T00:00:00Z";
const place = (label: string | null = null) => ({
  ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
  authored_label: label,
});
function create(
  g: CoreGraph,
  family: string,
  start: string,
  end?: string,
  extra: Record<string, unknown> = {},
) {
  const id = randomUUID();
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: actor.tripId,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family,
      core: { title: family + " fixture" },
      ...(family === "P5"
        ? {}
        : {
            schedule: {
              start: coreDateBoundary(start),
              ...(end ? { end: coreDateBoundary(end) } : {}),
            },
          }),
      ...coreDefaults("organizer"),
      ...extra,
    },
  };
  return { id, graph: applyCoreCommand(g, command, actor, now).graph };
}
describe("Core2 supplemental read and deterministic Day, synthetic accepted facts", () => {
  it("P1 unknown presentation omits fabricated time/place and occurrence reuses Item UUID", () => {
    const { id, graph } = create(emptyCoreGraph(), "P1", "2026-12-14");
    const rows = projectCoreDay(graph, actor, "2026-12-14", 1),
      item = projectCoreItem(graph, actor, id)!;
    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBe("TNS");
    expect(item.schedule).not.toHaveProperty("start.instant");
    expect(item).not.toHaveProperty("place");
    const ref = coreOccurrenceRef(item, rows);
    expect(ref.itemId).toBe(id);
    expect(ref.dayRowKeys[0].itemId).toBe(id);
    expect(ref.boundaries[0]).not.toHaveProperty("localTime");
  });
  it("P3 nights use the calendar range; unique Base has no extra Event or checkout night", () => {
    const stay = create(emptyCoreGraph(), "P3", "2026-12-14", "2026-12-17", {
      details: { property_name: "Lodge" },
    });
    expect(projectCoreItem(stay.graph, actor, stay.id)?.details).toMatchObject({
      nights: 3,
      propertyName: "Lodge",
      rooms: [],
    });
    expect(
      projectCoreDay(stay.graph, actor, "2026-12-15", 1).map(
        (r) => r.rowKey.projectionRole,
      ),
    ).toEqual(["TONIGHT"]);
    expect(
      projectCoreDay(stay.graph, actor, "2026-12-17", 1).map(
        (r) => r.rowKey.projectionRole,
      ),
    ).toEqual(["CHECKOUT"]);
    expect(stay.graph.itinerary_events).toHaveLength(1);
    const withActivity = create(stay.graph, "P1", "2026-12-15");
    expect(
      projectCoreDay(withActivity.graph, actor, "2026-12-15", 1)
        .filter((r) => r.family === "P3")
        .map((r) => r.rowKey.projectionRole)
        .sort(),
    ).toEqual(["BASE_FROM", "BASE_RETURN"]);
  });
  it("overlapping applicable Stays withhold derived Base", () => {
    const first = create(emptyCoreGraph(), "P3", "2026-12-14", "2026-12-17");
    const second = create(first.graph, "P3", "2026-12-14", "2026-12-18");
    expect(projectCoreDay(second.graph, actor, "2026-12-15", 1)).toEqual([]);
  });
  it("P4 independent rentals retain reserved category/verified plate and distinct Returns", () => {
    const first = create(emptyCoreGraph(), "P4", "2026-12-14", "2026-12-20", {
      details: { reserved_category: "SUV", verified_plate: "NZ123" },
      places: { pickup: place("Depot") },
    });
    const second = create(first.graph, "P4", "2026-12-14", "2026-12-22", {
      places: { pickup: place("Depot") },
    });
    const rows = projectCoreDay(second.graph, actor, "2026-12-14", 1);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.visualGroupKey)).toBe(true);
    expect(
      projectCoreDay(second.graph, actor, "2026-12-20", 1).map((r) => r.itemRef),
    ).toEqual([first.id]);
    expect(
      projectCoreDay(second.graph, actor, "2026-12-22", 1).map((r) => r.itemRef),
    ).toEqual([second.id]);
    expect(projectCoreDay(second.graph, actor, "2026-12-16", 1)).toEqual([]);
    expect(projectCoreItem(second.graph, actor, first.id)?.details).toMatchObject({
      reservedCategory: "SUV",
      verifiedPlate: "NZ123",
    });
  });
  it("P5 Water Taxi segments keep independent endpoints and service details", () => {
    let graph = emptyCoreGraph();
    const ids: string[] = [];
    for (const date of ["2026-12-16", "2026-12-19"]) {
      const service = {
        ...Object.fromEntries(
          Object.keys(itinerary_transport_servicesSchema.shape)
            .filter((k) => !["trip_id", "event_id"].includes(k))
            .map((k) => [k, null]),
        ),
        service_key: "water.main",
        transport_subtype: "WATER_TAXI",
        attribution: "UNSPECIFIED",
        operator_namespace: "NAME",
        operator_issuer: "SUPPLIER",
        operator_value: "Water Taxi",
        operator_literal: "Water Taxi",
        service_number: "1",
        service_literal: "Water Taxi 1",
      };
      const next = create(graph, "P5", date, undefined, {
        endpoints: {
          origin: { time: coreDateBoundary(date), place: place("Pier A") },
          destination: { time: coreDateBoundary(date), place: place("Pier B") },
        },
        service,
      });
      graph = next.graph;
      ids.push(next.id);
    }
    expect(graph.itinerary_events).toHaveLength(2);
    expect(graph.itinerary_transport_endpoints).toHaveLength(4);
    expect(
      projectCoreDay(graph, actor, "2026-12-16", 1)
        .map((r) => r.rowKey.projectionRole)
        .sort(),
    ).toEqual(["DESTINATION", "ORIGIN"]);
    expect(projectCoreItem(graph, actor, ids[0])?.details.service).toMatchObject({
      transportSubtype: "WATER_TAXI",
      serviceKey: "water.main",
    });
  });
  it("private objects withhold supplemental view even for organizer", () => {
    const { id, graph } = create(emptyCoreGraph(), "P6", "2026-12-14", undefined, {
      ...coreDefaults("member"),
      details: { session_label: "Morning" },
    });
    expect(projectCoreItem(graph, { ...actor, accountId: randomUUID() }, id)).toBeNull();
    expect(projectCoreItem(graph, actor, id)?.details).toMatchObject({
      sessionLabel: "Morning",
    });
  });
});
