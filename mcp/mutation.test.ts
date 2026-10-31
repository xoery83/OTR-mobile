import { tripCreateBoundary } from "../backend/src/tripCreate";
import { buildCoreActorCollection } from "../backend/src/tripCoreV2Collection";
import { verifyGoldenReadback } from "./goldenReadback";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "./server";
import { loopbackServer } from "./http";
import { projectCoreItem } from "../src/domain/trip/tripCoreV2Views";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "../src/domain/trip/tripCoreV2Mutation";
import { coreHttpBoundary, type CoreHttpConnection } from "../backend/src/tripCoreV2Http";
import type { CoreReceipt } from "../src/domain/trip/tripCoreV2Receipt";
import {
  createMutationTools,
  prepareCreate,
  prepareTrip,
  mutationIdentity,
  sha,
  type BackendMutation,
  type ConfirmChanges,
} from "./mutation";
import { createBatchTools } from "./batch";
import type { createReadTools } from "./read";
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
function fixture() {
  let graph: CoreGraph = emptyCoreGraph();
  const receipts = new Map<string, { domainReceiptId: string; receiptText: string }>();
  let posts = 0,
    lose = false,
    unavailable = false;
  const connection: CoreHttpConnection = {
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
it("preview never writes, missing trusted confirmation and model confirmed flag cannot submit", async () => {
  const f = fixture(),
    tools = createMutationTools({ ...context(f.backend), confirm: undefined });
  const p = tools.prepareCreate(create()),
    preview = await tools.execute(p, "PREVIEW");
  expect(preview.outcome).toBe("PREVIEW");
  expect(f.posts()).toBe(0);
  expect((await tools.execute(p, "APPLY", preview.preview_digest)).outcome).toBe(
    "NEEDS_CONFIRMATION",
  );
  expect(() => tools.prepareCreate({ ...create(), confirmed: true })).toThrow();
  expect(f.posts()).toBe(0);
  expect((await tools.execute(p, "APPLY", "a".repeat(64))).outcome).toBe("REJECTED");
});
it("owning P3 create/edit receipts, stable replay, lost response recovery and CAS conflict", async () => {
  const f = fixture(),
    confirm = vi.fn(async () => true),
    tools = createMutationTools(context(f.backend, confirm)),
    q = create();
  const p = tools.prepareCreate(q),
    identity = mutationIdentity(account, p);
  const result = await tools.execute(p, "APPLY", identity.preview_digest);
  expect(result).toMatchObject({
    outcome: "APPLIED",
    current_revision: 1,
    item_id: identity.item_id,
  });
  expect(f.graph().itinerary_events).toHaveLength(1);
  expect(prepareCreate(account, q)).toEqual(p);
  expect((await tools.execute(p, "APPLY", identity.preview_digest)).outcome).toBe(
    "APPLIED",
  );
  expect(f.posts()).toBe(1);
  const edit = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: identity.item_id,
    expected_revision: 1,
    change: { kind: "TEXT", title: "Nelson QA edited" },
  });
  f.lose();
  expect(
    (await tools.execute(edit, "APPLY", mutationIdentity(account, edit).preview_digest))
      .outcome,
  ).toBe("UNKNOWN");
  expect(
    await tools.execute(edit, "APPLY", mutationIdentity(account, edit).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 2 });
  expect(f.posts()).toBe(2);
  const stale = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: identity.item_id,
    expected_revision: 1,
    change: { kind: "TEXT", title: "must not overwrite" },
  });
  expect(
    (await tools.execute(stale, "APPLY", mutationIdentity(account, stale).preview_digest))
      .outcome,
  ).toBe("CONFLICT");
  expect(f.graph().itinerary_events[0].title).toBe("Nelson QA edited");
  expect(await tools.get_operation_status(result.query)).toMatchObject({
    outcome: "APPLIED",
    current_revision: 1,
  });
});
it("allows a bounded slow receipt read before a single controlled POST", async () => {
  const f = fixture();
  vi.useFakeTimers();
  try {
    const tools = createMutationTools(
      context(async (q, signal) => {
        if (q.method === "GET")
          await new Promise((resolve) => setTimeout(resolve, 20000));
        return f.backend(q, signal);
      }),
    );
    const p = tools.prepareCreate(create());
    const pending = tools.execute(
      p,
      "APPLY",
      mutationIdentity(account, p).preview_digest,
    );
    await vi.advanceTimersByTimeAsync(20001);
    expect((await pending).outcome).toBe("APPLIED");
    expect(f.posts()).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});
it("rejects receipt identity drift and preserves UNKNOWN while owning recovery is unavailable", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend)),
    p = tools.prepareCreate(create());
  f.unavailable();
  expect(
    (await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest))
      .outcome,
  ).toBe("UNKNOWN");
  expect(f.posts()).toBe(0);
  const drift = createMutationTools(
    context(async () =>
      Response.json({
        projection: "FULL",
        domainReceiptId: randomUUID(),
        receipt: { actorAccountId: randomUUID() },
      }),
    ),
  );
  expect(
    await drift.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({ outcome: "UNKNOWN", error_code: "RECEIPT_UNVERIFIED" });
});
it("three-day Nelson batch preview, exact confirmation, partial response loss and resume reuse the successful prefix", async () => {
  const f = fixture(),
    ctx = context(f.backend),
    tools = createMutationTools(ctx);
  const reads = {
    list_trip_items: async () => ({ items: [], next_cursor: null }),
  } as unknown as ReturnType<typeof createReadTools>;
  const batch = createBatchTools(ctx, tools, reads),
    changes = [10, 11, 12].map((day) => ({
      kind: "CREATE",
      request_id: randomUUID(),
      item: {
        family: "P3",
        title: `QA Nelson day ${day}`,
        dates: { start_date: `2026-12-${day}`, end_date: `2026-12-${day + 1}` },
      },
    }));
  const plan = { trip_id: trip, changes },
    preview = await batch.preview_trip_changes(plan);
  expect(preview.operations).toHaveLength(3);
  expect(f.posts()).toBe(0);
  f.lose();
  const partial = await batch.apply_trip_changes({
    ...plan,
    preview_digest: preview.preview_digest,
  });
  expect(partial.outcome).toBe("PARTIAL");
  expect(f.posts()).toBe(1);
  expect(partial.operations[1]).toHaveProperty("error_code", "NOT_SUBMITTED_AFTER_STOP");
  const done = await batch.apply_trip_changes({
    ...plan,
    preview_digest: preview.preview_digest,
  });
  expect(done.outcome).toBe("APPLIED");
  expect(f.posts()).toBe(3);
  expect(f.graph().itinerary_events).toHaveLength(3);
  expect(
    (await batch.apply_trip_changes({ ...plan, preview_digest: preview.preview_digest }))
      .outcome,
  ).toBe("APPLIED");
  expect(f.posts()).toBe(3);
  const changed = {
    ...plan,
    changes: [
      { ...changes[0], item: { ...changes[0].item, title: "different" } },
      ...changes.slice(1),
    ],
  };
  expect(
    (
      await batch.apply_trip_changes({
        ...changed,
        preview_digest: preview.preview_digest,
      })
    ).outcome,
  ).toBe("REJECTED");
  expect(f.posts()).toBe(3);
});
it("Trip create uses structured destinations with stable independent IDs", () => {
  const q = {
    request_id: randomUUID(),
    name: "Synthetic Nelson QA",
    destinations: ["Nelson", "Abel Tasman"],
    dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
  };
  expect(prepareTrip(account, q)).toEqual(prepareTrip(account, q));
  const p = prepareTrip(account, q);
  expect(p.command).toHaveProperty("formatVersion", 2);
  expect(p.command).toHaveProperty("destination", null);
});

