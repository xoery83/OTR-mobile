import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { coreDefaults, corePlaceSchema } from "./tripCoreV2";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "./tripCoreV2Mutation";
import { validateCoreCommand } from "./tripCoreV2Commands";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import {
  authoredPlaceChanges,
  authoredPlacePatchSchema,
  sparseBoundaryPatchSchema,
  patchCoreBoundary,
} from "./tripCoreSparseFields";
const actor: CoreActor = {
  accountId: randomUUID(),
  tripId: randomUUID(),
  active: true,
  canManageShared: false,
  personId: randomUUID(),
  personIds: [],
};
actor.personIds = [actor.personId!];
const now = "2026-11-01T00:00:00Z",
  later = "2026-11-02T00:00:00Z";
function command(g: CoreGraph, id: string, name: string, payload: unknown) {
  return {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: actor.tripId,
    command: name,
    target: { kind: "ITEM", id },
    baseVector: [
      {
        kind: "ITEM",
        id,
        revision: g.itinerary_events.find((r) => r.id === id)?.semantic_revision ?? null,
      },
    ],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload,
  };
}
function fixture(family = "P3") {
  const id = randomUUID(),
    empty = emptyCoreGraph();
  const place = corePlaceSchema.parse(
    Object.fromEntries(
      Object.keys(corePlaceSchema.shape).map((key) => [
        key,
        key === "authored_label" ? "Original venue" : null,
      ]),
    ),
  );
  const payload = {
    family,
    core: { title: "Source-backed item" },
    schedule: {
      start: { ...coreDateBoundary("2026-12-01"), zone_id: "Pacific/Auckland" },
      end: coreDateBoundary("2026-12-04"),
    },
    ...coreDefaults("member"),
    ...(family === "P4"
      ? {
          details: { supplier: "Supplier", or_similar: true },
          places: { pickup: place, return: { ...place, authored_label: "Other return" } },
        }
      : family === "P6"
        ? {
            details: { session_label: "Morning", admission_note: "Retain note" },
            entryPlace: place,
          }
        : {
            place,
            details: { property_name: "Stay" },
            rooms: [
              { room_id: randomUUID(), category: "Twin", capacity: 2, quantity: 1 },
            ],
          }),
  };
  const g = applyCoreCommand(
    empty,
    command(empty, id, "CREATE_ITEM", payload),
    actor,
    now,
  ).graph;
  for (const state of Object.values(
    g.itinerary_events[0].field_state as Record<string, Record<string, unknown>>,
  )) {
    state.origin = "SOURCE";
    state.protected = false;
    state.evidence_ref = "source/retained";
  }
  return { g, id };
}
it("validates narrow civil leaves and preserves a no-op exact source tuple", () => {
  for (const patch of [
    {},
    { local_time: "09:30" },
    { local_time: null, clock_precision: -1 },
    { local_date: "2026-02-30" },
    { zone_id: "+12:00" },
    { instant: "2026-12-01T00:00:00Z" },
  ])
    expect(sparseBoundaryPatchSchema.safeParse(patch).success).toBe(false);
  const b = coreDateBoundary("2026-12-01");
  expect(patchCoreBoundary(b, { local_date: b.local_date })).toBe(b);
});
it("patches only a Stay start date; retains checkout, zone, rooms and unmodified source metadata", () => {
  const { g, id } = fixture(),
    before = structuredClone(g);
  const r = applyCoreCommand(
    g,
    command(g, id, "SET_ITEM_SCHEDULE", {
      schedulePatch: { start: { local_date: "2026-12-02" } },
    }),
    actor,
    later,
  );
  expect(r.graph.itinerary_events[0]).toMatchObject({
    start_local_date: "2026-12-02",
    start_zone_id: "Pacific/Auckland",
    end_local_date: "2026-12-04",
    semantic_revision: 2,
  });
  expect(r.graph.trip_stay_rooms).toEqual(g.trip_stay_rooms);
  const state = r.graph.itinerary_events[0].field_state as Record<string, unknown>,
    old = g.itinerary_events[0].field_state as Record<string, unknown>;
  expect(state["itinerary_events.start_zone_id"]).toEqual(
    old["itinerary_events.start_zone_id"],
  );
  expect(state["itinerary_events.end_local_date"]).toEqual(
    old["itinerary_events.end_local_date"],
  );
  expect(g).toEqual(before);
  expect(() =>
    applyCoreCommand(
      g,
      command(g, id, "SET_ITEM_SCHEDULE", { schedulePatch: { end: null } }),
      actor,
      later,
    ),
  ).toThrow("INVALID_RANGE");
});
it("retains Entry and its source metadata when only an Activity session changes", () => {
  const { g, id } = fixture("P6");
  const r = applyCoreCommand(
    g,
    command(g, id, "SET_ACTIVITY_DETAILS", { details: { session_label: "Evening" } }),
    actor,
    later,
  );
  expect(r.graph.trip_activity_entry_places).toEqual(g.trip_activity_entry_places);
  expect(r.graph.trip_activity_details[0]).toMatchObject({
    session_label: "Evening",
    admission_note: "Retain note",
  });
  for (const [key, value] of Object.entries(g.itinerary_events[0].field_state as object))
    if (key.startsWith("trip_activity_entry_places."))
      expect(
        (r.graph.itinerary_events[0].field_state as Record<string, unknown>)[key],
      ).toEqual(value);
});
it("preserves false and the other Rental role, and repeats a same-value patch as NO_CHANGE", () => {
  const { g, id } = fixture("P4");
  const r = applyCoreCommand(
    g,
    command(g, id, "SET_RENTAL_DETAILS", {
      details: { or_similar: false },
      places: { pickup: { authored_address: "New pickup" } },
    }),
    actor,
    later,
  );
  expect(r.graph.trip_rental_details[0]).toMatchObject({
    supplier: "Supplier",
    or_similar: false,
  });
  expect(r.graph.trip_rental_places.find((p) => p.role === "RETURN")).toEqual(
    g.trip_rental_places.find((p) => p.role === "RETURN"),
  );
  const repeat = applyCoreCommand(
    r.graph,
    command(r.graph, id, "SET_RENTAL_DETAILS", { details: { or_similar: false } }),
    actor,
    later,
  );
  expect(repeat.changed).toEqual([]);
  expect(repeat.graph).toEqual(r.graph);
});
it("invalidates accepted matching only for a changed authored input and rejects forged accepted facts", () => {
  const old = {
    authored_address: "Old",
    accepted_latitude: 1,
    accepted_longitude: 2,
    accepted_place_id: randomUUID(),
    location_input_revision: 3,
  };
  expect(authoredPlaceChanges(old, { authored_address: "New" })).toMatchObject({
    accepted_latitude: null,
    accepted_longitude: null,
    accepted_place_id: null,
    location_input_revision: 4,
  });
  expect(authoredPlaceChanges(old, { authored_address: "Old" })).toEqual({
    authored_address: "Old",
  });
  expect(
    authoredPlacePatchSchema.safeParse({ accepted_latitude: 1, accepted_longitude: 2 })
      .success,
  ).toBe(false);
  const { g, id } = fixture();
  const input = command(g, id, "SET_ITEM_SCHEDULE", {
    schedulePatch: { start: { local_date: "2026-12-02" } },
  });
  expect(() =>
    validateCoreCommand({
      ...input,
      admission: { mode: "IMPORT", sourceIntentId: null, policyVersion: null },
    }),
  ).toThrow("SCOPE_NOT_AUTHORIZED");
});

