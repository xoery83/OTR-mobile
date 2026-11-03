import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "./server";
import { prepareSparseStayUpdate } from "./sparseStayAdapter";
import {
  createMutationTools,
  prepareCreate,
  mutationIdentity,
  sha,
  type BackendMutation,
  type ConfirmChanges,
} from "./mutation";
import { verifyGoldenReadback } from "./goldenReadback";
import { createReadTools as makeReadTools } from "./read";
import { validateCoreCommand } from "../src/domain/trip/tripCoreV2Commands";
import {
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "../src/domain/trip/tripCoreV2Mutation";
import { projectCoreItem } from "../src/domain/trip/tripCoreV2Views";
import { buildCoreActorCollection } from "../backend/src/tripCoreV2Collection";
import { coreHttpBoundary, type CoreHttpConnection } from "../backend/src/tripCoreV2Http";
import type { CoreReceipt } from "../src/domain/trip/tripCoreV2Receipt";
const account = randomUUID(),
  trip = randomUUID(),
  person = randomUUID();
const actor: CoreActor = {
  accountId: account,
  tripId: trip,
  active: true,
  canManageShared: true,
  personId: person,
  personIds: [person],
};
async function sparseStayFixture() {
  const f = fixture(),
    rooms = [
      { room_id: randomUUID(), category: "Family", quantity: 1, capacity: 3 },
      { room_id: randomUUID(), category: "Twin", quantity: 2, capacity: 2 },
    ];
  const p = prepareCreate(account, create());
  if (p.kind !== "ITEM") throw Error("ITEM_REQUIRED");
  p.command = validateCoreCommand({
    ...p.command,
    payload: { ...(p.command.payload as Record<string, unknown>), rooms },
  });
  await createMutationTools(context(f.backend)).execute(
    p,
    "APPLY",
    mutationIdentity(account, p).preview_digest,
  );
  const states = f.graph().itinerary_events[0].field_state as Record<string, unknown>;
  for (const key of Object.keys(states))
    states[key] = {
      state: "KNOWN",
      origin: "SOURCE",
      protected: true,
      changed_revision: 1,
      evidence_ref: "source/retained-room-evidence",
    };
  const base = () =>
    makeReadTools(account, f.read).get_trip_item_edit_base({
      trip_id: trip,
      item_id: p.command.target.id,
    });
  const proof = (operationId: string) => ({
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: f.graph().itinerary_events,
          stay: f.graph().trip_stay_details[0] ?? null,
          stayRooms: f.graph().trip_stay_rooms,
          receipt: JSON.parse(f.receipts.get(operationId)!.receiptText),
        },
      },
    ],
  });
  return { ...f, rooms, base, proof };
}

