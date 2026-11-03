import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { coreDefaults } from "./tripCoreV2";
import { validateCoreCommand } from "./tripCoreV2Commands";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "./tripCoreV2Mutation";
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
const before = "2026-11-01T00:00:00Z",
  after = "2026-11-02T00:00:00Z";
function command(g: CoreGraph, id: string, payload: unknown, name = "SET_STAY_DETAILS") {
  return {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: trip,
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
function fixture() {
  const id = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  const rooms = [
    { room_id: a, category: "Double", quantity: 1, capacity: 2 },
    { room_id: b, category: "Twin", quantity: 2, capacity: 3 },
  ];
  const g = applyCoreCommand(
    emptyCoreGraph(),
    command(
      emptyCoreGraph(),
      id,
      {
        family: "P3",
        core: { title: "Stay" },
        schedule: {
          start: coreDateBoundary("2026-12-14"),
          end: coreDateBoundary("2026-12-16"),
        },
        details: { property_name: "Original" },
        rooms,
        ...coreDefaults("member"),
      },
      "CREATE_ITEM",
    ),
    actor,
    before,
  ).graph;
  const state = g.itinerary_events[0].field_state as Record<string, unknown>;
  for (const key of Object.keys(state))
    state[key] = {
      state: "KNOWN",
      origin: "SOURCE",
      protected: false,
      changed_revision: 1,
      evidence_ref: "source/retained-evidence",
    };
  return { g, id, a, b };
}
function patch(g: CoreGraph, id: string, payload: unknown) {
  return applyCoreCommand(g, command(g, id, payload), actor, after);
}
describe("Core sparse Stay owning payload", () => {
  it("changes only property name without resubmitting rooms or room provenance", () => {
    const { g, id } = fixture();
    const old = structuredClone(g);
    const r = patch(g, id, { details: { property_name: "New" } });
    expect(r.graph.trip_stay_rooms).toEqual(old.trip_stay_rooms);
    const state = r.graph.itinerary_events[0].field_state as Record<string, unknown>;
    for (const [key, value] of Object.entries(
      old.itinerary_events[0].field_state as object,
    ))
      if (key.startsWith("trip_stay_rooms.")) expect(state[key]).toEqual(value);
    expect(r.graph.trip_stay_details[0].property_name).toBe("New");
    expect(g).toEqual(old);
  });
  it("patches one capacity and preserves every unmentioned field/room/evidence", () => {
    const { g, id, a, b } = fixture();
    const state = structuredClone(g.itinerary_events[0].field_state) as Record<
      string,
      unknown
    >;
    const r = patch(g, id, {
      roomChanges: [{ operation: "PATCH", room_id: a, changes: { capacity: 4 } }],
    });
    expect(r.graph.trip_stay_rooms.find((r) => r.room_id === a)).toEqual({
      ...g.trip_stay_rooms.find((r) => r.room_id === a),
      capacity: 4,
    });
    expect(r.graph.trip_stay_rooms.find((r) => r.room_id === b)).toEqual(
      g.trip_stay_rooms.find((r) => r.room_id === b),
    );
    const next = r.graph.itinerary_events[0].field_state as Record<string, unknown>;
    for (const key of Object.keys(state))
      if (key !== `trip_stay_rooms.${a}.capacity`) expect(next[key]).toEqual(state[key]);
  });
  it("does not reauthor an explicitly repeated value or touch the item revision", () => {
    const { g, id, a } = fixture();
    const r = patch(g, id, {
      details: { property_name: "Original" },
      roomChanges: [{ operation: "PATCH", room_id: a, changes: { capacity: 2 } }],
    });
    expect(r.changed).toEqual([]);
    expect(r.graph).toEqual(g);
  });
  it("distinguishes omitted fields from explicit null", () => {
    const { g, id, a } = fixture();
    const r = patch(g, id, {
      roomChanges: [{ operation: "PATCH", room_id: a, changes: { capacity: null } }],
    });
    const state = r.graph.itinerary_events[0].field_state as Record<
      string,
      { state: string; origin: string }
    >;
    expect(state[`trip_stay_rooms.${a}.capacity`]).toMatchObject({
      state: "CLEARED",
      origin: "MANUAL",
    });
    expect(r.graph.trip_stay_rooms.find((r) => r.room_id === a)?.category).toBe("Double");
  });
  it("records explicit clearing of a previously unknown null, then treats repeat clear as no change", () => {
    const { g, id, a } = fixture();
    g.trip_stay_rooms.find((r) => r.room_id === a)!.capacity = null;
    delete (g.itinerary_events[0].field_state as Record<string, unknown>)[
      `trip_stay_rooms.${a}.capacity`
    ];
    const payload = {
      roomChanges: [{ operation: "PATCH", room_id: a, changes: { capacity: null } }],
    };
    const first = patch(g, id, payload);
    expect(first.changed).toHaveLength(1);
    expect(patch(first.graph, id, payload).changed).toEqual([]);
  });
  it("adds and removes explicit stable identities without rewriting retained rooms", () => {
    const { g, id, a, b } = fixture(),
      c = randomUUID();
    const r = patch(g, id, {
      roomChanges: [
        { operation: "REMOVE", room_id: a },
        {
          operation: "ADD",
          room: { room_id: c, category: "Suite", quantity: 1, capacity: null },
        },
      ],
    });
    expect(r.graph.trip_stay_rooms.map((r) => r.room_id).sort()).toEqual([b, c].sort());
    expect(r.graph.trip_stay_rooms.find((r) => r.room_id === b)).toEqual(
      g.trip_stay_rooms.find((r) => r.room_id === b),
    );
    const state = r.graph.itinerary_events[0].field_state as Record<string, unknown>;
    expect(state[`trip_stay_rooms.${b}.category`]).toEqual(
      (g.itinerary_events[0].field_state as Record<string, unknown>)[
        `trip_stay_rooms.${b}.category`
      ],
    );
    expect(state[`trip_stay_rooms.${a}.capacity`]).toMatchObject({ state: "CLEARED" });
  });
  it.each(["PATCH", "REMOVE"])(
    "rejects %s on a room not belonging to this target",
    (operation) => {
      const { g, id } = fixture();
      expect(() =>
        patch(g, id, {
          roomChanges: [
            {
              operation,
              room_id: randomUUID(),
              ...(operation === "PATCH" ? { changes: { capacity: 2 } } : {}),
            },
          ],
        }),
      ).toThrow("NOT_VISIBLE");
    },
  );
  it("rejects a reused ADD identity and duplicate operations", () => {
    const { g, id, a } = fixture();
    expect(() =>
      patch(g, id, {
        roomChanges: [
          {
            operation: "ADD",
            room: { room_id: a, category: null, quantity: 1, capacity: null },
          },
        ],
      }),
    ).toThrow("DUPLICATE_CORE_ROW");
    expect(() =>
      validateCoreCommand(
        command(g, id, {
          roomChanges: [
            { operation: "REMOVE", room_id: a },
            { operation: "REMOVE", room_id: a },
          ],
        }),
      ),
    ).toThrow();
  });
  it.each([
    {},
    { details: {} },
    { roomChanges: [] },
    { roomChanges: [{ operation: "PATCH", room_id: randomUUID(), changes: {} }] },
  ])("rejects empty sparse intent %j", (payload) => {
    const { g, id } = fixture();
    expect(() => validateCoreCommand(command(g, id, payload))).toThrow();
  });
  it("retains existing actor, Trip, revision and family rejection", () => {
    const { g, id } = fixture(),
      q = command(g, id, { details: { property_name: "New" } });
    expect(() => applyCoreCommand(g, q, { ...actor, active: false }, after)).toThrow(
      "TRIP_NOT_AUTHORIZED",
    );
    expect(() =>
      applyCoreCommand(g, q, { ...actor, accountId: randomUUID() }, after),
    ).toThrow("NOT_VISIBLE");
    expect(() =>
      applyCoreCommand(g, q, { ...actor, tripId: randomUUID() }, after),
    ).toThrow("TRIP_NOT_AUTHORIZED");
    expect(() =>
      applyCoreCommand(
        g,
        { ...q, baseVector: [{ ...q.baseVector[0], revision: 2 }] },
        actor,
        after,
      ),
    ).toThrow("REVISION_CONFLICT");
    const otherFamily = structuredClone(g);
    otherFamily.itinerary_events[0].experience_family = "P1";
    expect(() => patch(otherFamily, id, q.payload)).toThrow("INVALID_AGGREGATE");
  });
  it("does not admit a new Source proof route through the manual sparse payload", () => {
    const { g, id } = fixture(),
      q = command(g, id, { details: { property_name: "New" } });
    expect(() =>
      applyCoreCommand(
        g,
        {
          ...q,
          admission: {
            mode: "REVIEWED_SOURCE",
            sourceIntentId: randomUUID(),
            policyVersion: null,
          },
        },
        actor,
        after,
        true,
      ),
    ).toThrow("SCOPE_NOT_AUTHORIZED");
  });
  it("rejects mixing sparse and whole-room payloads or forged metadata", () => {
    const { g, id, a } = fixture();
    expect(() =>
      validateCoreCommand(
        command(g, id, {
          details: {},
          rooms: [],
          roomChanges: [{ operation: "REMOVE", room_id: a }],
        }),
      ),
    ).toThrow();
    expect(() =>
      validateCoreCommand(
        command(g, id, {
          roomChanges: [{ operation: "PATCH", room_id: a, changes: { field_state: {} } }],
        }),
      ),
    ).toThrow();
  });
  it("caps the resulting collection and rolls back the local graph on a later invalid operation", () => {
    const { g, id, a } = fixture();
    const original = structuredClone(g);
    const additions = Array.from({ length: 63 }, () => ({
      operation: "ADD",
      room: { room_id: randomUUID(), category: null, quantity: 1, capacity: null },
    }));
    expect(() => patch(g, id, { roomChanges: additions })).toThrow("INVALID_AGGREGATE");
    expect(() =>
      patch(g, id, {
        roomChanges: [
          { operation: "PATCH", room_id: a, changes: { capacity: 5 } },
          { operation: "REMOVE", room_id: randomUUID() },
        ],
      }),
    ).toThrow("NOT_VISIBLE");
    expect(g).toEqual(original);
  });
});