it("edits a Sparse Flight literal without inventing endpoints, then preserves the opposite endpoint and source fields", () => {
  const id = randomUUID(),
    empty = emptyCoreGraph();
  const created = applyCoreCommand(
    empty,
    command(empty, id, "CREATE_SPARSE_FLIGHT", {
      flightNumberLiteral: "NZ123",
      departureDate: "2026-12-01",
      ...coreDefaults("member"),
    }),
    actor,
    now,
  ).graph;
  const literal = applyCoreCommand(
    created,
    command(created, id, "SET_AUTHORED_FLIGHT_DETAILS", {
      patch: { flightNumberLiteral: "NZ456" },
    }),
    actor,
    later,
  ).graph;
  expect(literal.itinerary_transport_endpoints).toEqual([]);
  expect(literal.itinerary_events[0].title).toBe("NZ456");
  const routed = applyCoreCommand(
    literal,
    command(literal, id, "SET_AUTHORED_FLIGHT_DETAILS", {
      patch: {
        origin: { airportCode: "AKL", name: "Auckland", terminal: "D" },
        destination: {
          airportCode: "NSN",
          name: "Nelson",
          time: {
            local_date: "2026-12-01",
            local_time: "11:30",
            clock_precision: -1,
            zone_id: "Pacific/Auckland",
          },
        },
      },
    }),
    actor,
    later,
  ).graph;
  const state = routed.itinerary_events[0].field_state as Record<
    string,
    Record<string, unknown>
  >;
  for (const field of Object.values(state)) {
    field.origin = "SOURCE";
    field.protected = false;
    field.evidence_ref = "source/retained-flight";
  }
  const destination = structuredClone(
    routed.itinerary_transport_endpoints.find((row) => row.role === "DESTINATION"),
  );
  const result = applyCoreCommand(
    routed,
    command(routed, id, "SET_AUTHORED_FLIGHT_DETAILS", {
      patch: { origin: { terminal: "International" } },
    }),
    actor,
    later,
  ).graph;
  expect(
    result.itinerary_transport_endpoints.find((row) => row.role === "DESTINATION"),
  ).toEqual(destination);
  expect(result.trip_endpoint_details.find((row) => row.role === "ORIGIN")).toMatchObject(
    { airport_code: "AKL", terminal: "International" },
  );
  for (const [key, value] of Object.entries(state))
    if (key !== "trip_endpoint_details.ORIGIN.terminal")
      expect(
        (result.itinerary_events[0].field_state as Record<string, unknown>)[key],
      ).toEqual(value);
  expect(result.itinerary_events[0].planned_start).toBeNull();
});