it("recovers an accepted UPDATE before stale-revision checks when resuming its batch", async () => {
  const f = fixture(),
    ctx = context(f.backend),
    tools = createMutationTools(ctx);
  const createP = tools.prepareCreate(create()),
    created = await tools.execute(
      createP,
      "APPLY",
      mutationIdentity(account, createP).preview_digest,
    );
  const reads = {
    list_trip_items: async () => ({ items: [], next_cursor: null }),
    get_trip_item: async () => ({
      item: { itemRevision: f.graph().itinerary_events[0].semantic_revision },
    }),
  } as unknown as ReturnType<typeof createReadTools>;
  const batch = createBatchTools(ctx, tools, reads);
  const plan = {
    trip_id: trip,
    changes: [
      {
        kind: "UPDATE",
        request_id: randomUUID(),
        item_id: created.item_id,
        expected_revision: 1,
        change: { kind: "TEXT", title: "QA updated", notes: "All notes must be visible" },
      },
      { kind: "CREATE", ...create(), trip_id: undefined },
    ],
  };
  delete (plan.changes[1] as { trip_id?: string }).trip_id;
  const preview = await batch.preview_trip_changes(plan);
  f.lose();
  expect(
    (await batch.apply_trip_changes({ ...plan, preview_digest: preview.preview_digest }))
      .outcome,
  ).toBe("PARTIAL");
  expect(
    (await batch.apply_trip_changes({ ...plan, preview_digest: preview.preview_digest }))
      .outcome,
  ).toBe("APPLIED");
  expect(f.graph().itinerary_events).toHaveLength(2);
  expect(f.posts()).toBe(3);
});
it("trusted approval summary contains every written note, place, property and date", () => {
  const q = {
    ...create(),
    item: {
      ...create().item,
      notes: "Private note",
      place: "Authored only place",
      property_name: "QA Lodge",
    },
  };
  const prepared = prepareCreate(account, q);
  for (const value of [
    q.item.notes,
    q.item.place,
    q.item.property_name,
    q.item.dates.start_date,
    q.item.dates.end_date,
  ])
    expect(prepared.summary).toContain(value);
});
it("date-only edit cannot erase an existing clock, zone or qualified instant", async () => {
  const f = fixture();
  let readCount = 0;
  const ctx = {
    ...context(f.backend),
    read: async () => {
      readCount++;
      return Response.json({
        itemId: itemId,
        tripId: trip,
        itemRevision: 1,
        family: "P3",
        title: "Timed stay",
        status: "planned",
        hidden: false,
        visibility: "PRIVATE",
        localState: "ACCEPTED",
        schedule: {
          shape: "SPAN",
          start: {
            comparable: true,
            localDate: "2026-12-10",
            localTime: "18:00:00",
            zoneId: "Pacific/Auckland",
            instant: "2026-12-10T05:00:00Z",
          },
          end: { comparable: false, localDate: "2026-12-12" },
        },
        details: { rooms: [], nights: 2 },
      });
    },
  };
  const itemId = randomUUID(),
    tools = createMutationTools(ctx);
  const p = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: itemId,
    expected_revision: 1,
    change: {
      kind: "DATES",
      dates: { start_date: "2026-12-11", end_date: "2026-12-13" },
    },
  });
  expect(await tools.execute(p, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "DATE_EDIT_REQUIRES_OWNING_TEMPORAL_ADAPTER",
  });
  expect(
    await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({
    outcome: "REJECTED",
    error_code: "DATE_EDIT_REQUIRES_OWNING_TEMPORAL_ADAPTER",
  });
  expect(readCount).toBe(2);
  expect(f.posts()).toBe(0);
});

