import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { coreTableSchemas } from "../../src/domain/trip/tripCoreV2";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { ordinaryFixture } from "../../src/domain/trip/__fixtures__/coreOrdinaryOrder";
import {
  authoredVersionItemSchema,
  authorizedTripVersionFromCollection,
} from "../../src/domain/trip/tripAuthorizedVersion";
import { createCorePgReader } from "./tripCoreV2PgRead";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { createTripDocumentOriginalRead } from "./tripDocumentOriginalRead";

function fixture(options: { actor?: CoreActor; graph?: CoreGraph } = {}) {
  const actor: CoreActor = options.actor ?? {
    accountId: randomUUID(),
    tripId: randomUUID(),
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49]);
  const hash = async (value: Uint8Array) =>
    createHash("sha256").update(value).digest("hex");
  const document = {
    ...Object.fromEntries(
      Object.keys(coreTableSchemas.trip_operational_documents.shape).map((key) => [
        key,
        null,
      ]),
    ),
    id: randomUUID(),
    trip_id: actor.tripId,
    revision: 1,
    owner_account_id: actor.accountId,
    visibility: "PRIVATE",
    hidden_at: null,
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
    field_state: {},
    title: "Synthetic original",
    media_type: "application/pdf",
    byte_size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    custody: "AUTHORIZED_COPY",
    source_representation_id: null,
    storage_object_key: "private/internal/key",
    content_version: 1,
    custody_receipt_id: randomUUID(),
  };
  const graph = options.graph ?? emptyCoreGraph();
  if (!options.graph) graph.trip_operational_documents = [document];
  const state = { epoch: randomUUID(), revision: 1, access_revision: 4 };
  const identity = {
    principal: "otr_trip_core_v2_gateway",
    role: "otr_trip_core_v2_gateway",
  };
  const gate = { runtime_enabled: true };
  let projectionRows: { projection_kind: string; fact: unknown }[] = [];
  const lease = {
    retire: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql.includes("authored_version_projection")) return { rows: projectionRows };
      if (sql.startsWith("SELECT session_user AS principal,current_user AS role"))
        return { rows: [identity] };
      if (sql.includes("trip_core_finite_scope_allowed"))
        return { rows: [{ allowed: gate.runtime_enabled }] };
      if (sql.includes("trip_core_lock_actor_scope")) return { rows: [{ actor }] };
      if (sql.includes("trip_core_activation_gate")) return { rows: [gate] };
      if (sql.includes("FROM public.trip_core_read_state")) return { rows: [state] };
      if (sql.includes('FROM public."trip_operational_documents"'))
        return {
          rows: Object.entries(graph).flatMap(([table, facts]) =>
            facts.map((fact) => ({ core_table: table, fact })),
          ),
        };
      if (sql.includes("trip_core_read_person_bindings"))
        return { rows: [{ bindings: [] }] };
      return { rows: [] };
    }),
  };
  const acquire = vi.fn();
  const connection: CorePgConnection = {
    async withLease(work) {
      acquire();
      return work(lease);
    },
  };
  const reader = createCorePgReader(connection, hash);
  const request = {
    actorAccountId: actor.accountId,
    tripId: actor.tripId,
    documentId: document.id,
    contentVersion: 1,
    sha256: document.sha256,
  };
  const retained = {
    ...request,
    custodyReceiptId: document.custody_receipt_id,
    byteSize: bytes.length,
    custody: "AUTHORIZED_COPY" as const,
    state: "BOUND" as const,
    right: "CURRENT_COPY_GRANT" as const,
    generation: "retention-1",
  };
  const ports = {
    currentAccess: reader.currentDocumentAccess,
    currentRetention: vi.fn(async () => retained),
    readRetained: vi.fn(async () => ({ ...retained, bytes })),
  };
  return {
    actor,
    document,
    state,
    identity,
    gate,
    lease,
    connection,
    acquire,
    reader,
    request,
    ports,
    hash,
    graph,
    setProjection(rows: typeof projectionRows) {
      projectionRows = rows;
    },
  };
}

