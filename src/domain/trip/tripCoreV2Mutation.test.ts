import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  applyCoreCommand,
  coreCanRead,
  emptyCoreGraph,
  type CoreGraph,
  type CoreActor,
} from "./tripCoreV2Mutation";
import { coreDefaults, corePlaceSchema, isCoreFieldAddress } from "./tripCoreV2";
import { coreDateBoundary } from "./tripCoreV2Temporal";
const trip = randomUUID(),
  account = randomUUID(),
  person = randomUUID();
const actor: CoreActor = {
  accountId: account,
  tripId: trip,
  active: true,
  canManageShared: false,
  personId: person,
  personIds: [person],
};
const now = "2026-10-12T00:00:00Z";
function command(
  g: CoreGraph,
  name: string,
  id: string,
  payload: unknown,
  kind = "ITEM",
  extra: { kind: string; id: string; revision: number | null }[] = [],
) {
  const table =
    kind === "BOOKING"
      ? g.itinerary_reservations
      : kind === "ENTITLEMENT"
        ? g.trip_entitlements
        : g.itinerary_events;
  const row = table.find((x) => x.id === id);
  return {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: trip,
    command: name,
    target: { kind, id },
    baseVector: [
      {
        kind,
        id,
        revision: row ? row[kind === "ITEM" ? "semantic_revision" : "revision"] : null,
      },
      ...extra,
    ].sort((a, b) => (a.kind + ":" + a.id).localeCompare(b.kind + ":" + b.id)),
    admission: {
      mode: "MANUAL",
      sourceIntentId: null as string | null,
      policyVersion: null,
    },
    payload,
  };
}
function create(g = emptyCoreGraph(), family = "P1", id = randomUUID(), end?: string) {
  const q = command(g, "CREATE_ITEM", id, {
    family,
    core: { title: "planned" },
    schedule: {
      start: coreDateBoundary("2026-12-14"),
      ...(end ? { end: coreDateBoundary(end) } : {}),
    },
    ...coreDefaults("member"),
  });
  return { id, q, result: applyCoreCommand(g, q, actor, now) };
}
describe("Core v2 finite mutation and access", () => {
  it("retains inactive participant history and reactivates the same relation identity", () => {
    const { id, result } = create();
    let graph = result.graph;
    for (const people of [[person], [], [person]])
      graph = applyCoreCommand(
        graph,
        command(graph, "SET_ITEM_PARTICIPATION", id, {
          participation: {
            mode: people.length ? "SELECTED_MEMBERS" : "WHOLE_GROUP",
            people,
            selfPersonId: null,
          },
        }),
        actor,
        now,
      ).graph;
    expect(graph.trip_item_participants).toHaveLength(1);
    expect(graph.trip_item_participants[0].active).toBe(true);
    graph = applyCoreCommand(
      graph,
      command(graph, "SET_ITEM_PARTICIPATION", id, {
        participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
      }),
      actor,
      now,
    ).graph;
    expect(graph.trip_item_participants[0].active).toBe(false);
  });

  it("accepts registered room and dotted service field addresses only", () => {
    expect(
      isCoreFieldAddress("itinerary_transport_services.operator.main.service_literal"),
    ).toBe(true);
    expect(isCoreFieldAddress(`trip_stay_rooms.${randomUUID()}.category`)).toBe(true);
    expect(isCoreFieldAddress("trip_stay_rooms.fake.category")).toBe(false);
    expect(isCoreFieldAddress("trip_rental_places.PICKUP.RETURN.authored_label")).toBe(
      false,
    );
  });
  it("preserves manually protected room facts and rejects source removal", () => {
    const id = randomUUID(),
      roomId = randomUUID();
    const room = { room_id: roomId, category: "Double", quantity: 1, capacity: null };
    const q = command(emptyCoreGraph(), "CREATE_ITEM", id, {
      family: "P3",
      core: { title: "Stay" },
      schedule: {
        start: coreDateBoundary("2026-12-14"),
        end: coreDateBoundary("2026-12-17"),
      },
      rooms: [room],
      ...coreDefaults("member"),
    });
    const g = applyCoreCommand(emptyCoreGraph(), q, actor, now).graph;
    const source = command(g, "SET_STAY_DETAILS", id, { details: {}, rooms: [] });
    source.admission = {
      mode: "REVIEWED_SOURCE",
      sourceIntentId: randomUUID(),
      policyVersion: null,
    };
    expect(() => applyCoreCommand(g, source, actor, now, true)).toThrow(
      "PROTECTED_FIELD",
    );
    expect(g.trip_stay_rooms[0].category).toBe("Double");
  });
  it("explicit null clears Rental place facts and records protected CLEARED leaves", () => {
    const id = randomUUID();
    const place = Object.fromEntries(
      Object.keys(corePlaceSchema.shape).map((k) => [
        k,
        k === "authored_label" ? "Depot" : null,
      ]),
    );
    const q = command(emptyCoreGraph(), "CREATE_ITEM", id, {
      family: "P4",
      core: { title: "Rental" },
      schedule: {
        start: coreDateBoundary("2026-12-14"),
        end: coreDateBoundary("2026-12-20"),
      },
      places: { pickup: place },
      ...coreDefaults("member"),
    });
    const g = applyCoreCommand(emptyCoreGraph(), q, actor, now).graph;
    const clear = command(g, "SET_RENTAL_DETAILS", id, {
      details: {},
      places: { pickup: null },
    });
    const after = applyCoreCommand(g, clear, actor, now).graph;
    expect(after.trip_rental_places[0].authored_label).toBeNull();
    expect(
      (after.itinerary_events[0].field_state as any)[
        "trip_rental_places.PICKUP.authored_label"
      ],
    ).toMatchObject({ state: "CLEARED", protected: true });
  });

  it("creates P1 date-only without fabricating a clock or instant", () => {
    const { result, id } = create();
    const row = result.graph.itinerary_events[0];
    expect(row.id).toBe(id);
    expect(row.planned_start).toBeNull();
    expect(row.start_local_time).toBeNull();
    expect(row.temporal_shape).toBe("CALENDAR");
    expect(row.self_person_id).toBe(person);
    expect(row.visibility).toBe("PRIVATE");
  });
  it("keeps the input graph immutable and increments CAS once", () => {
    const { result, id } = create();
    const before = structuredClone(result.graph);
    const q = command(before, "SET_ITEM_TEXT", id, { title: "changed" });
    const after = applyCoreCommand(before, q, actor, now);
    expect(before).toEqual(result.graph);
    expect(after.graph.itinerary_events[0].semantic_revision).toBe(2);
    expect(() => applyCoreCommand(after.graph, q, actor, now)).toThrow(
      "REVISION_CONFLICT",
    );
  });
  it("blocks cross-trip, revoked account and organizer reading private SELF", () => {
    const { result } = create();
    const row = result.graph.itinerary_events[0];
    expect(
      coreCanRead(
        result.graph,
        { ...actor, accountId: randomUUID(), canManageShared: true },
        "ITEM",
        row,
      ),
    ).toBe(false);
    expect(
      coreCanRead(result.graph, { ...actor, tripId: randomUUID() }, "ITEM", row),
    ).toBe(false);
    expect(coreCanRead(result.graph, { ...actor, active: false }, "ITEM", row)).toBe(
      false,
    );
  });
  it("rejects a foreign SELF person", () => {
    const g = emptyCoreGraph();
    const id = randomUUID();
    const q = command(g, "CREATE_SPARSE_FLIGHT", id, {
      flightNumberLiteral: "NZ5069",
      departureDate: "2026-12-14",
      ...coreDefaults("member"),
      participation: { mode: "SELF", people: [], selfPersonId: randomUUID() },
    });
    expect(() => applyCoreCommand(g, q, actor, now)).toThrow("INVALID_SELF_PERSON");
  });
  it("saves sparse Flight on the existing root without qualified endpoints", () => {
    const g = emptyCoreGraph(),
      id = randomUUID();
    const q = command(g, "CREATE_SPARSE_FLIGHT", id, {
      flightNumberLiteral: "NZ5069",
      departureDate: "2026-12-14",
      ...coreDefaults("member"),
    });
    const result = applyCoreCommand(g, q, actor, now);
    expect(result.graph.itinerary_events).toHaveLength(1);
    expect(result.graph.trip_flight_intents[0].qualification).toBe("SPARSE");
    expect(result.graph.itinerary_transport_endpoints).toEqual([]);
  });
  it("preserves agreeing-source manual protection and rejects subsequent overwrite", () => {
    const { result, id } = create();
    const q = command(result.graph, "SET_ITEM_TEXT", id, { title: "planned" });
    q.admission = {
      mode: "REVIEWED_SOURCE",
      sourceIntentId: randomUUID(),
      policyVersion: null,
    };
    const agrees = applyCoreCommand(result.graph, q, actor, now, true);
    expect(
      (
        agrees.graph.itinerary_events[0].field_state as Record<
          string,
          { protected: boolean }
        >
      )["itinerary_events.title"].protected,
    ).toBe(true);
    const next = command(agrees.graph, "SET_ITEM_TEXT", id, {
      title: "source overwrite",
    });
    next.admission = q.admission;
    expect(() => applyCoreCommand(agrees.graph, next, actor, now, true)).toThrow(
      "PROTECTED_FIELD",
    );
  });
  it("requires an owning source authorization before source changes", () => {
    const { result, id } = create();
    const q = command(result.graph, "SET_ITEM_TEXT", id, { title: "planned" });
    q.admission = {
      mode: "REVIEWED_SOURCE",
      sourceIntentId: randomUUID(),
      policyVersion: null,
    };
    expect(() => applyCoreCommand(result.graph, q, actor, now)).toThrow(
      "INVALID_PROVENANCE",
    );
  });
  it("keeps P3 nights in one Stay identity and rejects reversed range", () => {
    const { result } = create(emptyCoreGraph(), "P3", randomUUID(), "2026-12-17");
    expect(result.graph.itinerary_events).toHaveLength(1);
    expect(result.graph.trip_stay_details).toHaveLength(1);
    expect(() => create(emptyCoreGraph(), "P3", randomUUID(), "2026-12-13")).toThrow(
      "INVALID_RANGE",
    );
  });
  it("permits a Booking with zero Items and never infers paid from due", () => {
    const g = emptyCoreGraph(),
      id = randomUUID();
    const q = command(
      g,
      "CREATE_BOOKING",
      id,
      {
        fields: { title: "Rental", due_minor: 60608, due_currency: "NZD", due_scale: 2 },
        observations: [],
        itemIds: [],
        entitlementIds: [],
        documentIds: [],
        acl: coreDefaults("member").acl,
      },
      "BOOKING",
    );
    const result = applyCoreCommand(g, q, actor, now);
    expect(result.graph.itinerary_reservations[0].due_minor).toBe(60608);
    expect(result.graph.itinerary_reservations[0].commercial_status).toBe("ACTIVE");
    expect(result.graph.trip_booking_item_links).toEqual([]);
  });
  it("rejects incomplete money facts", () => {
    const g = emptyCoreGraph(),
      id = randomUUID();
    const q = command(
      g,
      "CREATE_BOOKING",
      id,
      {
        fields: { title: "invalid", price_minor: 123 },
        observations: [],
        itemIds: [],
        entitlementIds: [],
        documentIds: [],
        acl: coreDefaults("member").acl,
      },
      "BOOKING",
    );
    expect(() => applyCoreCommand(g, q, actor, now)).toThrow("INVALID_MONEY");
  });
});