it("edits canonical date-only P3 boundaries while preserving receipt replay", async () => {
  const f = fixture();
  const tools = createMutationTools({
    ...context(f.backend),
    read: async () =>
      Response.json(
        projectCoreItem(f.graph(), actor, f.graph().itinerary_events[0].id as string),
      ),
  });
  const createP = tools.prepareCreate(create());
  const created = await tools.execute(
    createP,
    "APPLY",
    mutationIdentity(account, createP).preview_digest,
  );
  const p = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    change: {
      kind: "DATES",
      dates: { start_date: "2026-12-11", end_date: "2026-12-13" },
    },
  });
  expect((await tools.execute(p, "PREVIEW")).outcome).toBe("PREVIEW");
  expect(
    await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 2 });
  expect(f.graph().itinerary_events[0].start_local_date).toBe("2026-12-11");
});

it("standard MCP HTTP client discovers controlled tools and applies only after trusted host confirmation", async () => {
  const f = fixture();
  let handle: ReturnType<typeof createMcpHandler>;
  const server = loopbackServer((r) => handle(r));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("PORT");
  const resource = `http://127.0.0.1:${addr.port}/mcp`;
  const approved = new Set<string>();
  handle = createMcpHandler({
    resource,
    authorize: async () => ({
      accountId: account,
      clientId: "qa",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: async () => Response.json({}),
      backend: f.backend,
    }),
    confirm: async (q) => approved.has(q.digest),
  });
  const client = new Client({ name: "controlled-write-qa", version: "1" });
  const content = (r: unknown) => {
    const x = r as {
      structuredContent?: Record<string, unknown>;
      result?: Record<string, unknown>;
    };
    return x.structuredContent ?? x.result ?? {};
  };
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
    const listed = await client.listTools();
    expect(
      listed.tools.find((t) => t.name === "create_trip_item")?.annotations?.readOnlyHint,
    ).toBe(false);
    const q = create();
    const preview = content(
      await client.callTool({ name: "create_trip_item", arguments: q }),
    );
    expect(preview.outcome).toBe("PREVIEW");
    expect(f.posts()).toBe(0);
    const request = { ...q, mode: "APPLY", preview_digest: preview.preview_digest };
    expect(
      content(await client.callTool({ name: "create_trip_item", arguments: request }))
        .outcome,
    ).toBe("NEEDS_CONFIRMATION");
    expect(f.posts()).toBe(0);
    approved.add(preview.preview_digest as string);
    const saved = content(
      await client.callTool({ name: "create_trip_item", arguments: request }),
    );
    expect(saved.outcome).toBe("APPLIED");
    expect(f.posts()).toBe(1);
    expect(
      content(
        await client.callTool({
          name: "get_operation_status",
          arguments: saved.query as Record<string, unknown>,
        }),
      ).outcome,
    ).toBe("APPLIED");
  } finally {
    await client.close().catch(() => {});
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("independent DB verification rejects wrong business fields and separates historical receipt evidence", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend)),
    p = tools.prepareCreate({
      ...create(),
      item: { ...create().item, title: "Stay 2026-12-10T12:00:00Z" },
    });
  const result = await tools.execute(
    p,
    "APPLY",
    mutationIdentity(account, p).preview_digest,
  );
  const record = f.receipts.get(result.operation_id)!;
  const row = structuredClone(f.graph().itinerary_events[0]);
  const raw = {
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: [row],
          stay: f.graph().trip_stay_details[0],
          receipt: JSON.parse(record.receiptText),
        },
      },
    ],
  };
  expect(await verifyGoldenReadback(raw, p, account)).toHaveProperty(
    "status",
    "SERVER_VERIFIED",
  );
  row.title = "Changed 2026-12-10T12:00:00Z";
  await expect(verifyGoldenReadback(raw, p, account)).rejects.toThrow(
    "INDEPENDENT_BUSINESS_FIELD_MISMATCH:title",
  );
  row.semantic_revision = 2;
  expect(await verifyGoldenReadback(raw, p, account)).toHaveProperty(
    "status",
    "HISTORICAL_RECEIPT_VERIFIED_CURRENT_ADVANCED",
  );
});