it.each(["AUTHORED", "FULL"])(
  "logs only the fixed %s projection after COMMIT and survives logger failure",
  async (projection) => {
    const f = fixture({ graph: emptyCoreGraph() });
    if (projection === "AUTHORED")
      f.setProjection([{ projection_kind: "blocked", fact: false }]);
    let tick = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => (tick += 10));
    const log = vi.spyOn(console, "info").mockImplementation(() => {
      expect(f.lease.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    });
    try {
      const first = await f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId);
      expect(log.mock.calls).toEqual([
        [
          JSON.stringify({
            event: "core_authorized_version_projection",
            projection,
            beforeProjectionMs: 80,
            projectionAndCommitMs: 40,
            phases: {
              leaseMs: 10,
              beginMs: 10,
              setupMs: 10,
              scopeMs: 10,
              actorMs: 10,
              gateMs: 10,
              stateMs: 10,
              projectMs: 20,
              finalScopeMs: 10,
              commitMs: 10,
            },
          }),
        ],
      ]);
      log.mockImplementation(() => {
        throw Error("PRIVATE_LOGGER_FAILURE");
      });
      expect(await f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId)).toEqual(
        first,
      );
    } finally {
      clock.mockRestore();
      log.mockRestore();
    }
  },
);

it("sets transaction-local limits/context and reads identity in one round trip before any scope or data read", async () => {
  const f = fixture();
  await f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId);
  const queries = f.lease.query.mock.calls.map(([sql]) => sql);
  expect(queries.slice(0, 2)).toEqual([
    "BEGIN ISOLATION LEVEL REPEATABLE READ",
    "SELECT session_user AS principal,current_user AS role,set_config('statement_timeout','5000ms',true),set_config('lock_timeout','1000ms',true),set_config('TimeZone','UTC',true),set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
  ]);
  expect(f.lease.query.mock.calls[1]).toEqual([
    "SELECT session_user AS principal,current_user AS role,set_config('statement_timeout','5000ms',true),set_config('lock_timeout','1000ms',true),set_config('TimeZone','UTC',true),set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
    [f.actor.accountId, f.actor.tripId],
  ]);
  expect(
    queries.filter(
      (sql) =>
        sql.startsWith("SET LOCAL statement_timeout") ||
        sql.startsWith("SET LOCAL lock_timeout") ||
        sql.startsWith("SET LOCAL TIME ZONE"),
    ),
  ).toEqual([]);
  expect(queries.at(-1)).toBe("COMMIT");
});

it("rolls back a failed combined settings statement before identity, Actor or graph reads", async () => {
  const f = fixture();
  f.lease.query.mockReset();
  f.lease.query
    .mockResolvedValueOnce({ rows: [] })
    .mockRejectedValueOnce(Error("READ_SETTINGS_FAILED"))
    .mockResolvedValueOnce({ rows: [] });
  await expect(
    f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId),
  ).rejects.toThrow("READ_SETTINGS_FAILED");
  expect(f.lease.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN ISOLATION LEVEL REPEATABLE READ",
    "SELECT session_user AS principal,current_user AS role,set_config('statement_timeout','5000ms',true),set_config('lock_timeout','1000ms',true),set_config('TimeZone','UTC',true),set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
    "ROLLBACK",
  ]);
});