it.each(["details", "capacity"])(
  "S2 sparse %s preserves source room facts and recovers one original Receipt",
  async (kind) => {
    const f = await sparseStayFixture(),
      base = await f.base(),
      before = structuredClone(f.graph()),
      approved = new Set<string>();
    const change =
      kind === "details"
        ? { details: { property_name: "Updated source lodge" } }
        : {
            roomChanges: [
              {
                operation: "PATCH",
                room_id: f.rooms[0].room_id,
                changes: { capacity: 4 },
              },
            ],
          };
    const p = prepareSparseStayUpdate({ request_id: randomUUID(), base, change });
    const tools = createMutationTools({
      ...context(f.backend, async (q) => approved.has(q.digest)),
      read: f.read,
      sparseStaySupported: true,
    });
    const preview = await tools.execute(p, "PREVIEW");
    expect(preview.outcome).toBe("PREVIEW");
    expect(f.graph()).toEqual(before);
    expect((await tools.execute(p, "APPLY", preview.preview_digest)).outcome).toBe(
      "NEEDS_CONFIRMATION",
    );
    approved.add(preview.preview_digest);
    f.lose();
    expect((await tools.execute(p, "APPLY", preview.preview_digest)).outcome).toBe(
      "UNKNOWN",
    );
    // Receipt-first recovery works even after capability shutdown and the live revision advances.
    const recovered = await createMutationTools({
      ...context(f.backend),
      read: f.read,
    }).execute(p, "APPLY", preview.preview_digest);
    expect(recovered).toMatchObject({
      outcome: "APPLIED",
      current_revision: 2,
      operation_id: p.command.operationId,
    });
    expect(f.posts()).toBe(2);
    expect(
      await verifyGoldenReadback(f.proof(p.command.operationId), p, account),
    ).toHaveProperty("status", "SERVER_VERIFIED");
    const wrong = structuredClone(f.proof(p.command.operationId));
    if (kind === "details") wrong.rows[0].evidence.stay!.property_name = "Wrong";
    else
      wrong.rows[0].evidence.stayRooms.find(
        (r) => r.room_id === f.rooms[0].room_id,
      )!.capacity = 9;
    await expect(verifyGoldenReadback(wrong, p, account)).rejects.toThrow(
      "INDEPENDENT_EXPECTED_FIELD_MISMATCH",
    );
    const expectedRooms =
      kind === "details"
        ? before.trip_stay_rooms
        : before.trip_stay_rooms.map((r) =>
            r.room_id === f.rooms[0].room_id ? { ...r, capacity: 4 } : r,
          );
    const indexed = (rows: CoreGraph["trip_stay_rooms"]) =>
      Object.fromEntries(rows.map((r) => [String(r.room_id), r]));
    expect(indexed(f.graph().trip_stay_rooms)).toEqual(indexed(expectedRooms));
    expect(f.graph().trip_stay_details).toEqual(
      kind === "capacity"
        ? before.trip_stay_details
        : before.trip_stay_details.map((r) => ({
            ...r,
            property_name: "Updated source lodge",
          })),
    );
    const changed =
      kind === "details"
        ? "trip_stay_details.property_name"
        : `trip_stay_rooms.${f.rooms[0].room_id}.capacity`;
    for (const [key, value] of Object.entries(
      before.itinerary_events[0].field_state as Record<string, unknown>,
    ))
      if (key !== changed)
        expect(
          (f.graph().itinerary_events[0].field_state as Record<string, unknown>)[key],
        ).toEqual(value);
    for (const [key, value] of Object.entries(before.itinerary_events[0]))
      if (!["field_state", "semantic_revision", "updated_at"].includes(key))
        expect(f.graph().itinerary_events[0][key]).toEqual(value);
    const current = await f.base();
    expect(current.item.itemRevision).toBe(2);
    expect(
      indexed(
        (current.record.body as Record<string, unknown>)
          .trip_stay_rooms as CoreGraph["trip_stay_rooms"],
      ),
    ).toEqual(indexed(f.graph().trip_stay_rooms));
  },
);

it("S2 defaults closed and leaves the public tool catalog unchanged", async () => {
  const f = await sparseStayFixture(),
    base = await f.base();
  const p = prepareSparseStayUpdate({
    request_id: randomUUID(),
    base,
    change: { details: { property_name: "New" } },
  });
  const tools = createMutationTools({ ...context(f.backend), read: f.read });
  expect(await tools.execute(p, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "SPARSE_STAY_BACKEND_NOT_QUALIFIED",
  });
  expect(
    await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({
    outcome: "REJECTED",
    error_code: "SPARSE_STAY_BACKEND_NOT_QUALIFIED",
  });
  const resource = "https://s2-local.invalid/mcp";
  const handler = createMcpHandler({
    resource,
    authorize: async () => ({
      accountId: account,
      clientId: "local",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: f.read,
      backend: f.backend,
    }),
  });
  const client = new Client({ name: "s2-unmounted", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (i, o) => handler(new Request(i, o)),
      }),
    );
    const catalog = await client.listTools();
    expect(JSON.stringify(catalog)).not.toContain("roomChanges");
  } finally {
    await client.close();
  }
  expect(f.posts()).toBe(1);
});