it("returns a partial receipt before the HTTP deadline after a slow accepted prefix", async () => {
  const f = fixture(),
    resource = "https://mcp.example.invalid/mcp";
  let lookup = 0;
  const handle = createMcpHandler({
    resource,
    authorize: async () => ({
      accountId: account,
      clientId: "qa",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 120000,
      read: async () =>
        Response.json(
          await buildCoreActorCollection(
            f.graph(),
            actor,
            {
              epoch: trip,
              revision: 1,
              accessRevision: 1,
              generatedAt: new Date().toISOString(),
            },
            [],
            async (bytes) => sha(bytes),
          ),
        ),
      backend: async (q, signal) => {
        if (q.method === "GET") {
          lookup++;
          if (lookup === 1) await new Promise((resolve) => setTimeout(resolve, 20000));
          else return new Promise<Response>(() => {});
        }
        return f.backend(q, signal);
      },
    }),
    confirm: async () => true,
  });
  const client = new Client({ name: "bounded-batch", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      fetch: (input, init) => handle(new Request(input, init)),
    }),
  );
  const changes = [10, 11, 12].map((day) => ({
    kind: "CREATE",
    request_id: randomUUID(),
    item: {
      family: "P3",
      title: "QA " + day,
      dates: { start_date: `2026-12-${day}`, end_date: `2026-12-${day + 1}` },
    },
  }));
  const plan = { trip_id: trip, changes };
  const preview = await client.callTool({
    name: "preview_trip_changes",
    arguments: plan,
  });
  const p = (preview.structuredContent ??
    (preview as { result?: Record<string, unknown> }).result) as Record<string, unknown>;
  vi.useFakeTimers();
  let response: unknown,
    failed = false;
  try {
    const pending = client
      .callTool({
        name: "apply_trip_changes",
        arguments: { ...plan, preview_digest: p.preview_digest },
      })
      .then((r) => {
        response = r;
      })
      .catch(() => {
        failed = true;
      });
    await vi.advanceTimersByTimeAsync(50001);
    expect(failed).toBe(false);
    expect(response).toBeDefined();
    const r = response as {
      structuredContent?: Record<string, unknown>;
      result?: Record<string, unknown>;
    };
    const output = (r.structuredContent ?? r.result)!;
    expect(output.outcome).toBe("PARTIAL");
    expect((output.operations as { outcome: string }[]).map((o) => o.outcome)).toEqual([
      "APPLIED",
      "UNKNOWN",
      "PREVIEW",
    ]);
    expect(f.posts()).toBe(1);
    await pending;
  } finally {
    await vi.advanceTimersByTimeAsync(20000);
    await client.close();
    vi.useRealTimers();
  }
});