it("returns current internal ACL state only after the existing snapshot commits; collection remains original-disabled", async () => {
  const f = fixture();
  expect(f.acquire).not.toHaveBeenCalled();
  const access = await f.reader.currentDocumentAccess(f.request);
  expect(access).toMatchObject({ actor: f.actor, accessRevision: 4 });
  expect(access.graph.trip_operational_documents).toEqual([f.document]);
  const queries = f.lease.query.mock.calls.map(([sql]) => sql);
  expect(queries[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ");
  expect(queries.at(-1)).toBe("COMMIT");
  expect(queries).toContain("SET LOCAL ROLE otr_trip_core_v2_writer");
  const collection = await f.reader.collection(f.actor.accountId, f.actor.tripId);
  expect(
    collection.pages
      .flatMap((page) => page.records)
      .some((row) => row.kind === "DOCUMENT"),
  ).toBe(false);
  await expect(
    createTripDocumentOriginalRead({
      currentAccess: f.reader.currentDocumentAccess,
    }).read(f.actor.accountId, f.request),
  ).resolves.toEqual({ status: "UNAVAILABLE" });
});

it("composes with independent custody and rejects access-revision drift after byte acquisition", async () => {
  const f = fixture();
  const read = createTripDocumentOriginalRead(f.ports);
  expect((await read.read(f.actor.accountId, f.request)).status).toBe("AVAILABLE");
  f.ports.readRetained.mockImplementationOnce(async () => {
    f.state.access_revision++;
    return {
      ...(await f.ports.currentRetention()),
      bytes: Uint8Array.from([37, 80, 68, 70, 45, 49]),
    };
  });
  await expect(read.read(f.actor.accountId, f.request)).resolves.toEqual({
    status: "UNAVAILABLE",
  });
});

it("denies a different private-document owner before invoking custody", async () => {
  const f = fixture();
  f.document.owner_account_id = randomUUID();
  await expect(
    createTripDocumentOriginalRead(f.ports).read(f.actor.accountId, f.request),
  ).resolves.toEqual({ status: "UNAVAILABLE" });
  expect(f.ports.currentRetention).not.toHaveBeenCalled();
  expect(f.ports.readRetained).not.toHaveBeenCalled();
});

it.each(["principal", "gate", "actor", "scope", "revision", "graph"])(
  "preserves the snapshot's %s rejection and rollback",
  async (reason) => {
    const f = fixture();
    if (reason === "principal") f.identity.principal = "service_role";
    if (reason === "gate") f.gate.runtime_enabled = false;
    if (reason === "actor") f.actor.active = false;
    if (reason === "scope") f.actor.tripId = randomUUID();
    if (reason === "revision") f.state.access_revision = 0;
    if (reason === "graph") f.document.trip_id = randomUUID();
    await expect(f.reader.currentDocumentAccess(f.request)).rejects.toThrow();
    expect(f.lease.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(f.lease.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  },
);

it("rejects malformed account scope before a lease and retires when rollback fails", async () => {
  const f = fixture();
  await expect(
    f.reader.currentDocumentAccess({ ...f.request, actorAccountId: "invalid" }),
  ).rejects.toThrow();
  expect(f.acquire).not.toHaveBeenCalled();
  f.gate.runtime_enabled = false;
  const query = f.lease.query.getMockImplementation()!;
  f.lease.query.mockImplementation(async (sql) => {
    if (sql === "ROLLBACK") throw new Error("synthetic rollback unavailable");
    return query(sql);
  });
  await expect(f.reader.currentDocumentAccess(f.request)).rejects.toThrow(
    "CORE_CAPABILITY_CLOSED",
  );
  expect(f.lease.retire).toHaveBeenCalledOnce();
});

it("finite capabilities require current linked actor and owning read state, never listing alone", async () => {
  const f = fixture();
  expect(
    (await f.reader.capabilities(f.actor.accountId, f.actor.tripId)).activationState,
  ).toBe("CLOSED");
  f.actor.personId = randomUUID();
  const c = await f.reader.capabilities(f.actor.accountId, f.actor.tripId);
  expect(c.activationState).toBe("ENABLED");
  expect(c.enabledCommands).toEqual(["CREATE_ITEM"]);
  expect(c.enabledFamilies).toEqual(["P1", "P3"]);
  expect(c.enabledAdmissionModes).toEqual(["MANUAL"]);
  expect(c.operationalCustodyAvailable).toBe(false);
  f.actor.active = false;
  expect(
    (await f.reader.capabilities(f.actor.accountId, f.actor.tripId)).activationState,
  ).toBe("CLOSED");
});
it("expired read scope rejects before graph access and leaves cached data untouched", async () => {
  const f = fixture();
  f.gate.runtime_enabled = false;
  await expect(f.reader.collection(f.actor.accountId, f.actor.tripId)).rejects.toThrow(
    "CORE_CAPABILITY_CLOSED",
  );
  expect(f.lease.query.mock.calls.some(([q]) => q.includes("to_jsonb(facts)"))).toBe(
    false,
  );
});

it.each(["P2", "P3", "P4", "P5", "P6"] as const)(
  "advertises the exact %s reviewed window without granting Manual or other family edits",
  async (family) => {
    const f = fixture();
    f.actor.personId = randomUUID();
    const base = f.lease.query.getMockImplementation()!;
    f.lease.query.mockImplementation(async (sql) => {
      if (sql.includes("trip_sustained_import_p1_capabilities"))
        return {
          rows: [
            {
              runtime_enabled: true,
              enabled_commands: [
                family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM",
              ],
              enabled_families: [family],
              enabled_admission_modes: ["REVIEWED_SOURCE"],
            },
          ],
        } as any;
      return base(sql);
    });
    const reader = createCorePgReader(
      f.connection,
      async (value) => createHash("sha256").update(value).digest("hex"),
      undefined,
      { sustainedDev: true, reviewedP1: true },
    );
    const c = await reader.capabilities(f.actor.accountId, f.actor.tripId);
    expect(c.enabledCommands).toEqual([
      family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM",
    ]);
    expect(c.enabledFamilies).toEqual([family]);
    expect(c.enabledAdmissionModes).toEqual(["REVIEWED_SOURCE"]);
    expect(c.sourceEvidenceAvailable).toBe(true);
  },
);

it("binds Source capability reads to one transaction-local operation and validates before acquiring", async () => {
  const f = fixture(),
    operation = randomUUID();
  f.actor.personId = randomUUID();
  const base = f.lease.query.getMockImplementation()!;
  let selected = "";
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql.includes("set_config('otr.core.operation'")) {
      selected = String(values?.[0]);
      return { rows: [] };
    }
    if (sql.includes("trip_sustained_import_p1_capabilities"))
      return {
        rows: [
          {
            runtime_enabled: selected === operation,
            enabled_commands: ["CREATE_ITEM"],
            enabled_families: ["P1"],
            enabled_admission_modes: ["REVIEWED_SOURCE"],
          },
        ],
      };
    return base(sql);
  });
  const acquire = vi.fn(async (work: any) => {
    selected = "";
    return work({ ...f.lease, query });
  });
  const reader = createCorePgReader(
    { withLease: acquire },
    async (v) => createHash("sha256").update(v).digest("hex"),
    undefined,
    { sustainedDev: true, reviewedP1: true },
  );
  expect(
    (await reader.capabilities(f.actor.accountId, f.actor.tripId, operation))
      .sourceEvidenceAvailable,
  ).toBe(true);
  expect(
    (await reader.capabilities(f.actor.accountId, f.actor.tripId, randomUUID()))
      .sourceEvidenceAvailable,
  ).toBe(false);
  expect(
    (await reader.capabilities(f.actor.accountId, f.actor.tripId))
      .sourceEvidenceAvailable,
  ).toBe(false);
  const calls = acquire.mock.calls.length;
  await expect(
    reader.capabilities(f.actor.accountId, f.actor.tripId, "bad"),
  ).rejects.toThrow();
  expect(acquire).toHaveBeenCalledTimes(calls);
});

it("falls back to the complete snapshot within one qualified transaction", async () => {
  const f = fixture();
  const collection = await f.reader.collection(f.actor.accountId, f.actor.tripId);
  f.lease.query.mockClear();
  const version = await f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId);
  expect(version).toMatchObject({
    actorAccountId: f.actor.accountId,
    tripId: f.actor.tripId,
  });
  expect(Object.keys(version).sort()).toEqual([
    "actorAccountId",
    "token",
    "tripId",
    "version",
  ]);
  expect(
    f.lease.query.mock.calls.filter(([sql]) => sql.startsWith("BEGIN")),
  ).toHaveLength(1);
  expect(f.lease.query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(1);
  expect(JSON.stringify(version).length).toBeLessThan(JSON.stringify(collection).length);
  f.gate.runtime_enabled = false;
  await expect(
    f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId),
  ).rejects.toThrow("CORE_CAPABILITY_CLOSED");
});