it("S2 explicit null, no-change, ADD and REMOVE retain stable IDs and independent field state", async () => {
  const f = await sparseStayFixture(),
    tools = createMutationTools({
      ...context(f.backend),
      read: f.read,
      sparseStaySupported: true,
    });
  async function edit(change: unknown) {
    const p = prepareSparseStayUpdate({
      request_id: randomUUID(),
      base: await f.base(),
      change,
    });
    const preview = await tools.execute(p, "PREVIEW");
    expect(preview.outcome).toBe("PREVIEW");
    const result = await tools.execute(p, "APPLY", preview.preview_digest);
    expect(
      await verifyGoldenReadback(f.proof(p.command.operationId), p, account),
    ).toHaveProperty(
      "status",
      result.outcome === "NO_CHANGE"
        ? "NO_CHANGE_RECEIPT_AND_CURRENT_FIELDS_VERIFIED"
        : "SERVER_VERIFIED",
    );
    for (const corruption of ["empty", "foreign_parent", "omitted", "duplicate"]) {
      const wrong = structuredClone(f.proof(p.command.operationId));
      if (corruption === "empty") wrong.rows[0].evidence.stayRooms = [];
      if (corruption === "foreign_parent")
        for (const r of wrong.rows[0].evidence.stayRooms) r.event_id = randomUUID();
      if (corruption === "omitted") wrong.rows[0].evidence.stayRooms.shift();
      if (corruption === "duplicate")
        wrong.rows[0].evidence.stayRooms.push({ ...wrong.rows[0].evidence.stayRooms[0] });
      await expect(verifyGoldenReadback(wrong, p, account)).rejects.toThrow();
    }
    return result;
  }
  const before = structuredClone(f.graph());
  expect(
    (
      await edit({
        roomChanges: [
          { operation: "PATCH", room_id: f.rooms[0].room_id, changes: { capacity: 3 } },
        ],
      })
    ).outcome,
  ).toBe("NO_CHANGE");
  expect(f.graph()).toEqual(before);
  expect(
    (
      await edit({
        roomChanges: [
          {
            operation: "PATCH",
            room_id: f.rooms[0].room_id,
            changes: { capacity: null },
          },
        ],
      })
    ).outcome,
  ).toBe("APPLIED");
  expect(
    f.graph().trip_stay_rooms.find((r) => r.room_id === f.rooms[0].room_id)?.capacity,
  ).toBeNull();
  expect(
    (f.graph().itinerary_events[0].field_state as Record<string, unknown>)[
      `trip_stay_rooms.${f.rooms[0].room_id}.capacity`
    ],
  ).toMatchObject({ state: "CLEARED", origin: "MANUAL" });
  const added = { room_id: randomUUID(), category: null, quantity: 1, capacity: null };
  expect(
    (
      await edit({
        roomChanges: [
          { operation: "ADD", room: added },
          { operation: "REMOVE", room_id: f.rooms[1].room_id },
        ],
      })
    ).outcome,
  ).toBe("APPLIED");
  expect(
    f
      .graph()
      .trip_stay_rooms.map((r) => r.room_id)
      .sort(),
  ).toEqual([f.rooms[0].room_id, added.room_id].sort());
  expect(
    f.graph().trip_stay_rooms.find((r) => r.room_id === added.room_id),
  ).toMatchObject(added);
  expect(
    f.graph().trip_stay_rooms.find((r) => r.room_id === f.rooms[0].room_id)?.quantity,
  ).toBe(1);
});

it.each(["body_scope", "revision", "missing_room", "duplicate_room", "whole_rooms"])(
  "S2 rejects %s without dispatch",
  async (kind) => {
    const f = await sparseStayFixture(),
      base = structuredClone(await f.base());
    let change: unknown = {
      roomChanges: [
        { operation: "PATCH", room_id: f.rooms[0].room_id, changes: { capacity: 4 } },
      ],
    };
    if (kind === "body_scope")
      (base.record.body as Record<string, unknown>).trip_id = randomUUID();
    if (kind === "revision") base.record.revision++;
    if (kind === "missing_room")
      change = { roomChanges: [{ operation: "REMOVE", room_id: randomUUID() }] };
    if (kind === "duplicate_room")
      change = {
        roomChanges: [
          { operation: "REMOVE", room_id: f.rooms[0].room_id },
          { operation: "PATCH", room_id: f.rooms[0].room_id, changes: { capacity: 4 } },
        ],
      };
    if (kind === "whole_rooms") change = { details: { property_name: "New" }, rooms: [] };
    expect(() =>
      prepareSparseStayUpdate({ request_id: randomUUID(), base, change }),
    ).toThrow();
    expect(f.posts()).toBe(1);
  },
);

it.each([
  "base_drift",
  "hidden_state_drift",
  "payload_tamper",
  "missing_marker",
  "unavailable",
  "wrong_actor",
  "room_ids_tamper",
])("S2 live guard rejects %s before POST", async (kind) => {
  const f = await sparseStayFixture(),
    base = await f.base();
  const p = prepareSparseStayUpdate({
    request_id: randomUUID(),
    base,
    change: { details: { property_name: "New" } },
  });
  if (p.kind !== "ITEM") throw Error("ITEM_REQUIRED");
  if (kind === "base_drift") f.graph().trip_stay_rooms[1].capacity = 7;
  if (kind === "hidden_state_drift")
    (f.graph().itinerary_events[0].field_state as Record<string, { protected: boolean }>)[
      `trip_stay_rooms.${f.rooms[1].room_id}.category`
    ].protected = false;
  if (kind === "payload_tamper")
    (p.command.payload as { details: { property_name: string } }).details.property_name =
      "Forged";
  if (kind === "missing_marker") delete p.sparseStay;
  if (kind === "room_ids_tamper") p.sparseStay!.roomIds = [];
  const tools = createMutationTools({
    ...context(f.backend),
    ...(kind === "wrong_actor" ? { accountId: randomUUID() } : {}),
    read:
      kind === "unavailable" ? async () => new Response(null, { status: 503 }) : f.read,
    sparseStaySupported: true,
  });
  expect((await tools.execute(p, "PREVIEW")).outcome).toBe("REJECTED");
  expect(
    (await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest))
      .outcome,
  ).toBe("REJECTED");
  expect(f.posts()).toBe(1);
});

