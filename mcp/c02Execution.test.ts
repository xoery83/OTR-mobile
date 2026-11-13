import { afterEach, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, type McpLogEvent, type McpOptions } from "./server";
import { restrictC02Execution, c02ExecutionPlan } from "./c02Execution";
import { createC02Host, c02HostConfig } from "./c02Host";
import { protectedResourceMetadata } from "./oauth";
import {
  prepareCreate,
  mutationIdentity,
  contentDigest,
  sha,
  type BackendMutation,
} from "./mutation";
import { applyCoreCommand, emptyCoreGraph } from "../src/domain/trip/tripCoreV2Mutation";
import { coreHashValue } from "../src/domain/trip/tripCoreV2Read";
const accountId = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
const tripId = "cc44a705-6f43-41e0-a2f9-16f334b2a6b2";
const clientId = "83504d3f-59d4-43fd-99b1-bebc54c40f7d";
const resource = "https://api-dev.xoery.art/mcp";
afterEach(() => vi.restoreAllMocks());
const signal = () => new AbortController().signal;
const request = () => new Request(resource);
const prepared = prepareCreate(accountId, {
  trip_id: tripId,
  request_id: "cb4e1306-2a86-4e68-a849-a47cd18b6c23",
  item: {
    family: "P3",
    title: "Synthetic C02",
    dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
  },
});
if (prepared.kind !== "ITEM") throw Error("ITEM_REQUIRED");
const command = prepared.command;
const plan = () => ({
  gateSHA256: "1".repeat(64),
  windowId: "a9f50776-d15a-4bfe-a547-7481a87e6981",
  startsAt: Date.now() - 1000,
  normalCloseAt: Date.now() + 120000,
  expiresAt: Date.now() + 240000,
  command: null,
});
function fixture(approved = true) {
  const backend = vi.fn<BackendMutation>(async () => Response.json({}));
  const confirm = vi.fn(async () => approved);
  const authorize = vi.fn<NonNullable<McpOptions["authorize"]>>(async () => ({
    accountId,
    clientId,
    resource,
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: Date.now() + 30000,
    read: vi.fn(async () => Response.json({})),
    backend,
  }));
  const base: McpOptions = { resource, authorize, confirm };
  return { base, backend, confirm, authorize };
}
it("C02 discovery exposes the supported P3 catalog instead of the stale Notes-only catalog without any business call", async () => {
  const catalogs: Record<string, string[]> = {};
  for (const profile of ["NOTES", "C02"] as const) {
    const f = fixture();
    const options =
      profile === "C02"
        ? restrictC02Execution(f.base, plan())
        : { ...f.base, toolProfile: "SLICE1_NOTES_EDIT" as const };
    const handler = createMcpHandler(options);
    const client = new Client({ name: "c02-catalog-diagnostic", version: "1" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(resource), {
          fetch: async (input, init) => handler(new Request(input, init)),
        }),
      );
      const listed = await client.listTools();
      catalogs[profile] = listed.tools.map((t) => t.name).sort();
      const writes = listed.tools
        .filter((t) => t.annotations?.readOnlyHint === false)
        .map((t) => t.name)
        .sort();
      expect(writes).toEqual(
        profile === "C02"
          ? ["create_trip_item", "update_trip_item"]
          : ["update_trip_item"],
      );
      if (profile === "C02") {
        const create = listed.tools.find((t) => t.name === "create_trip_item")!;
        expect(create.inputSchema).toMatchObject({
          properties: { item: { properties: { family: { const: "P3" } } } },
        });
        expect(create.inputSchema.type).toBe("object");
        expect(create.outputSchema?.type).toBe("object");
      }
      expect(f.backend).not.toHaveBeenCalled();
      expect(f.confirm).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  }
  expect(catalogs.NOTES).toEqual(
    [
      "get_operation_status",
      "get_otr_operating_guide",
      "get_trip",
      "get_trip_item",
      "get_trip_item_edit_base",
      "list_trip_items",
      "list_trips",
      "update_trip_item",
    ].sort(),
  );
  expect(catalogs.C02).toEqual(
    [...catalogs.NOTES, "create_trip_item", "review_travel_materials"].sort(),
  );
});