function manualFixture() {
  const o = ordinaryFixture();
  o.graph.trip_person_ordinary_orders = [];
  const f = fixture({ actor: o.actor, graph: o.graph });
  const updateProjection = () =>
    f.setProjection([
      ...o.graph.itinerary_events.map((r) => ({
        projection_kind: "item",
        fact: Object.fromEntries(
          Object.keys(authoredVersionItemSchema.shape).map((k) => [k, r[k]]),
        ),
      })),
      ...o.graph.trip_item_participants.map((r) => ({
        projection_kind: "participants",
        fact: r,
      })),
      ...o.graph.trip_item_visibility_people.map((r) => ({
        projection_kind: "visibilityPeople",
        fact: r,
      })),
      { projection_kind: "blocked", fact: false },
    ]);
  updateProjection();
  return { ...f, ordinary: o, updateProjection };
}

it("matches the validated collection token without reading complete manual Item bodies", async () => {
  const f = manualFixture();
  const collection = await f.reader.collection(f.actor.accountId, f.actor.tripId);
  const expected = await authorizedTripVersionFromCollection(
    collection,
    f.actor.accountId,
    f.actor.tripId,
    f.hash,
  );
  f.lease.query.mockClear();
  expect(await f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId)).toEqual(
    expected,
  );
  const queries = f.lease.query.mock.calls.map(([sql]) => sql);
  expect(queries.some((sql) => sql.includes("core_graph LIMIT"))).toBe(false);
  expect(
    queries.filter((sql) => sql.includes("trip_core_finite_scope_allowed")),
  ).toHaveLength(2);
  expect(queries.at(-1)).toBe("COMMIT");
});