function fixture() {
  let graph: CoreGraph = emptyCoreGraph();
  const receipts = new Map<string, { domainReceiptId: string; receiptText: string }>();
  let posts = 0,
    lose = false,
    unavailable = false;
  const connection: CoreHttpConnection = {
    read: {
      collection: async () =>
        buildCoreActorCollection(
          graph,
          actor,
          {
            epoch: "00000000-0000-4000-8000-000000000010",
            revision: Math.max(
              1,
              ...graph.itinerary_events.map((r) => Number(r.semantic_revision)),
            ),
            accessRevision: 1,
            generatedAt: "2026-11-01T00:00:00Z",
          },
          [],
          async (bytes) => sha(bytes),
        ),
      item: async (_a, _t, id) => projectCoreItem(graph, actor, id),
    },
    hash: async (bytes) => sha(bytes),
    readOperation: async (a, t, id) => {
      const r = receipts.get(id);
      return a === account && t === trip && r
        ? {
            projection: "FULL",
            domainReceiptId: r.domainReceiptId,
            receipt: JSON.parse(r.receiptText),
          }
        : null;
    },
    commands: {
      async withLockedCommand(scope, work) {
        return work({
          actor: {
            ...actor,
            accountId: scope.actorAccountId,
            active: scope.actorAccountId === account,
          },
          readReceipt: async () => receipts.get(scope.operationId) ?? null,
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => true,
          enabledCommands: async () => [
            "CREATE_ITEM",
            "SET_ITEM_TEXT",
            "SET_ITEM_SCHEDULE",
            "CREATE_SPARSE_FLIGHT",
            "SET_AUTHORED_FLIGHT_DETAILS",
            "SET_ITEM_PLACE",
            "SET_ITEM_PARTICIPATION",
            "SET_STAY_DETAILS",
            "SET_RENTAL_DETAILS",
            "SET_ACTIVITY_DETAILS",
            "SET_TRANSPORT_DETAILS",
          ],
          readLockedGraph: async () => graph,
          verifyAdmission: async () => {},
          lifecycleGraphHash: async () => undefined,
          commit: async (mutation, receipt: CoreReceipt) => {
            if (mutation) graph = mutation.graph;
            const domainReceiptId = randomUUID();
            receipts.set(scope.operationId, {
              domainReceiptId,
              receiptText: JSON.stringify(receipt),
            });
            return domainReceiptId;
          },
        });
      },
    },
  };
  const backend: BackendMutation = async (q) => {
    if (q.method === "POST") posts++;
    if (unavailable) return new Response(null, { status: 503 });
    const r = await coreHttpBoundary(
      new Request("http://backend" + q.path, {
        method: q.method,
        headers: q.headers,
        body: q.body ? JSON.stringify(q.body) : undefined,
      }),
      account,
      async (a, t) => a === account && t === trip,
      connection,
    );
    if (lose && q.method === "POST") {
      lose = false;
      throw Error("SIMULATED_RESPONSE_LOSS");
    }
    return r;
  };
  return {
    backend,
    read: (path: string, signal: AbortSignal) => backend({ method: "GET", path }, signal),
    receipts,
    graph: () => graph,
    posts: () => posts,
    lose: () => (lose = true),
    unavailable: () => (unavailable = true),
  };
}
const create = (request = randomUUID()) => ({
  request_id: request,
  trip_id: trip,
  item: {
    family: "P3",
    title: "Synthetic Nelson Stay",
    dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
    property_name: "QA Lodge",
  },
});
const context = (
  backend: BackendMutation,
  confirm: ConfirmChanges = async () => true,
) => ({
  accountId: account,
  clientId: "qa-client",
  resource: "https://mcp.example.invalid/mcp",
  backend,
  confirm,
});