it.each(["initialize", "tools/list", "tools/call"])(
  "C02 OAuth-only ingress challenges anonymous %s without invoking business ports",
  async (method) => {
    const f = fixture();
    f.authorize.mockResolvedValue(null);
    const handler = createMcpHandler(
      restrictC02Execution(
        {
          ...f.base,
          oauth: protectedResourceMetadata(resource, "https://issuer.example", {
            read: ["openid"],
            write: ["openid", "offline_access"],
          }),
        },
        plan(),
      ),
    );
    const response = await handler(
      new Request(resource, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      `resource_metadata="${resource.replace("/mcp", "/.well-known/oauth-protected-resource/mcp")}"`,
    );
    expect(await response.json()).toEqual({ error: "AUTH_REQUIRED" });
    expect(f.backend).not.toHaveBeenCalled();
    expect(f.confirm).not.toHaveBeenCalled();
  },
);

it("S1 execution packet starts empty and denies every POST, without supplying any new authority", async () => {
  const f = fixture(),
    options = restrictC02Execution(f.base, plan());
  const auth = await options.authorize!(request());
  expect(options.toolProfile).toBe("P3_STAY_QA");
  expect(
    (
      await auth!.backend!(
        { method: "POST", path: `/v2/trips/${tripId}/core/commands`, body: command },
        signal(),
      )
    ).status,
  ).toBe(403);
  expect(f.backend).not.toHaveBeenCalled();
  expect(
    await options.confirm!(
      {
        accountId,
        clientId,
        resource,
        digest: "0".repeat(64),
        summary: "",
        operationIds: [command.operationId],
      },
      signal(),
    ),
  ).toBe(false);
});
it("S1 execution packet accepts only one exact private command and still requires trusted confirmation", async () => {
  const f = fixture(),
    options = restrictC02Execution(f.base, { ...plan(), command });
  const auth = await options.authorize!(request());
  const identity = mutationIdentity(accountId, prepared);
  expect(
    await options.confirm!(
      {
        accountId,
        clientId,
        resource,
        digest: identity.preview_digest,
        summary: "",
        operationIds: [command.operationId],
      },
      signal(),
    ),
  ).toBe(true);
  const path = `/v2/trips/${tripId}/core/commands`;
  expect(
    (
      await auth!.backend!(
        {
          method: "POST",
          path,
          body: { ...command, operationId: "1ba912ed-dc8d-49f8-af08-c757c8bd611d" },
        },
        signal(),
      )
    ).status,
  ).toBe(403);
  expect(f.backend).not.toHaveBeenCalled();
  expect(
    (await auth!.backend!({ method: "POST", path, body: command }, signal())).status,
  ).toBe(200);
  expect(f.backend).toHaveBeenCalledTimes(1);
  f.confirm.mockResolvedValue(false);
  expect(
    (await auth!.backend!({ method: "POST", path, body: command }, signal())).status,
  ).toBe(403);
  expect(f.backend).toHaveBeenCalledTimes(1);
});
it("S1 execution packet rejects wrong identity, expired windows, historical targets and unsupported commands", async () => {
  const f = fixture();
  f.authorize.mockImplementation(async () => ({
    accountId,
    clientId: "wrong",
    resource,
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: Date.now() + 30000,
    read: vi.fn(async () => Response.json({})),
    backend: f.backend,
  }));
  expect(await restrictC02Execution(f.base, plan()).authorize!(request())).toBeNull();
  const old = {
    ...plan(),
    startsAt: Date.now() - 240000,
    normalCloseAt: Date.now() - 120001,
    expiresAt: Date.now() - 1,
  };
  expect(await restrictC02Execution(f.base, old).authorize!(request())).toBeNull();
  expect(() =>
    c02ExecutionPlan.parse({
      ...plan(),
      command: {
        ...command,
        target: { kind: "ITEM", id: "3616da44-0d35-4400-a739-01f1029565ea" },
      },
    }),
  ).toThrow();
  expect(() =>
    c02ExecutionPlan.parse({ ...plan(), expiresAt: Date.now() + 1900000 }),
  ).toThrow();
  expect(() =>
    c02ExecutionPlan.parse({
      ...plan(),
      command: { ...command, payload: { family: "P3", surprise: "unapproved" } },
    }),
  ).toThrow();
  expect(() =>
    c02ExecutionPlan.parse({
      ...plan(),
      command: {
        ...command,
        payload: {
          ...(command.payload as object),
          acl: { visibility: "GROUP", people: [] },
        },
      },
    }),
  ).toThrow();
  expect(f.backend).not.toHaveBeenCalled();
});
it("S1 execution packet cannot edit without a full formal receipt of its own new P3 Create", async () => {
  const f = fixture();
  f.backend.mockImplementation(async () => Response.json({ projection: "STATUS_ONLY" }));
  const edit = {
    ...command,
    command: "SET_ITEM_SCHEDULE",
    payload: (command.payload as { schedule: unknown }).schedule,
    baseVector: [{ ...command.baseVector[0], revision: 1 }],
  };
  edit.payload = { schedule: edit.payload };
  const options = restrictC02Execution(f.base, {
    ...plan(),
    command: edit,
    createdOperationId: "ca23dbbd-7c29-49d3-b144-535d05c01942",
  });
  expect(await options.authorize!(request())).toBeNull();
  expect(f.backend.mock.calls.every((c) => c[0].method === "GET")).toBe(true);
});
it("S1 Host is unmounted with no configuration", async () => {
  expect(await createC02Host()(new Request(resource))).toBeNull();
});
it("S1 rejects a read finishing after normalClose even while its original grant is still valid", async () => {
  const start = Date.now(),
    f = fixture(),
    window = {
      ...plan(),
      startsAt: start - 1000,
      normalCloseAt: start + 1000,
      expiresAt: start + 121000,
    };
  let now = start;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const cancel = vi.fn();
  let finish!: (r: Response) => void;
  f.authorize.mockResolvedValue({
    accountId,
    clientId,
    resource,
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: start + 30000,
    backend: f.backend,
    read: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const auth = await restrictC02Execution(f.base, window).authorize!(request());
  expect(auth!.expiresAt).toBe(window.normalCloseAt);
  const pending = auth!.read(`/v2/trips/${tripId}/core/collection`, signal());
  now = window.normalCloseAt + 1;
  finish(new Response(new ReadableStream({ cancel })));
  expect((await pending).status).toBe(401);
  expect(cancel).toHaveBeenCalledOnce();
});
it("S1 discovery returns only the fixed QA Trip, not other authorized Trip metadata or cursors", async () => {
  const f = fixture();
  const target = {
    id: tripId,
    name: "Synthetic QA",
    destination: null,
    startDate: null,
    endDate: null,
    createdAt: null,
  };
  f.authorize.mockResolvedValue({
    accountId,
    clientId,
    resource,
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: Date.now() + 30000,
    backend: f.backend,
    read: async () =>
      Response.json({
        trips: [
          {
            ...target,
            id: "00000000-0000-4000-8000-000000000001",
            name: "Outside scope",
          },
          target,
        ],
        nextCursor: null,
      }),
  });
  const auth = await restrictC02Execution(f.base, plan()).authorize!(request());
  expect(await (await auth!.read("/v2/trips?limit=25", signal())).json()).toEqual({
    trips: [target],
    nextCursor: null,
  });
  expect(
    (
      await auth!.read(
        "/v2/trips/00000000-0000-4000-8000-000000000001/core/collection",
        signal(),
      )
    ).status,
  ).toBe(404);
});

it.each(["current", "old", "future", "GROUP", "WHOLE_GROUP"])(
  "S1 parent receipt qualification: %s",
  async (kind) => {
    const now = Date.now(),
      window = plan();
    const parent = structuredClone(command);
    const payload = parent.payload as {
      acl: { visibility: string };
      participation: { mode: string };
    };
    if (kind === "GROUP") payload.acl.visibility = "GROUP";
    if (kind === "WHOLE_GROUP") payload.participation.mode = "WHOLE_GROUP";
    const when = new Date(
      kind === "old" ? window.startsAt - 1 : kind === "future" ? now + 60000 : now,
    ).toISOString();
    const personId = "ba687e88-a1db-4bd3-a96b-43c2d3f59058";
    const graph = applyCoreCommand(
      emptyCoreGraph(),
      parent,
      {
        accountId,
        tripId,
        active: true,
        canManageShared: true,
        personId,
        personIds: [personId],
      },
      when,
    ).graph;
    const body = {
      receiptVersion: 2,
      commandVersion: 2,
      intentVersion: 2,
      actorAccountId: accountId,
      tripId,
      operationId: parent.operationId,
      command: "CREATE_ITEM",
      intentSha256: await coreHashValue(
        "otr-trip-core-intent-v2",
        parent,
        async (bytes) => sha(bytes),
      ),
      targetVector: [
        { kind: "ITEM", id: parent.target.id, baseRevision: null, committedRevision: 1 },
      ],
      outcome: "APPLIED",
      result: {
        created: [{ kind: "ITEM", id: parent.target.id }],
        changed: [],
        retiredEdges: [],
        replacement: null,
        custodyGrantId: null,
      },
      errorCode: null,
      committedAt: when,
      audit: {
        before: [],
        after: [
          {
            kind: "ITEM",
            id: parent.target.id,
            revision: 1,
            facts: graph.itinerary_events[0],
          },
        ],
        evidenceRefs: [],
        authorizationRefs: [],
      },
    };
    const receipt = {
      ...body,
      receiptSha256: await coreHashValue(
        "otr-trip-core-receipt-v2",
        body,
        async (bytes) => sha(bytes),
      ),
    };
    const f = fixture();
    f.backend.mockImplementation(async () =>
      Response.json({ projection: "FULL", receipt }),
    );
    const edit = {
      ...command,
      operationId: "c633511a-ce0e-4e96-aafc-0f9da133a468",
      command: "SET_ITEM_SCHEDULE",
      payload: { schedule: (command.payload as { schedule: unknown }).schedule },
      baseVector: [{ kind: "ITEM", id: command.target.id, revision: 1 }],
    };
    const auth = await restrictC02Execution(f.base, {
      ...window,
      command: edit,
      createdOperationId: parent.operationId,
    }).authorize!(request());
    expect(auth !== null).toBe(kind === "current");
    expect(f.backend.mock.calls.every((c) => c[0].method === "GET")).toBe(true);
  },
);
it("S1 execution packet snapshots the command instead of accepting caller mutations after binding", async () => {
  const f = fixture(),
    original = { ...plan(), command: structuredClone(command) };
  const options = restrictC02Execution(f.base, original);
  (original.command.payload as { core: { title: string } }).core.title = "Not confirmed";
  const auth = await options.authorize!(request());
  expect(
    (
      await auth!.backend!(
        {
          method: "POST",
          path: `/v2/trips/${tripId}/core/commands`,
          body: original.command,
        },
        signal(),
      )
    ).status,
  ).toBe(403);
  expect(f.backend).not.toHaveBeenCalled();
});
it("S1 new P3 response proof hashes actual final SDK Create PREVIEW only, without business dispatch", async () => {
  const f = fixture(),
    logs: McpLogEvent[] = [];
  const handler = createMcpHandler(
    restrictC02Execution({ ...f.base, log: (e) => logs.push(e) }, plan()),
  );
  const client = new Client({ name: "synthetic-c02-proof", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    const input = {
      request_id: command.operationId,
      trip_id: tripId,
      item: {
        family: "P3",
        title: "Synthetic C02",
        dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
      },
    };
    const result = await client.callTool({ name: "create_trip_item", arguments: input });
    expect(result.structuredContent).toMatchObject({ outcome: "PREVIEW" });
    expect(logs.find((l) => l.responseProof)?.responseProof).toEqual({
      version: "otr.mcp.response-proof/1",
      kind: "PREVIEW",
      inputSHA256: contentDigest(input),
      outputSHA256: contentDigest(result.structuredContent),
      previewDigest: (result.structuredContent as Record<string, unknown>).preview_digest,
    });
    expect(JSON.stringify(logs)).not.toContain("Synthetic C02");
    expect(f.backend).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});
it("S1 private confirmation table rejects mismatched human-source bindings and more than one command", () => {
  expect(c02HostConfig.parse({ plan: plan(), confirmations: [] }).confirmations).toEqual(
    [],
  );
  const confirmation = {
    gateSHA256: "1".repeat(64),
    operationId: command.operationId,
    previewDigest: mutationIdentity(accountId, prepared).preview_digest,
    sourceThreadId: "01a18663-48af-7b80-9fac-408bfa98e2fb",
    sourceMessageId: "ea071969-96b7-491c-8de7-e48de075a914",
    sourceEvidenceSHA256: "2".repeat(64),
  };
  expect(
    c02HostConfig.parse({ plan: { ...plan(), command }, confirmations: [confirmation] })
      .confirmations,
  ).toHaveLength(1);
  const root2Confirmation = {
    ...confirmation,
    sourceThreadId: "01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232",
  };
  expect(
    c02HostConfig.parse({
      plan: { ...plan(), command },
      confirmations: [root2Confirmation],
    }).confirmations[0].sourceThreadId,
  ).toBe(root2Confirmation.sourceThreadId);
  expect(() =>
    c02HostConfig.parse({
      plan: { ...plan(), command },
      confirmations: [{ ...root2Confirmation, previewDigest: "0".repeat(64) }],
    }),
  ).toThrow();
  for (const patch of [
    { previewDigest: "0".repeat(64) },
    { sourceThreadId: "another" },
    { gateSHA256: "3".repeat(64) },
  ])
    expect(() =>
      c02HostConfig.parse({
        plan: { ...plan(), command },
        confirmations: [{ ...confirmation, ...patch }],
      }),
    ).toThrow();
  expect(() =>
    c02HostConfig.parse({
      plan: { ...plan(), command },
      confirmations: [confirmation, confirmation],
    }),
  ).toThrow();
});