it("recovers structured Trip receipts through the owning version2 HTTP boundary", async () => {
  const p = prepareTrip(account, {
    request_id: randomUUID(),
    name: "Synthetic Nelson QA",
    destinations: ["Nelson", "Abel Tasman"],
  });
  if (p.kind !== "TRIP") throw Error("TRIP_EXPECTED");
  const result = {
    ...p.command,
    actorAccountId: account,
    ownerPersonId: person,
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
    metadataRevision: 0 as const,
  };
  let posts = 0;
  const backend: BackendMutation = async (q) => {
    if (q.method === "POST") posts++;
    return tripCreateBoundary(
      new Request("https://backend" + q.path, {
        method: q.method,
        headers: q.headers,
        ...(q.body ? { body: JSON.stringify(q.body) } : {}),
      }),
      account,
      {
        create: async () => result,
        receipt: async () => result,
      },
    );
  };
  const tools = createMutationTools(context(backend));
  expect(
    await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", trip_id: p.command.tripId });
  expect(
    await tools.get_operation_status({
      target: "TRIP",
      trip_id: p.command.tripId,
      operation_id: p.command.operationId,
    }),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 1 });
  expect(posts).toBe(0);
});

it("refuses date edits when the owning read returns a different Item identity", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend));
  const createP = tools.prepareCreate(create());
  const created = await tools.execute(
    createP,
    "APPLY",
    mutationIdentity(account, createP).preview_digest,
  );
  const raw = projectCoreItem(f.graph(), actor, created.item_id!)!;
  const guarded = createMutationTools({
    ...context(f.backend),
    read: async () => Response.json({ ...raw, itemId: randomUUID() }),
  });
  const p = guarded.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    change: {
      kind: "DATES",
      dates: { start_date: "2026-12-11", end_date: "2026-12-13" },
    },
  });
  expect(await guarded.execute(p, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "CURRENT_ITEM_SCOPE_MISMATCH",
  });
  expect(
    await guarded.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({ outcome: "REJECTED", error_code: "CURRENT_ITEM_SCOPE_MISMATCH" });
  expect(f.posts()).toBe(1);
});