it("patches P5 service/one operational role without reauthoring other roles, annotations or source facts", () => {
  const id = randomUUID(),
    empty = emptyCoreGraph();
  const place = corePlaceSchema.parse(
    Object.fromEntries(
      Object.keys(corePlaceSchema.shape).map((key) => [
        key,
        key === "authored_label" ? "Source station" : null,
      ]),
    ),
  );
  const time = (clock: string) => ({
    ...coreDateBoundary("2026-12-01"),
    local_time: clock,
    clock_precision: -1,
    quality: "ESTIMATED",
    zone_id: "Pacific/Auckland",
  });
  const service = {
    service_key: "train-main",
    transport_subtype: "TRAIN",
    attribution: "OPERATING",
    operator_namespace: "NAME",
    operator_issuer: "Operator",
    operator_value: "Rail",
    operator_literal: "Rail",
    service_number: "R1",
    service_literal: "Regional",
    codeshare_operating_key: null,
  };
  const create = {
    family: "P5",
    core: { title: "Rail journey" },
    ...coreDefaults("member"),
    endpoints: {
      origin: { time: time("09:00"), place },
      destination: {
        time: time("12:00"),
        place: { ...place, authored_label: "Arrival" },
      },
    },
    service,
    annotations: {
      origin: { airport_code: null, terminal: null, platform: "2", pier: null },
      destination: { airport_code: null, terminal: null, platform: "7", pier: null },
    },
    operationalFacts: [
      { role: "MEETING", time: time("08:00"), place },
      { role: "CHECKIN", time: time("08:15"), place },
      { role: "BOARDING_CUTOFF", time: time("08:45"), place },
    ],
  };
  const g = applyCoreCommand(
    empty,
    command(empty, id, "CREATE_ITEM", create),
    actor,
    now,
  ).graph;
  for (const field of Object.values(
    g.itinerary_events[0].field_state as Record<string, Record<string, unknown>>,
  )) {
    if (field.state === "KNOWN") {
      field.origin = "SOURCE";
      field.protected = false;
      field.evidence_ref = "source/transport";
    }
  }
  const result = applyCoreCommand(
    g,
    command(g, id, "SET_TRANSPORT_DETAILS", {
      patch: {
        service: { service_number: "R2" },
        operationalChanges: [
          {
            operation: "PATCH",
            role: "MEETING",
            changes: { time: { local_time: "08:05", clock_precision: -1 } },
          },
        ],
      },
    }),
    actor,
    later,
  ).graph;
  expect(result.itinerary_transport_services[0]).toEqual({
    ...g.itinerary_transport_services[0],
    service_number: "R2",
  });
  expect(result.trip_endpoint_details).toEqual(g.trip_endpoint_details);
  expect(result.itinerary_transport_endpoints).toEqual(g.itinerary_transport_endpoints);
  for (const role of ["CHECKIN", "BOARDING_CUTOFF"])
    expect(
      result.trip_transport_operational_facts.find((row) => row.role === role),
    ).toEqual(g.trip_transport_operational_facts.find((row) => row.role === role));
  const state = result.itinerary_events[0].field_state as Record<string, unknown>;
  for (const [key, value] of Object.entries(g.itinerary_events[0].field_state as object))
    if (
      ![
        "itinerary_transport_services.train-main.service_number",
        "trip_transport_operational_facts.MEETING.local_time",
      ].includes(key)
    )
      expect(state[key]).toEqual(value);
  const rekeyed = applyCoreCommand(
    result,
    command(result, id, "SET_TRANSPORT_DETAILS", {
      patch: { service: { service_key: "train-renamed" } },
    }),
    actor,
    later,
  ).graph;
  expect(rekeyed.itinerary_transport_services).toEqual([
    { ...result.itinerary_transport_services[0], service_key: "train-renamed" },
  ]);
  const rekeyedState = rekeyed.itinerary_events[0].field_state as Record<string, unknown>;
  for (const [key, value] of Object.entries(
    result.itinerary_events[0].field_state as object,
  ))
    expect(
      rekeyedState[
        key.replace(
          "itinerary_transport_services.train-main.",
          "itinerary_transport_services.train-renamed.",
        )
      ],
    ).toEqual(value);
  expect(rekeyed.itinerary_transport_endpoints).toEqual(
    result.itinerary_transport_endpoints,
  );
  const removed = applyCoreCommand(
    result,
    command(result, id, "SET_TRANSPORT_DETAILS", {
      patch: { operationalChanges: [{ operation: "REMOVE", role: "MEETING" }] },
    }),
    actor,
    later,
  ).graph;
  expect(removed.trip_transport_operational_facts.map((row) => row.role).sort()).toEqual([
    "BOARDING_CUTOFF",
    "CHECKIN",
  ]);
  expect(
    removed.trip_transport_operational_facts.find((row) => row.role === "CHECKIN"),
  ).toEqual(
    result.trip_transport_operational_facts.find((row) => row.role === "CHECKIN"),
  );
});

