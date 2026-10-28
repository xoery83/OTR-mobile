import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyCoreCommand, emptyCoreGraph } from "./tripCoreV2Mutation";
import { coreDefaults } from "./tripCoreV2";
import { flightCommandLeaves, type FlightValues } from "./flightAdmission";
import intents from "../../data/repositories/__fixtures__/tripImportIntents.json";
const target = randomUUID(),
  tripId = randomUUID(),
  accountId = randomUUID();
const actor = {
  accountId,
  tripId,
  active: true,
  canManageShared: false,
  personId: null,
  personIds: [],
};
const now = "2026-10-12T00:00:00Z";
const sourceIntentId = randomUUID();
const extracted = intents.confirmation.slots[0].reviewed_payload
  .edits as unknown as Required<FlightValues>;
const command = (
  name: string,
  payload: unknown,
  revision: number | null,
  source = false,
) => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId,
  command: name,
  target: { kind: "ITEM", id: target },
  baseVector: [{ kind: "ITEM", id: target, revision }],
  admission: {
    mode: source ? "REVIEWED_SOURCE" : "MANUAL",
    sourceIntentId: source ? sourceIntentId : null,
    policyVersion: null,
  },
  payload,
});
function sparse() {
  return applyCoreCommand(
    emptyCoreGraph(),
    command(
      "CREATE_SPARSE_FLIGHT",
      {
        flightNumberLiteral: extracted.title,
        departureDate: extracted.origin.time.local_date,
        ...coreDefaults("member"),
      },
      null,
    ),
    actor,
    now,
  ).graph;
}
function full() {
  const { origin, destination, services } = structuredClone(extracted);
  return {
    origin,
    destination,
    services,
    proofs: proofs({ origin, destination, services }),
  };
}
function proofs(values: FlightValues) {
  return Object.fromEntries(
    Object.keys(flightCommandLeaves(values)).map((field) => [
      field,
      {
        kind: "TRACK_C",
        ref: `track-c/field-evidence/${sourceIntentId}/${field}`,
      },
    ]),
  );
}

describe("Core v2 Flight mutation acceptance after owning source verification", () => {
  it("saves sparse Flight without inventing qualified endpoints or services", () => {
    const g = sparse();
    expect(g.itinerary_events).toHaveLength(1);
    expect(g.itinerary_events[0]).toMatchObject({
      id: target,
      temporal_shape: "CALENDAR",
      participation_mode: "SELF",
      visibility: "PRIVATE",
    });
    expect(g.itinerary_transport_endpoints).toHaveLength(0);
    expect(g.itinerary_transport_services).toHaveLength(0);
    expect(g.trip_flight_intents[0].qualification).toBe("SPARSE");
  });
  it("rejects manual qualification even with a complete valid Source proof payload", () => {
    const graph = sparse();
    const before = structuredClone(graph);
    expect(() =>
      applyCoreCommand(graph, command("QUALIFY_FLIGHT", full(), 1), actor, now, true),
    ).toThrow("INVALID_PROVENANCE");
    expect(graph).toEqual(before);
  });
  it("qualifies the same UUID atomically without moving participation/visibility or unrelated objects", () => {
    const g = sparse();
    const before = structuredClone(g);
    const applied = applyCoreCommand(
      g,
      command("QUALIFY_FLIGHT", full(), 1, true),
      actor,
      now,
      true,
    );
    expect(g).toEqual(before);
    expect(applied.changed).toEqual([
      { kind: "ITEM", id: target, baseRevision: 1, committedRevision: 2 },
    ]);
    expect(applied.graph.itinerary_events[0]).toMatchObject({
      id: target,
      semantic_revision: 2,
      temporal_shape: "TRANSPORT",
      start_local_date: null,
      planned_start: null,
      participation_mode: "SELF",
      visibility: "PRIVATE",
    });
    expect(applied.graph.itinerary_transport_endpoints).toHaveLength(2);
    expect(applied.graph.itinerary_transport_services).toHaveLength(1);
    expect(applied.graph.trip_flight_intents[0].qualification).toBe("QUALIFIED");
    for (const [table, rows] of Object.entries(g))
      if (
        ![
          "itinerary_events",
          "itinerary_transport_endpoints",
          "itinerary_transport_services",
          "trip_flight_intents",
        ].includes(table)
      )
        expect(applied.graph[table as keyof typeof g]).toEqual(rows);
  });
  it("retains manual title protection after an agreeing Source observation", () => {
    const g = sparse();
    const agreed = applyCoreCommand(
      g,
      command("SET_ITEM_TEXT", { title: extracted.title }, 1, true),
      actor,
      now,
      true,
    ).graph;
    expect(
      (agreed.itinerary_events[0].field_state as Record<string, { protected: boolean }>)[
        "itinerary_events.title"
      ].protected,
    ).toBe(true);
    expect(() =>
      applyCoreCommand(
        agreed,
        command("SET_ITEM_TEXT", { title: "source overwrite" }, 2, true),
        actor,
        now,
        true,
      ),
    ).toThrow("PROTECTED_FIELD");
  });
  it("transfers manual sparse departure-date protection to the qualified ORIGIN", () => {
    const qualified = applyCoreCommand(
      sparse(),
      command("QUALIFY_FLIGHT", full(), 1, true),
      actor,
      now,
      true,
    ).graph;
    const state = qualified.itinerary_events[0].field_state as Record<
      string,
      { protected: boolean }
    >;
    expect(state["itinerary_transport_endpoints.ORIGIN.local_date"].protected).toBe(true);
    const changed = full().origin;
    changed.time.local_date = "2026-12-18";
    changed.time.source_instant = "2026-12-17T20:00:00.123456Z";
    expect(() =>
      applyCoreCommand(
        qualified,
        command(
          "UPDATE_FLIGHT_FACTS",
          { changes: { origin: changed }, proofs: proofs({ origin: changed }) },
          2,
          true,
        ),
        actor,
        now,
        true,
      ),
    ).toThrow("PROTECTED_FIELD");
  });
  it("rejects changed sparse date during qualification without mutation", () => {
    const g = sparse(),
      before = structuredClone(g),
      payload = full();
    payload.origin.time.local_date = "2026-12-18";
    payload.proofs = proofs(payload);
    expect(() =>
      applyCoreCommand(g, command("QUALIFY_FLIGHT", payload, 1, true), actor, now, true),
    ).toThrow("PROTECTED_FIELD");
    expect(g).toEqual(before);
  });
  it("rejects stale CAS and foreign private-target authority even with valid typed evidence", () => {
    const g = sparse(),
      before = structuredClone(g);
    expect(() =>
      applyCoreCommand(g, command("QUALIFY_FLIGHT", full(), 2, true), actor, now, true),
    ).toThrow("REVISION_CONFLICT");
    expect(() =>
      applyCoreCommand(
        g,
        command("QUALIFY_FLIGHT", full(), 1, true),
        { ...actor, accountId: randomUUID() },
        now,
        true,
      ),
    ).toThrow("NOT_VISIBLE");
    expect(() =>
      applyCoreCommand(
        g,
        command("QUALIFY_FLIGHT", full(), 1, true),
        { ...actor, tripId: randomUUID() },
        now,
        true,
      ),
    ).toThrow("TRIP_NOT_AUTHORIZED");
    expect(g).toEqual(before);
  });
});
