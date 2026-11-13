import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
  type AuthProvider,
} from "@modelcontextprotocol/client";
import { createDevBackendHandler, type DevBackendGateway } from "../backend/src/app";
import { buildCoreActorCollection } from "../backend/src/tripCoreV2Collection";
import type { CoreHttpConnection } from "../backend/src/tripCoreV2Http";
import {
  coreDefaults,
  corePlaceSchema,
  itinerary_transport_servicesSchema,
} from "../src/domain/trip/tripCoreV2";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "../src/domain/trip/tripCoreV2Mutation";
import { coreDateBoundary } from "../src/domain/trip/tripCoreV2Temporal";
import { projectCoreItem } from "../src/domain/trip/tripCoreV2Views";
import { createReadTools } from "./read";
import { createMcpHandler } from "./server";
import { loopbackServer } from "./http";
import { itemSchema } from "./contract";

const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const a = randomUUID(),
  b = randomUUID(),
  trip = randomUUID(),
  privateTrip = randomUUID();
const now = "2026-10-29T00:00:00Z";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.restoreAllMocks();
});
function fixture() {
  const actor: CoreActor = {
    accountId: a,
    tripId: trip,
    active: true,
    personId: null,
    personIds: [],
    canManageShared: true,
  };
  let graph = emptyCoreGraph();
  const ids: string[] = [];
  const place = Object.fromEntries(
    Object.keys(corePlaceSchema.shape).map((k) => [k, null]),
  );
  const service = {
    ...Object.fromEntries(
      Object.keys(itinerary_transport_servicesSchema.shape)
        .filter((k) => !["trip_id", "event_id"].includes(k))
        .map((k) => [k, null]),
    ),
    service_key: "train",
    operator_namespace: "NAME",
    operator_issuer: "SUPPLIER",
    operator_value: "QA Rail",
    operator_literal: "QA Rail",
    service_number: "102",
    service_literal: "QA102",
    transport_subtype: "TRAIN",
    attribution: "UNSPECIFIED",
  };
  for (const family of ["P1", "P2", "P3", "P4", "P5", "P6"]) {
    const id = randomUUID();
    ids.push(id);
    const payload =
      family === "P2"
        ? {
            ...coreDefaults("organizer"),
            flightNumberLiteral: "NZ502",
            departureDate: "2026-11-02",
          }
        : {
            ...coreDefaults("organizer"),
            family,
            core: { title: family + " synthetic" },
            ...(family === "P5"
              ? {
                  service,
                  endpoints: {
                    origin: { time: coreDateBoundary("2026-11-02"), place },
                    destination: { time: coreDateBoundary("2026-11-03"), place },
                  },
                }
              : {
                  schedule: {
                    start: coreDateBoundary("2026-11-02"),
                    ...(["P3", "P4"].includes(family)
                      ? { end: coreDateBoundary("2026-11-04") }
                      : {}),
                  },
                }),
          };
    graph = applyCoreCommand(
      graph,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId: trip,
        command: family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload,
      },
      actor,
      now,
    ).graph;
  }
  graph.itinerary_events[0].visibility = "PRIVATE";
  const state = { epoch: randomUUID(), revision: 1, accessRevision: 1, generatedAt: now };
  const asActor = (account: string) => ({ ...actor, accountId: account });
  const gateway = {
    validateAccessToken: vi.fn(async (token: string) =>
      token === "a"
        ? { id: a, accountClass: "NORMAL_ACCOUNT" }
        : token === "b"
          ? { id: b, accountClass: "NORMAL_ACCOUNT" }
          : null,
    ),
    canReadTrip: vi.fn(
      async (account: string, t: string) =>
        t === trip || (account === a && t === privateTrip),
    ),
    discoverTrips: vi.fn(
      async (account: string, cursor: string | null, limit: number) => {
        const trips = [trip, ...(account === a ? [privateTrip] : [])]
          .sort()
          .filter((id) => !cursor || id > cursor);
        return {
          trips: trips.slice(0, limit).map((id) => ({
            id,
            name: "Synthetic",
            destination: null,
            startDate: "2026-11-02",
            endDate: "2026-11-04",
            createdAt: now,
          })),
          nextCursor: trips.length > limit ? trips[limit - 1] : null,
        };
      },
    ),
  } as unknown as DevBackendGateway;
  const commands = {
    mutate: vi.fn(() => {
      throw Error("MUTATION_FORBIDDEN");
    }),
  };
  const connection = {
    hash,
    commands,
    read: {
      collection: async (account: string) =>
        buildCoreActorCollection(graph, asActor(account), state, [], hash),
      item: async (account: string, t: string, id: string) =>
        t === trip ? projectCoreItem(graph, asActor(account), id) : null,
    },
  } as unknown as CoreHttpConnection;
  const backend = createDevBackendHandler({ gateway, coreConnection: connection });
  const seen: string[] = [];
  const read =
    (token = "a") =>
    async (path: string, signal: AbortSignal) => {
      seen.push(path);
      return backend(
        new Request("http://backend" + path, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        }),
      );
    };
  return { actor, graph, ids, state, gateway, commands, read, seen };
}
async function protocol(
  f = fixture(),
  token = "a",
  clientName = "test-client",
  tokenLifetimeMs = 60000,
  authProvider?: AuthProvider,
  taskAssistant = false,
) {
  let handle: ReturnType<typeof createMcpHandler>;
  const server = loopbackServer((r) => handle(r));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("PORT");
  const resource = `http://127.0.0.1:${address.port}/mcp`;
  const logs: unknown[] = [];
  handle = createMcpHandler({
    resource,
    taskAssistant,
    log: (event) => logs.push(event),
    authorize: async (request) => {
      const credential =
        request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
      const user = await f.gateway.validateAccessToken(credential);
      return user
        ? {
            accountId: user.id,
            resource,
            scopes: ["otr.trips.read"],
            expiresAt: Date.now() + tokenLifetimeMs,
            read: f.read(credential),
          }
        : null;
    },
  });
  const client = new Client({ name: clientName, version: "1" });
  cleanup.push(async () => {
    await client.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      ...(authProvider
        ? { authProvider }
        : { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
    }),
  );
  return { client, resource, logs, f };
}
function structured(result: unknown): Record<string, unknown> {
  const r = result as {
    structuredContent?: Record<string, unknown>;
    result?: Record<string, unknown>;
  };
  return r.structuredContent ?? r.result ?? {};
}
it("Item capability projection does not replace the actual mutation authority", async () => {
  const f = fixture(), id = f.ids[2];
  f.graph.itinerary_events[2].visibility = "PRIVATE";
  const read = await createReadTools(a, f.read()).get_trip_item({
    trip_id: trip, item_id: id,
  });
  expect(read.item.capabilities).toEqual(projectCoreItem(f.graph, f.actor, id)!.capabilities);
  const command = {
    contractVersion: 2, intentVersion: 2, operationId: randomUUID(), tripId: trip,
    command: "SET_ITEM_TEXT", target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { description: "Synthetic authorized Notes" },
  };
  const applied = applyCoreCommand(f.graph, command, f.actor, now);
  expect(applied.graph.itinerary_events[2].description).toBe(command.payload.description);
  expect(f.graph.itinerary_events[2].semantic_revision).toBe(1);
  for (const actor of [{ ...f.actor, accountId: b }, { ...f.actor, active: false }])
    expect(() => applyCoreCommand(f.graph, command, actor, now)).toThrow();
  const shared = structuredClone(f.graph);
  shared.itinerary_events[2].visibility = "GROUP";
  const viewer = { ...f.actor, accountId: b, canManageShared: false };
  expect(projectCoreItem(shared, viewer, id)).not.toBeNull();
  expect(() => applyCoreCommand(shared, command, viewer, now)).toThrow("NOT_VISIBLE");
});
it("Phase4B edit base retains lawful raw address/identity/field state without undoing Backend evidence redaction", async () => {
  const f = fixture(),
    row = f.graph.itinerary_events[0];
  row.authored_address_line2 = "Unit7";
  row.authored_address_postal_code = "QA7000";
  row.accepted_place_id = randomUUID();
  row.field_state = {
    ...(row.field_state as object),
    "itinerary_events.title": {
      state: "KNOWN",
      origin: "SOURCE",
      protected: false,
      changed_revision: 1,
      evidence_ref: "private-source-not-authorized",
    },
  };
  const read = createReadTools(a, f.read());
  const result = await read.get_trip_item_edit_base({ trip_id: trip, item_id: f.ids[0] });
  const body = result.record.body as Record<string, unknown>;
  expect(body).toMatchObject({
    authored_address_line2: "Unit7",
    authored_address_postal_code: "QA7000",
    accepted_place_id: row.accepted_place_id,
  });
  expect(
    (body.field_state as Record<string, unknown>)["itinerary_events.title"],
  ).toMatchObject({ origin: "SOURCE", evidence_ref: null });
  expect(result.evidence_visibility).toBe(
    "BACKEND_AUTHORIZED_REDACTED_NOT_PROOF_OF_ABSENCE",
  );
  expect(JSON.stringify(result)).not.toContain("private-source-not-authorized");
  await expect(
    createReadTools(b, f.read("b")).get_trip_item_edit_base({
      trip_id: trip,
      item_id: f.ids[0],
    }),
  ).rejects.toThrow("NOT_VISIBLE");
});
it("P3 Item and edit-base reads share the same actor and preserve the same DTO", async () => {
  const f = fixture();
  f.graph.itinerary_events[2].visibility = "PRIVATE";
  const read = createReadTools(a, f.read());
  const args = { trip_id: trip, item_id: f.ids[2] };
  const view = await read.get_trip_item(args);
  const base = await read.get_trip_item_edit_base(args);
  expect(view.item.family).toBe("P3");
  expect(base.item).toEqual(view.item);
  expect(base.record.revision).toBe(view.item.itemRevision);
  expect(f.seen).toEqual([
    `/v2/trips/${trip}/core/objects/ITEM/${f.ids[2]}`,
    `/v2/trips/${trip}/core/collection`,
    `/v2/trips/${trip}/core/objects/ITEM/${f.ids[2]}`,
  ]);
  expect(f.commands.mutate).not.toHaveBeenCalled();
});
it("real SDK HTTP discovery and four read-only tool calls use owning Backend boundaries", async () => {
  const p = await protocol();
  const tools = await p.client.listTools();
  expect(tools.tools.map((t) => t.name).sort()).toEqual([
    "get_trip",
    "get_trip_item",
    "list_trip_items",
    "list_trips",
  ]);
  expect(
    tools.tools.every(
      (t) => t.annotations?.readOnlyHint && !t.annotations.destructiveHint,
    ),
  ).toBe(true);
  for (const [name, args] of [
    ["list_trips", {}],
    ["get_trip", { trip_id: trip }],
    ["list_trip_items", { trip_id: trip }],
    ["get_trip_item", { trip_id: trip, item_id: p.f.ids[1] }],
  ] as const) {
    const result = await p.client.callTool({ name, arguments: args });
    expect(result).not.toHaveProperty("isError", true);
    expect(structured(result)).toMatchObject({
      version: "otr.mcp.read/1",
      state: "SERVER_CONFIRMED",
    });
  }
  expect(p.f.seen.every((path) => /^\/v2\/trips/.test(path))).toBe(true);
  expect(p.f.commands.mutate).not.toHaveBeenCalled();
  expect(JSON.stringify(p.logs)).not.toContain("Synthetic");
  expect(Object.keys(p.logs[0] as object).sort()).toEqual([
    "durationMs",
    "requestId",
    "status",
  ]);
});
it("keeps all six typed projections, sparse flight and date-only boundaries without internal fields", async () => {
  const f = fixture();
  const before = JSON.stringify(f.graph);
  const result = await createReadTools(a, f.read()).list_trip_items({ trip_id: trip });
  expect(new Set(result.items.map((i) => i.family))).toEqual(
    new Set(["P1", "P2", "P3", "P4", "P5", "P6"]),
  );
  expect(result.items.find((i) => i.family === "P2")?.flight).toMatchObject({
    qualification: "SPARSE",
    flightNumberLiteral: "NZ502",
  });
  expect(
    result.items.find((i) => i.family === "P5")?.transportServices?.[0],
  ).toHaveProperty("transportSubtype", "TRAIN");
  expect(
    result.items.every((i) => i.view === "SUMMARY" && i.detail.tool === "get_trip_item"),
  ).toBe(true);
  const tools = createReadTools(a, f.read());
  const flight = (
    await tools.get_trip_item({
      trip_id: trip,
      item_id: result.items.find((i) => i.family === "P2")!.itemId,
    })
  ).item;
  expect(flight.details).toMatchObject({
    qualification: "SPARSE",
    flightNumberLiteral: "NZ502",
  });
  expect(JSON.stringify(result)).not.toContain("owner_account_id");
  expect(JSON.stringify(result)).not.toContain("field_state");
  expect(JSON.stringify(result)).not.toContain("personIds");
  expect(JSON.stringify(flight)).not.toContain("instant");
  expect(JSON.stringify(f.graph)).toBe(before);
  expect(itemSchema.parse({ ...flight, privateSecret: "redact" })).not.toHaveProperty(
    "privateSecret",
  );
});
it("enforces real Backend Trip + Item ACL, cross-Trip IDs and client-independent identity", async () => {
  const f = fixture(),
    tools = createReadTools(b, f.read("b"));
  await expect(tools.get_trip({ trip_id: privateTrip })).rejects.toThrow("NOT_VISIBLE");
  await expect(tools.get_trip_item({ trip_id: trip, item_id: f.ids[0] })).rejects.toThrow(
    "NOT_VISIBLE",
  );
  await expect(
    tools.get_trip_item({ trip_id: privateTrip, item_id: f.ids[1] }),
  ).rejects.toThrow("NOT_VISIBLE");
  expect((await tools.list_trip_items({ trip_id: trip })).items).toHaveLength(5);
  const p = await protocol(f, "b", "different-client");
  const result = await p.client.callTool({
    name: "get_trip_item",
    arguments: { trip_id: trip, item_id: f.ids[0] },
  });
  expect(JSON.stringify(result)).toContain("NOT_VISIBLE");
  expect(JSON.stringify(result)).not.toContain("P1 synthetic");
  expect(p.logs).toContainEqual(
    expect.objectContaining({
      tool: "get_trip_item",
      errorCode: "NOT_VISIBLE",
      status: 200,
    }),
  );
});
it.each(["BACKEND_401", "EXPIRED_AFTER_BACKEND"] as const)(
  "logs only the observed Read auth source %s while retaining the public challenge",
  async (source) => {
    const f = fixture(),
      read = f.read;
    const realNow = Date.now.bind(Date);
    f.read = (token) => async (path, signal) => {
      if (source === "BACKEND_401")
        return new Response("private upstream diagnostic", { status: 401 });
      const response = await read(token)(path, signal);
      vi.spyOn(Date, "now").mockReturnValue(realNow() + 2000);
      return response;
    };
    const p = await protocol(f, "a", "test-client", 1000);
    const response = await fetch(p.resource, {
      method: "POST",
      headers: {
        Authorization: "Bearer a",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_trip_item",
          arguments: { trip_id: trip, item_id: f.ids[1] },
        },
      }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect(await response.json()).toEqual({ error: "AUTH_REQUIRED" });
    const event = p.logs.find(
      (value) => (value as { tool?: string }).tool === "get_trip_item",
    );
    expect(event).toEqual({
      requestId: expect.any(String),
      status: 401,
      durationMs: expect.any(Number),
      tool: "get_trip_item",
      errorCode: "AUTH_REQUIRED",
      authFailureSource: source,
    });
    for (const secret of [a, trip, f.ids[1], "private upstream diagnostic", "Synthetic"])
      expect(JSON.stringify(event)).not.toContain(secret);
  },
);
it.each([true, false])("SDK refreshes once for edit-base second-read rejection (recovers=%s)", async (recovers) => {
  const f = fixture();
  f.graph.itinerary_events[2].visibility = "PRIVATE";
  const read = f.read;
  const validate = f.gateway.validateAccessToken.bind(f.gateway);
  f.gateway.validateAccessToken = vi.fn((token) =>
    validate(token === "a-refreshed" ? "a" : token),
  );
  const backendRead = vi.fn(async (token: string, path: string, signal: AbortSignal) => {
    const response = await read("a")(path, signal);
    if (path.endsWith(`/ITEM/${f.ids[2]}`) && (token === "a" || !recovers)) {
      // Model the observed Auth rejection after a successful owning Item read.
      expect(response.status).toBe(200);
      await response.body?.cancel();
      return new Response(null, { status: 401 });
    }
    return response;
  });
  f.read = (token = "a") => (path, signal) => backendRead(token, path, signal);
  let credential = "a";
  const onUnauthorized = vi.fn(async ({ response }: { response: Response }) => {
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    credential = "a-refreshed";
  });
  const p = await protocol(f, "a", "test-client", 60000, {
    token: async () => credential,
    onUnauthorized,
  }, true);
  const call = p.client.callTool({
    name: "get_trip_item_edit_base",
    arguments: { trip_id: trip, item_id: f.ids[2] },
  });
  if (recovers) {
    const result = await call;
    expect(result.isError).not.toBe(true);
    expect(structured(result).item).toMatchObject({ itemId: f.ids[2], family: "P3" });
  } else await expect(call).rejects.toThrow();
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
  expect(backendRead).toHaveBeenCalledTimes(4);
  expect(f.seen).toEqual([
    `/v2/trips/${trip}/core/collection`,
    `/v2/trips/${trip}/core/objects/ITEM/${f.ids[2]}`,
    `/v2/trips/${trip}/core/collection`,
    `/v2/trips/${trip}/core/objects/ITEM/${f.ids[2]}`,
  ]);
  expect(f.commands.mutate).not.toHaveBeenCalled();
});
it("SDK refreshes once on ingress HTTP 401 before dispatching a read", async () => {
  let credential = "a";
  const onUnauthorized = vi.fn(async ({ response }: { response: Response }) => {
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    credential = "a";
  });
  const p = await protocol(fixture(), "a", "test-client", 60000, {
    token: async () => credential,
    onUnauthorized,
  });
  credential = "invalid-after-connection";
  const result = await p.client.callTool({
    name: "get_trip_item",
    arguments: { trip_id: trip, item_id: p.f.ids[1] },
  });
  expect(result.isError).not.toBe(true);
  expect(structured(result).item).toMatchObject({ itemId: p.f.ids[1] });
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
  expect(p.f.commands.mutate).not.toHaveBeenCalled();
});
it("date overlap, inclusive single day, empty range, UUID pagination and snapshot drift", async () => {
  const f = fixture(),
    tools = createReadTools(a, f.read());
  const first = await tools.list_trip_items({
    trip_id: trip,
    limit: 2,
    date_from: "2026-11-02",
  });
  expect(first.items).toHaveLength(2);
  expect(first.next_cursor).not.toBeNull();
  const next = await tools.list_trip_items({
    trip_id: trip,
    limit: 2,
    date_from: "2026-11-02",
    cursor: first.next_cursor,
  });
  expect(next.items.every((i) => !first.items.some((j) => i.itemId === j.itemId))).toBe(
    true,
  );
  expect(
    (await tools.list_trip_items({ trip_id: trip, date_from: "2026-11-03" })).items
      .map((i) => i.family)
      .sort(),
  ).toEqual(["P3", "P4", "P5"]);
  expect(
    (await tools.list_trip_items({ trip_id: trip, date_from: "2027-01-01" })).items,
  ).toEqual([]);
  f.state.accessRevision++;
  await expect(
    tools.list_trip_items({
      trip_id: trip,
      date_from: "2026-11-02",
      cursor: first.next_cursor,
    }),
  ).rejects.toThrow("STALE_CURSOR");
  await expect(
    tools.list_trip_items({ trip_id: trip, cursor: "garbage" }),
  ).rejects.toThrow("INVALID_INPUT");
});
it.each([
  { account_id: b },
  { trip_id: trip, date_from: "2026-02-30" },
  { trip_id: trip, date_from: "2026-11-04", date_to: "2026-11-02" },
  { trip_id: trip, date_to: "2026-11-02" },
  { trip_id: trip, limit: 26 },
])("rejects invalid tool arguments before Backend: %j", async (args) => {
  const f = fixture();
  await expect(createReadTools(a, f.read()).list_trip_items(args)).rejects.toThrow();
  expect(f.seen).toEqual([]);
});
it("missing Item, malformed/foreign collection, closed Backend and timeout never disclose diagnostics", async () => {
  const f = fixture();
  await expect(
    createReadTools(a, f.read()).get_trip_item({ trip_id: trip, item_id: randomUUID() }),
  ).rejects.toThrow("NOT_VISIBLE");
  await expect(
    createReadTools(a, f.read("invalid")).get_trip_item({
      trip_id: trip,
      item_id: f.ids[1],
    }),
  ).rejects.toThrow("AUTH_REQUIRED");
  await expect(
    createReadTools(
      a,
      async () => new Response("private internals", { status: 503 }),
    ).get_trip({ trip_id: trip }),
  ).rejects.toThrow("BACKEND_UNAVAILABLE");
  await expect(
    createReadTools(b, f.read("a")).list_trip_items({ trip_id: trip }),
  ).rejects.toThrow("CORE_READ_SCOPE_MISMATCH");
  vi.useFakeTimers();
  try {
    const pending = createReadTools(
      a,
      async () => new Promise<Response>(() => {}),
    ).get_trip({ trip_id: trip });
    const assertion = expect(pending).rejects.toThrow("BACKEND_TIMEOUT");
    await vi.advanceTimersByTimeAsync(50001);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});
it("allows measured slow Core reads and still honors caller cancellation", async () => {
  const f = fixture();
  vi.useFakeTimers();
  try {
    const read = f.read();
    const tools = createReadTools(a, async (path, signal) => {
      await new Promise((resolve) => setTimeout(resolve, 13554));
      return read(path, signal);
    });
    const pending = tools.get_trip_item({ trip_id: trip, item_id: f.ids[1] });
    await vi.advanceTimersByTimeAsync(13555);
    expect(await pending).toHaveProperty("item");
    const controller = new AbortController();
    const cancelled = createReadTools(
      a,
      async () => new Promise<Response>(() => {}),
      controller.signal,
    ).get_trip_item({ trip_id: trip, item_id: f.ids[1] });
    const rejected = expect(cancelled).rejects.toThrow("BACKEND_TIMEOUT");
    controller.abort();
    await rejected;
  } finally {
    vi.useRealTimers();
  }
});
it("empty accepted Trip, discovery pagination, and single-snapshot list stay bounded", async () => {
  const f = fixture(),
    tools = createReadTools(a, f.read());
  expect((await tools.list_trips({ limit: 1 })).next_cursor).not.toBeNull();
  f.graph.itinerary_events.length = 0;
  for (const table of Object.keys(f.graph) as (keyof typeof f.graph)[])
    f.graph[table] = [];
  expect((await tools.list_trip_items({ trip_id: trip })).items).toEqual([]);
  const f2 = fixture();
  const read = f2.read();
  const r = createReadTools(a, async (path, signal) => {
    if (path.includes("/objects/"))
      f2.graph.itinerary_events.forEach((item) => (item.semantic_revision = 2));
    return read(path, signal);
  });
  expect((await r.list_trip_items({ trip_id: trip })).items).toHaveLength(6);
  expect(f2.seen).toEqual(["/v2/trips/" + trip + "/core/collection"]);
});
it("default-closed auth rejects missing/expired/wrong resource/scope, Origin and oversized input", async () => {
  const resource = "http://localhost/mcp",
    f = fixture();
  const request = (headers: Record<string, string> = {}, body = "{}") =>
    new Request(resource, { method: "POST", headers, body });
  expect((await createMcpHandler({ resource })(request())).status).toBe(401);
  const base = {
    accountId: a,
    resource,
    scopes: ["otr.trips.read"],
    expiresAt: Date.now() + 60000,
    read: f.read(),
  };
  for (const auth of [
    { ...base, expiresAt: 0 },
    { ...base, resource: "https://wrong/mcp" },
    null,
  ]) {
    expect(
      (await createMcpHandler({ resource, authorize: async () => auth })(request()))
        .status,
    ).toBe(401);
  }
  const handle = createMcpHandler({ resource, authorize: async () => base });
  expect(
    (
      await createMcpHandler({
        resource,
        authorize: async () => ({ ...base, scopes: [] }),
      })(request())
    ).status,
  ).toBe(403);
  expect((await handle(request({ Origin: "https://evil.example" }))).status).toBe(403);
  expect((await handle(request({}, "x".repeat(16385)))).status).toBe(413);
  expect(f.seen).toEqual([]);
});