it("logically deletes without removing children; a journal witness blocks Restore and edits while preserving CAS", () => {
  const { g, id } = fixture();
  const graphHash = "a".repeat(64);
  const request = command(g, id, "DELETE_ITEM", {
    reason: "Explicit logical delete",
    graphHash,
  });
  const deleted = applyCoreCommand(g, request, actor, later, false, graphHash);
  expect(deleted.graph.trip_stay_rooms).toEqual(g.trip_stay_rooms);
  expect(deleted.graph.itinerary_events[0].hidden_at).toBe(later);
  const proof = new Set([id]);
  const repeat = command(deleted.graph, id, "DELETE_ITEM", {
    reason: "Already deleted",
    graphHash,
  });
  expect(
    applyCoreCommand(
      deleted.graph,
      repeat,
      actor,
      later,
      false,
      graphHash,
      false,
      undefined,
      proof,
    ).changed,
  ).toEqual([]);
  expect(() =>
    applyCoreCommand(
      deleted.graph,
      request,
      actor,
      later,
      false,
      graphHash,
      false,
      undefined,
      proof,
    ),
  ).toThrow("REVISION_CONFLICT");
  const restore = command(deleted.graph, id, "RESTORE_OBJECT", {
    scope: "OBJECT_ONLY",
    affectedIds: [{ kind: "ITEM", id }],
    graphHash,
  });
  expect(() =>
    applyCoreCommand(
      deleted.graph,
      restore,
      actor,
      later,
      false,
      graphHash,
      false,
      undefined,
      proof,
    ),
  ).toThrow("ITEM_DELETED");
  expect(() =>
    applyCoreCommand(
      deleted.graph,
      command(deleted.graph, id, "SET_ITEM_TEXT", { description: "Cannot revive" }),
      actor,
      later,
      false,
      undefined,
      false,
      undefined,
      proof,
    ),
  ).toThrow("ITEM_DELETED");
});
it("does not let a category setter convert a P1 root into another family", () => {
  const { g, id } = fixture("P6");
  expect(() =>
    applyCoreCommand(
      g,
      command(g, id, "SET_ITEM_CATEGORY", { family: "P1", category: null }),
      actor,
      later,
    ),
  ).toThrow("INVALID_AGGREGATE");
});