it("does not expose a foreign private creation through the summary token", async () => {
  const f = manualFixture();
  const before = await f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId);
  const id = randomUUID(),
    personId = randomUUID();
  const other = { ...f.actor, accountId: randomUUID(), personId, personIds: [personId] };
  const create = {
    ...f.ordinary.creates[0],
    operationId: randomUUID(),
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
  };
  Object.assign(
    f.graph,
    applyCoreCommand(f.graph, create, other, "2026-10-31T00:00:00Z").graph,
  );
  f.state.revision++;
  f.state.access_revision++;
  f.updateProjection();
  expect(await f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId)).toEqual(
    before,
  );
});

it("falls back for source evidence without dropping the current rights context", async () => {
  const f = manualFixture();
  f.graph.itinerary_events[0].field_state = {
    "itinerary_events.title": {
      state: "KNOWN",
      origin: "SOURCE",
      protected: false,
      changed_revision: 1,
      evidence_ref: "SYNTHETIC_SOURCE_REFERENCE",
    },
  };
  f.updateProjection();
  const collection = await f.reader.collection(f.actor.accountId, f.actor.tripId);
  const expected = await authorizedTripVersionFromCollection(
    collection,
    f.actor.accountId,
    f.actor.tripId,
    f.hash,
  );
  f.lease.query.mockClear();
  expect(await f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId)).toEqual(
    expected,
  );
  expect(
    f.lease.query.mock.calls.filter(([sql]) => sql.includes("core_graph LIMIT")),
  ).toHaveLength(1);
  expect(
    f.lease.query.mock.calls.filter(([sql]) => sql.startsWith("BEGIN")),
  ).toHaveLength(1);
});

it("rejects scope closure after a lightweight projection before committing a token", async () => {
  const f = manualFixture(),
    query = f.lease.query.getMockImplementation()!;
  f.lease.query.mockImplementation(async (sql) => {
    const result = await query(sql);
    if (sql.includes("authored_version_projection")) f.gate.runtime_enabled = false;
    return result;
  });
  await expect(
    f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId),
  ).rejects.toThrow("CORE_CAPABILITY_CLOSED");
  const queries = f.lease.query.mock.calls.map(([sql]) => sql);
  expect(queries.at(-1)).toBe("ROLLBACK");
  expect(queries).not.toContain("COMMIT");
});

it("does not skip an unqualified external authority even for a manual projection", async () => {
  const o = ordinaryFixture(),
    f = fixture({ actor: o.actor, graph: o.graph });
  const authority = {
    authorize: vi.fn(async () => {
      throw Error("OWNING_READ_DENIED");
    }),
  };
  const reader = createCorePgReader(f.connection, f.hash, authority);
  await expect(
    reader.authorizedVersion(f.actor.accountId, f.actor.tripId),
  ).rejects.toThrow("OWNING_READ_DENIED");
  expect(authority.authorize).toHaveBeenCalledOnce();
  expect(
    f.lease.query.mock.calls.some(([sql]) => sql.includes("authored_version_projection")),
  ).toBe(false);
});

it("excludes its control row from the existing 20000-fact resource limit", async () => {
  const f = fixture();
  const facts = Array.from({ length: 20000 }, () => ({
    projection_kind: "item",
    fact: {},
  }));
  f.setProjection([...facts, { projection_kind: "blocked", fact: false }]);
  // Unsupported metadata falls back, rather than rejecting a lawful fact count.
  await expect(
    f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId),
  ).resolves.toMatchObject({ actorAccountId: f.actor.accountId });
  f.setProjection([...facts, facts[0], { projection_kind: "blocked", fact: false }]);
  await expect(
    f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId),
  ).rejects.toThrow("CORE_READ_RESOURCE_LIMIT");
});

it.each(["principal", "role"] as const)(
  "rejects wrong %s after combined setup before scope or data queries",
  async (field) => {
    const f = fixture();
    f.identity[field] = "unqualified";
    await expect(
      f.reader.authorizedVersion(f.actor.accountId, f.actor.tripId),
    ).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
    const queries = f.lease.query.mock.calls.map(([sql]) => sql);
    expect(queries).toHaveLength(3);
    expect(queries.at(-1)).toBe("ROLLBACK");
    expect(
      queries.some(
        (sql) =>
          sql.includes("trip_core_finite_scope_allowed") ||
          sql.includes("trip_core_lock_actor_scope") ||
          sql.includes("authored_version_projection"),
      ),
    ).toBe(false);
  },
);
