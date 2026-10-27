import { coreDateBoundary } from "../../domain/trip/tripCoreV2Temporal";
import {
  ordinaryFixture,
  ordinaryTime,
  ordinaryPlace,
} from "../../domain/trip/__fixtures__/coreOrdinaryOrder";
import { straightLineDistance } from "../../domain/trip/ttr";
import {
  executeCoreCommandV2,
  type CoreCommandStorage,
} from "../../../backend/src/tripCoreV2Commands";
import {
  createCoreV2SyncWorker,
  createCoreV2SyncCoordinator,
} from "../sync/tripCoreV2SyncWorker";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
import { coreClosedCapabilities } from "../../domain/trip/tripCoreV2Commands";
import { ApiClientError } from "../api/client";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
  type CoreTtrPublicationLease,
} from "./tripCoreV2Repository";
import {
  beginAccountTransition,
  endAccountTransition,
  withAccountApplyGate,
} from "../auth/accountRequestContext";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "../../domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const account = randomUUID(),
  trip = randomUUID(),
  item = randomUUID(),
  person = randomUUID(),
  stamp = "2026-10-12T00:00:00Z";
const actor: CoreActor = {
  accountId: account,
  tripId: trip,
  active: true,
  canManageShared: false,
  personId: person,
  personIds: [person],
};
const sparse = () => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId: trip,
  command: "CREATE_SPARSE_FLIGHT",
  target: { kind: "ITEM", id: item },
  baseVector: [{ kind: "ITEM", id: item, revision: null }],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    flightNumberLiteral: "NZ5069",
    departureDate: "2026-12-14",
    ...coreDefaults("member"),
  },
});
const connections: DatabaseSync[] = [],
  folders: string[] = [];
afterEach(() => {
  for (const db of connections.splice(0))
    try {
      db.close();
    } catch {}
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
function fixture(path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  let active: string = account;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...params: unknown[]) {
      return sql.prepare(query).all(...(params as never[])) as T[];
    },
    async runAsync(query: string, ...params: unknown[]) {
      return sql.prepare(query).run(...(params as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  return {
    sql,
    database,
    repo: createTripCoreV2Repository(
      database,
      async () => active,
      hash,
      () => stamp,
    ),
    switchTo: (id: string) => {
      active = id;
    },
  };
}
async function collection(
  participating = true,
  graph = applyCoreCommand(emptyCoreGraph(), sparse(), actor, stamp).graph,
) {
  return buildCoreActorCollection(
    graph,
    actor,
    { epoch: randomUUID(), revision: 1, accessRevision: 1, generatedAt: stamp },
    [
      {
        person_id: person,
        account_id: account,
        active: true,
        participating,
        revision: 1,
      },
    ],
    hash,
  );
}
describe("Core SQLite54 account partition and durable offline foundation", () => {
  it("redacts private Source addresses before actor-specific read hashing while retaining accepted facts", async () => {
    const graph = applyCoreCommand(emptyCoreGraph(), sparse(), actor, stamp).graph;
    const ref = "track-c/field-evidence/" + randomUUID() + "/ORIGIN.local_date";
    graph.itinerary_events[0].start_provenance_refs = { local_date: ref };
    graph.itinerary_events[0].field_state = {
      "itinerary_events.start_local_date": {
        state: "KNOWN",
        origin: "SOURCE",
        protected: false,
        changed_revision: 1,
        evidence_ref: ref,
      },
    };
    const bundle = await collection(true, graph);
    expect(JSON.stringify(bundle)).not.toContain(ref);
    const f = fixture(),
      ctx = await f.repo.captureContext(trip);
    await f.repo.install(
      await f.repo.beginRefresh(ctx, 1),
      bundle.manifest,
      bundle.pages,
    );
    expect((await f.repo.day(ctx, actor, "2026-12-14"))[0].row.rowKey.localDate).toBe(
      "2026-12-14",
    );
  });

  it("recovers a committed lost response after client restart while capability closes, then installs Day and Item read2", async () => {
    const folder = mkdtempSync(join(tmpdir(), "otr-core-recovery-"));
    folders.push(folder);
    const path = join(folder, "core.db");
    let f = fixture(path),
      server = emptyCoreGraph(),
      stored: { domainReceiptId: string; receiptText: string } | null = null,
      dispatches = 0;
    const storage: CoreCommandStorage = {
      async withLockedCommand(scope, work) {
        if (scope.actorAccountId !== account || scope.tripId !== trip)
          throw new Error("NOT_VISIBLE");
        return work({
          actor,
          readReceipt: async () => stored,
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => true,
          enabledCommands: async () => ["CREATE_SPARSE_FLIGHT"],
          readLockedGraph: async () => server,
          verifyAdmission: async () => {},
          lifecycleGraphHash: async () => undefined,
          async commit(mutation, receipt) {
            if (mutation) server = mutation.graph;
            stored = {
              domainReceiptId: randomUUID(),
              receiptText: JSON.stringify(receipt),
            };
            return stored.domainReceiptId;
          },
        });
      },
    };
    const q = sparse(),
      ctx = await f.repo.captureContext(trip);
    await f.repo.enqueue(ctx, q);
    const transport = {
      capabilities: async () => ({
        ...coreClosedCapabilities,
        activationState: "ENABLED",
        enabledCommands: ["CREATE_SPARSE_FLIGHT"],
        enabledFamilies: ["P2"],
        enabledAdmissionModes: ["MANUAL"],
      }),
      receipt: async () =>
        stored
          ? executeCoreCommandV2(storage, account, trip, q, hash, () => stamp)
          : null,
      submit: async () => {
        dispatches++;
        await executeCoreCommandV2(storage, account, trip, q, hash, () => stamp);
        throw new ApiClientError("lost response", "network");
      },
    };
    let queue = createSyncOperationRepository(
      f.database,
      async () => account,
      () => stamp,
    );
    await createCoreV2SyncCoordinator(
      queue,
      createCoreV2SyncWorker(f.repo, transport, async () => account, hash),
      f.repo,
      trip,
    ).run("AUTHENTICATED_ONLINE");
    expect(dispatches).toBe(1);
    expect(server.itinerary_events).toHaveLength(1);
    f.sql.close();
    f = fixture(path, false);
    queue = createSyncOperationRepository(
      f.database,
      async () => account,
      () => stamp,
    );
    f.sql.exec(
      "UPDATE sync_operations SET next_attempt_at=NULL WHERE status='RETRYABLE'",
    );
    transport.capabilities = async () => ({
      ...coreClosedCapabilities,
      activationState: "CLOSED",
      enabledCommands: [],
      enabledFamilies: [],
      enabledAdmissionModes: [],
    });
    await createCoreV2SyncCoordinator(
      queue,
      createCoreV2SyncWorker(f.repo, transport, async () => account, hash),
      f.repo,
      trip,
    ).run("AUTHENTICATED_ONLINE");
    expect(dispatches).toBe(1);
    expect(f.sql.prepare("SELECT status FROM sync_operations").get()?.status).toBe(
      "COMPLETED",
    );
    const next = await f.repo.captureContext(trip);
    await f.repo.refresh(next, { collection: async () => collection(true, server) });
    expect((await f.repo.item(next, actor, item))?.localState).toBe("ACCEPTED");
    expect((await f.repo.day(next, actor, "2026-12-14"))[0].localState).toBe("ACCEPTED");
  });

  it("keeps a linked non-participating Person authorized and excludes it from the participating roster", async () => {
    const yes = await collection(true),
      no = await collection(false);
    expect(no.manifest.participatingRosterHash).not.toBe(
      yes.manifest.participatingRosterHash,
    );
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1);
    await f.repo.install(refresh, no.manifest, no.pages);
    expect((await f.repo.day(ctx, actor, "2026-12-14"))[0].row.itemRef).toBe(item);
    expect(
      f.sql.prepare("SELECT active,participating FROM trip_core_person_bindings").get(),
    ).toMatchObject({ active: 1, participating: 0 });
  });
  it("installs an authorized correction without exposing the private predecessor body", async () => {
    const graph = applyCoreCommand(emptyCoreGraph(), sparse(), actor, stamp).graph,
      oldId = randomUUID(),
      newId = randomUUID(),
      other = randomUUID();
    const instruction = {
      trip_id: trip,
      revision: 1,
      owner_account_id: other,
      hidden_at: null,
      created_at: stamp,
      updated_at: stamp,
      field_state: {},
      event_id: item,
      section: "TRANSPORT",
      sensitivity: "NORMAL",
      source_representation_id: null,
    };
    graph.trip_instruction_entries.push(
      {
        ...instruction,
        id: oldId,
        visibility: "PRIVATE",
        body: "private secret",
        supersedes_id: null,
      },
      {
        ...instruction,
        id: newId,
        visibility: "GROUP",
        body: "new authorized guidance",
        supersedes_id: oldId,
      },
    );
    const bundle = await collection(true, graph),
      f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1);
    expect(JSON.stringify(bundle)).not.toContain("private secret");
    await f.repo.install(refresh, bundle.manifest, bundle.pages);
    expect((await f.repo.readGraph(ctx)).trip_instruction_entries).toHaveLength(1);
    expect((await f.repo.readGraph(ctx)).trip_instruction_entries[0].supersedes_id).toBe(
      oldId,
    );
  });

  it("upgrades SQLite53 without changing historical schema or existing data", () => {
    const sql = new DatabaseSync(":memory:");
    connections.push(sql);
    for (const m of migrations.filter((m) => m.id < 54)) sql.exec(m.sql);
    sql
      .prepare(
        "INSERT INTO sync_operations(id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at,owner_user_id) VALUES('historic','EXPENSE','e','EXPENSE_CREATE','historic','{}','PENDING',?,?,?)",
      )
      .run(stamp, stamp, account);
    const before = sql
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    sql.exec(migrations.find((m) => m.id === 54)!.sql);
    expect(
      before.every(
        (row) =>
          sql
            .prepare("SELECT sql FROM sqlite_master WHERE name=?")
            .get(row.name as string)?.sql === row.sql,
      ),
    ).toBe(true);
    expect(
      sql.prepare("SELECT id FROM sync_operations WHERE id='historic'").get()?.id,
    ).toBe("historic");
  });
  it("rolls back an interrupted additive migration and retries cleanly", () => {
    const sql = new DatabaseSync(":memory:");
    connections.push(sql);
    for (const m of migrations.filter((m) => m.id < 54)) sql.exec(m.sql);
    sql.exec("BEGIN");
    expect(() =>
      sql.exec(migrations.find((m) => m.id === 54)!.sql + "SELECT no_such_column;"),
    ).toThrow();
    sql.exec("ROLLBACK");
    expect(
      sql
        .prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'trip_core_%'")
        .get()?.n,
    ).toBe(0);
    sql.exec(migrations.find((m) => m.id === 54)!.sql);
    expect(
      sql
        .prepare("SELECT name FROM sqlite_master WHERE name='trip_core_pending_intents'")
        .get()?.name,
    ).toBe("trip_core_pending_intents");
  });
  it("atomically saves sparse offline intent, stable UUID, queue identity and restart projection", async () => {
    const folder = mkdtempSync(join(tmpdir(), "otr-core54-"));
    folders.push(folder);
    const path = join(folder, "core.db");
    const f = fixture(path);
    const ctx = await f.repo.captureContext(trip),
      q = sparse();
    expect(await f.repo.enqueue(ctx, q)).toEqual({
      localStatus: "PENDING",
      itemId: item,
      operationId: q.operationId,
    });
    expect(await f.repo.enqueue(ctx, q)).toEqual({
      localStatus: "PENDING",
      itemId: item,
      operationId: q.operationId,
    });
    expect(
      f.sql
        .prepare(
          "SELECT count(*) n FROM sync_operations WHERE operation_type='CORE_V2_COMMAND'",
        )
        .get()?.n,
    ).toBe(1);
    expect(
      f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(q.operationId)
        ?.status,
    ).toBe("DEPENDENCY_BLOCKED");
    f.sql.close();
    const restarted = fixture(path, false),
      next = await restarted.repo.captureContext(trip);
    expect((await restarted.repo.pending(next))[0].command.target.id).toBe(item);
    expect((await restarted.repo.day(next, actor, "2026-12-14"))[0].row.position).toBe(
      "TNS",
    );
    expect((await restarted.repo.day(next, actor, "2026-12-14"))[0].localState).toBe(
      "PENDING",
    );
    expect(
      (await restarted.repo.day(next, actor, "2026-12-14"))[0].row.certificateGeneration,
    ).toBe(0);
  });
  it("rejects operation reuse mismatch without changing the queue", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      q = sparse();
    await f.repo.enqueue(ctx, q);
    await expect(
      f.repo.enqueue(ctx, {
        ...q,
        payload: { ...q.payload, flightNumberLiteral: "NZ1" },
      }),
    ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
    expect(f.sql.prepare("SELECT count(*) n FROM sync_operations").get()?.n).toBe(1);
  });
  it("installs complete hashed actor snapshot and projects accepted Day", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1),
      bundle = await collection();
    await f.repo.install(refresh, bundle.manifest, bundle.pages);
    expect((await f.repo.readGraph(ctx)).itinerary_events[0].id).toBe(item);
    expect(
      (await f.repo.day(ctx, actor, "2026-12-14"))[0].row.certificateGeneration,
    ).toBe(1);
    expect((await f.repo.day(ctx, actor, "2026-12-14"))[0].localState).toBe("ACCEPTED");
    await expect(
      f.repo.day(ctx, { ...actor, personId: randomUUID() }, "2026-12-14"),
    ).rejects.toThrow("CORE_PERSON_BINDING_MISMATCH");
  });
  it("persists revocation even before a first collection or scope exists", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip);
    await f.repo.revoke(ctx, 2);
    await expect(f.repo.enqueue(ctx, sparse())).rejects.toThrow("CORE_ACCESS_REVOKED");
    await expect(f.repo.beginRefresh(ctx, 1)).rejects.toThrow("CORE_ACCESS_REVOKED");
    expect(f.sql.prepare("SELECT count(*) n FROM sync_operations").get()?.n).toBe(0);
  });
  it("never treats missing or damaged pages as absence", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1),
      bundle = await collection();
    await f.repo.install(refresh, bundle.manifest, bundle.pages);
    await expect(f.repo.install(refresh, bundle.manifest, [])).rejects.toThrow(
      "CORE_READ_INCOMPLETE",
    );
    const damaged = structuredClone(bundle.pages);
    damaged[0].records = [];
    await expect(f.repo.install(refresh, bundle.manifest, damaged)).rejects.toThrow();
    expect((await f.repo.readGraph(ctx)).itinerary_events).toHaveLength(1);
  });
  it("fences late A responses across A→B→A generation changes", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1),
      bundle = await collection();
    let lease = await beginAccountTransition();
    f.switchTo(randomUUID());
    endAccountTransition(lease);
    const b = await f.repo.captureContext(trip);
    expect(await f.repo.pending(b)).toEqual([]);
    lease = await beginAccountTransition();
    f.switchTo(account);
    endAccountTransition(lease);
    await expect(f.repo.install(refresh, bundle.manifest, bundle.pages)).rejects.toThrow(
      "Account changed",
    );
    const fresh = await f.repo.captureContext(trip);
    expect(await f.repo.pending(fresh)).toEqual([]);
  });
  it("revocation withholds accepted cache and blocks old pending delivery", async () => {
    const f = fixture(),
      ctx = await f.repo.captureContext(trip),
      refresh = await f.repo.beginRefresh(ctx, 1),
      bundle = await collection();
    await f.repo.install(refresh, bundle.manifest, bundle.pages);
    await f.repo.enqueue(ctx, sparse());
    await f.repo.revoke(ctx, 2);
    await expect(f.repo.readGraph(ctx)).rejects.toThrow("CORE_ACCESS_REVOKED");
    await expect(f.repo.install(refresh, bundle.manifest, bundle.pages)).rejects.toThrow(
      "CORE_ACCESS_REVOKED",
    );
  });
});

async function ordinaryLocal() {
  const dir = mkdtempSync(join(tmpdir(), "otr-core-port-"));
  folders.push(dir);
  const local = fixture(join(dir, "core.sqlite"));
  const f = ordinaryFixture({ accountId: account, tripId: trip, personId: person });
  const epoch = randomUUID();
  const ctx = await local.repo.captureContext(trip);
  const install = async (revision = 1, graph = f.graph, ownPerson = person) => {
    const readActor = { ...f.actor, personId: ownPerson, personIds: [ownPerson] };
    const bundle = await buildCoreActorCollection(
      graph,
      readActor,
      { epoch, revision, accessRevision: 1, generatedAt: stamp },
      [
        {
          person_id: ownPerson,
          account_id: account,
          active: true,
          participating: true,
          revision,
        },
      ],
      hash,
      [],
      [],
      [],
      1,
    );
    await local.repo.install(
      await local.repo.beginRefresh(ctx, 1),
      bundle.manifest,
      bundle.pages,
    );
  };
  await install();
  const read = async (repo = local.repo, i = 0) => {
    const result = await repo.readTtr(ctx, f.orderId, f.ids[i], f.ids[i + 1]);
    expect(result.status).toBe("QUALIFIED");
    if (result.status !== "QUALIFIED") throw new Error("test relation unavailable");
    return result;
  };
  const captured = await read();
  // Test-owned stand-in for the unchanged nine-field TTR selection, in the same durable DB.
  local.sql.exec(
    "CREATE TABLE ttr_selections(account_id TEXT,trip_id TEXT,from_event_id TEXT,to_event_id TEXT,occurrence_discriminator TEXT,confirmed_mode TEXT,selected_at TEXT,applicable_event_date TEXT,expiry_zone_id TEXT)",
  );
  await withAccountApplyGate(() =>
    local.database.withTransactionAsync(async () => {
      expect(
        await local.repo.revalidateTtrWithinTransaction(
          ctx,
          f.orderId,
          f.ids[0],
          f.ids[1],
          captured,
        ),
      ).toBe(true);
      await local.database.runAsync(
        "INSERT INTO ttr_selections VALUES(?,?,?,?,?,?,?,?,?)",
        account,
        trip,
        f.ids[0],
        f.ids[1],
        "ordinary-test",
        "walking",
        stamp,
        "2027-01-15",
        "UTC",
      );
    }),
  );
  const selection = () =>
    expect(local.sql.prepare("SELECT confirmed_mode FROM ttr_selections").get()).toEqual({
      confirmed_mode: "walking",
    });
  const guard = (
    value = captured,
    repo = local.repo,
    handoff: (lease: CoreTtrPublicationLease) => undefined = () => {
      throw new Error("stale publication emitted");
    },
  ) => repo.guardTtrPublication(ctx, f.orderId, f.ids[0], f.ids[1], value, handoff);
  return { ...local, f, ctx, captured, read, install, selection, guard };
}

describe("Core coherent TTR post-commit publication port, CLOSED", () => {
  it("captures one coherent vector and hands off after the selection commits, preserving UNKNOWN 0m geometry", async () => {
    const a = await ordinaryLocal();
    const g = structuredClone(a.f.graph);
    g.itinerary_events[1].accepted_latitude = g.itinerary_events[0].accepted_latitude;
    g.itinerary_events[1].semantic_revision = 2;
    await a.install(2, g);
    const current = await a.read();
    expect(current.authority).toMatchObject({
      scope: a.ctx,
      personId: person,
      branchId: a.f.branchId,
      order: { id: a.f.orderId, revision: 1 },
      coverage: "NONE_PROVEN",
      from: { itemRevision: 1 },
      to: { itemRevision: 2 },
    });
    expect(current.authority.collection.access_revision).toBe(1);
    expect(current.authority.collection.applied_generation).toBe(
      current.authority.refreshGeneration,
    );
    expect(current.spatial.equivalence).toBe("UNKNOWN");
    expect(
      straightLineDistance(
        current.input.from!.endpoint!.coordinates!,
        current.input.to!.endpoint!.coordinates!,
      ),
    ).toBe(0);
    let lease!: CoreTtrPublicationLease;
    expect(
      await a.guard(current, a.repo, (l) => {
        lease = l;
        a.selection();
      }),
    ).toEqual({ status: "CURRENT" });
    let count = 0;
    expect(
      lease.ifCurrent(() => {
        count++;
      }),
    ).toBe(true);
    expect(count).toBe(1);
    const copy = lease.envelope;
    copy.authority.collection.access_revision = 99;
    expect(lease.envelope.authority.collection.access_revision).toBe(1);
    a.selection();
  });
  it.each([
    "access",
    "person",
    "branch",
    "ordering",
    "endpoint",
    "coverage",
    "snapshot",
  ] as const)(
    "suppresses %s changes after commit and preserves personal mode",
    async (change) => {
      const a = await ordinaryLocal(),
        g = structuredClone(a.f.graph);
      if (change === "access") await a.repo.revoke(a.ctx, 2);
      else if (change === "person") await a.install(2, g, randomUUID());
      else {
        const o = g.trip_person_ordinary_orders[0];
        if (change === "branch") {
          o.branch_id = randomUUID();
          o.revision = 2;
        }
        if (change === "ordering") {
          const nodes = o.nodes as { eventId: string }[];
          [nodes[0], nodes[1]] = [nodes[1], nodes[0]];
          o.gaps = nodes.slice(0, -1).map((n, i) => ({
            from: n.eventId,
            to: nodes[i + 1].eventId,
            coverage: "NONE_PROVEN",
            complete: true,
            transportId: null,
          }));
          o.revision = 2;
        }
        if (change === "endpoint") {
          g.itinerary_events[1].location_input_revision = 2;
          g.itinerary_events[1].semantic_revision = 2;
        }
        if (change === "coverage") {
          (o.gaps as { coverage: string; complete: boolean }[])[0].coverage = "UNKNOWN";
          (o.gaps as { complete: boolean }[])[0].complete = false;
          o.revision = 2;
        }
        await a.install(2, g);
      }
      expect((await a.guard()).status).not.toBe("CURRENT");
      a.selection();
    },
  );
  it("rejects newly explicit Transport coverage with its precise reason", async () => {
    const a = await ordinaryLocal(),
      id = randomUUID();
    const q = a.f.command(
      "CREATE_ITEM",
      id,
      {
        family: "P5",
        core: { title: "covered transport" },
        participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
        acl: { visibility: "GROUP", people: [] },
        endpoints: {
          origin: { time: ordinaryTime("09"), place: ordinaryPlace(1) },
          destination: { time: ordinaryTime("10"), place: ordinaryPlace(2) },
        },
        service: {
          service_key: "rail.one",
          transport_subtype: "TRAIN",
          attribution: "UNSPECIFIED",
          operator_namespace: "NAME",
          operator_issuer: "SUPPLIER",
          operator_value: "Synthetic Rail",
          operator_literal: "Synthetic Rail",
          service_number: "1",
          service_literal: "Rail 1",
          codeshare_operating_key: null,
        },
      },
      [{ kind: "ITEM", id, revision: null }],
    );
    const g = applyCoreCommand(a.f.graph, q, a.f.actor, stamp).graph;
    const o = g.trip_person_ordinary_orders[0];
    o.revision = 2;
    (o.gaps as { coverage: string; transportId: string | null }[])[0].coverage =
      "EXPLICIT_TRANSPORT";
    (o.gaps as { transportId: string | null }[])[0].transportId = id;
    await a.install(2, g);
    expect(await a.guard()).toEqual({
      status: "UNAVAILABLE",
      reason: "EXPLICIT_TRANSPORT",
    });
    a.selection();
  });
  it("rejects tampered metadata and in-flight refresh, preserving offline accepted data", async () => {
    const a = await ordinaryLocal(),
      fake = structuredClone(a.captured);
    fake.authority.collection.manifest_sha256 = "0".repeat(64);
    expect(await a.guard(fake)).toEqual({ status: "STALE", reason: "AUTHORITY_CHANGED" });
    await a.repo.beginRefresh(a.ctx, 1);
    expect((await a.read()).status).toBe("QUALIFIED");
    expect(await a.guard()).toEqual({ status: "STALE", reason: "REFRESH_PENDING" });
    a.selection();
  });
  it("closes queued refresh race at synchronous handoff and fences late emissions across repository instances", async () => {
    const a = await ordinaryLocal();
    let unblock!: () => void, entered!: () => void;
    const reached = new Promise<void>((r) => {
      entered = r;
    });
    const pause = new Promise<void>((r) => {
      unblock = r;
    });
    let waiting = true;
    const slowHash = async (b: Uint8Array) => {
      if (waiting) {
        waiting = false;
        entered();
        await pause;
      }
      return hash(b);
    };
    const other = createTripCoreV2Repository(
      a.database,
      async () => account,
      slowHash,
      () => stamp,
    );
    let lease!: CoreTtrPublicationLease;
    const publication = a.guard(a.captured, other, (l) => {
      lease = l;
      expect(l.isCurrent()).toBe(true);
    });
    await reached;
    const refresh = a.repo.beginRefresh(a.ctx, 1);
    unblock();
    expect(await publication).toEqual({ status: "CURRENT" });
    await refresh;
    expect(lease.isCurrent()).toBe(false);
    expect(
      lease.ifCurrent(() => {
        throw new Error("late emission");
      }),
    ).toBe(false);
    a.selection();
  });
  it("fences Account generation and retains independent C→D qualification after a B edit", async () => {
    const a = await ordinaryLocal();
    const cd = await a.read(a.repo, 2);
    let lease!: CoreTtrPublicationLease;
    await a.guard(a.captured, a.repo, (l) => {
      lease = l;
    });
    const g = structuredClone(a.f.graph);
    g.itinerary_events[1].start_zone_id = null;
    g.itinerary_events[1].semantic_revision = 2;
    await a.install(2, g);
    const fresh = await a.read(a.repo, 2);
    expect(fresh.input).toEqual(cd.input);
    expect(fresh.authorityKey).not.toBe(cd.authorityKey);
    expect(
      await a.repo.guardTtrPublication(
        a.ctx,
        a.f.orderId,
        a.f.ids[2],
        a.f.ids[3],
        fresh,
        () => undefined,
      ),
    ).toEqual({ status: "CURRENT" });
    expect(lease.isCurrent()).toBe(false);
    const transition = await beginAccountTransition();
    endAccountTransition(transition);
    expect(await a.guard()).toEqual({
      status: "UNAVAILABLE",
      reason: "ACCESS_UNAVAILABLE",
    });
    a.selection();
  });
});

it("Core publication denies a queued Account transition and wrong Trip without touching the nine-field row", async () => {
  const a = await ordinaryLocal();
  let release!: () => void, entered!: () => void;
  const arrived = new Promise<void>((r) => {
      entered = r;
    }),
    pause = new Promise<void>((r) => {
      release = r;
    });
  let blocked = false;
  const repo = createTripCoreV2Repository(
    a.database,
    async () => account,
    async (b) => {
      if (!blocked) {
        blocked = true;
        entered();
        await pause;
      }
      return hash(b);
    },
    () => stamp,
  );
  const guard = a.guard(a.captured, repo);
  await arrived;
  const transition = beginAccountTransition();
  release();
  expect(await guard).toEqual({ status: "UNAVAILABLE", reason: "ACCESS_UNAVAILABLE" });
  endAccountTransition(await transition);
  const ctx = await a.repo.captureContext(randomUUID());
  expect(
    await a.repo.guardTtrPublication(
      ctx,
      a.f.orderId,
      a.f.ids[0],
      a.f.ids[1],
      a.captured,
      () => {
        throw new Error("wrong Trip published");
      },
    ),
  ).toMatchObject({ status: "UNAVAILABLE" });
  expect(a.sql.prepare("PRAGMA table_info(ttr_selections)").all()).toHaveLength(9);
  a.selection();
});
async function lostP1RecoveryFixture(
  reviewed = false,
  family: "P1" | "P2" | "P3" | "P5" = "P1",
) {
  const f = fixture();
  const ctx = await f.repo.captureContext(trip);
  let p5Payload: unknown;
  if (family === "P5") {
    const { universalP1SourceFixture } =
      await import("../../../backend/src/__fixtures__/universalP1Source");
    const source = await universalP1SourceFixture(
      undefined,
      undefined,
      "2026-11-03",
      "P5",
    );
    Object.assign(source.input.selection, {
      sourceReview: {
        version: "otr.universal.p5-source-review/1",
        decision: "NEW",
        sourceRevision: 1,
        title: "Coastal QA Train",
        localDate: "2026-11-03",
        originalReviewed: true,
        tripReviewed: true,
      },
    });
    p5Payload = (await source.run()).body.plan.slots[0].payload;
  }
  const command = {
    ...sparse(),
    admission: {
      mode: reviewed ? "REVIEWED_SOURCE" : "MANUAL",
      sourceIntentId: reviewed ? randomUUID() : null,
      policyVersion: null,
    },
    command:
      family === "P2" ? ("CREATE_SPARSE_FLIGHT" as const) : ("CREATE_ITEM" as const),
    payload:
      family === "P2"
        ? sparse().payload
        : family === "P5"
          ? p5Payload
          : {
              family,
              core: { title: "Lost P1 response" },
              schedule:
                family === "P3"
                  ? {
                      start: coreDateBoundary("2026-11-02"),
                      end: coreDateBoundary("2026-11-03"),
                    }
                  : { start: ordinaryTime() },
              place: ordinaryPlace(),
              ...coreDefaults("member"),
            },
  };
  await f.repo.enqueue(ctx, command);
  let graph = emptyCoreGraph();
  let stored: { domainReceiptId: string; receiptText: string } | null = null;
  const storage: CoreCommandStorage = {
    async withLockedCommand(_scope, work) {
      return work({
        actor,
        readReceipt: async () => stored,
        hasLegacyOperation: async () => false,
        canReadReceipt: async () => true,
        enabledCommands: async () => [command.command],
        readLockedGraph: async () => graph,
        verifyAdmission: async () => {},
        lifecycleGraphHash: async () => undefined,
        async commit(mutation, receipt) {
          if (mutation) graph = mutation.graph;
          stored = {
            domainReceiptId: randomUUID(),
            receiptText: JSON.stringify(receipt),
          };
          return stored.domainReceiptId;
        },
      });
    },
  };
  const receipt = await executeCoreCommandV2(
    storage,
    account,
    trip,
    command,
    hash,
    () => stamp,
  );
  const due = "2099-01-01T00:00:00Z";
  f.sql
    .prepare(
      "UPDATE sync_operations SET status='RETRYABLE',attempt_count=7,next_attempt_at=?,failure_category='NETWORK' WHERE id=?",
    )
    .run(due, command.operationId);
  const transport = {
    receipt: async () => receipt,
    collection: async () => collection(true, graph),
  };
  return { ...f, ctx, command, receipt, due, transport };
}
it("recovers accepted P1 through readonly same-operation receipt and verified collection before future retry", async () => {
  const f = await lostP1RecoveryFixture();
  expect(await f.repo.recoverP1Receipts(f.ctx, f.transport)).toEqual({ recovered: 1 });
  expect(
    f.sql
      .prepare(
        "SELECT status,next_attempt_at,attempt_count FROM sync_operations WHERE id=?",
      )
      .get(f.command.operationId),
  ).toMatchObject({ status: "COMPLETED", next_attempt_at: null, attempt_count: 7 });
  expect(await f.repo.pending(f.ctx)).toEqual([]);
  expect((await f.repo.readGraph(f.ctx)).itinerary_events[0].experience_family).toBe(
    "P1",
  );
  expect(
    await f.repo.recoverP1Receipts(f.ctx, {
      receipt: async () => {
        throw Error("no repeated read");
      },
      collection: async () => {
        throw Error("no repeated read");
      },
    }),
  ).toEqual({ recovered: 0 });
});
it("missing or status-only P1 receipt never changes future business retry or submits", async () => {
  for (const projection of [
    null,
    {
      projection: "STATUS_ONLY",
      domainReceiptId: randomUUID(),
      receiptSha256: "a".repeat(64),
      operationId: randomUUID(),
      outcome: "APPLIED",
      targetRevision: null,
    },
  ] as const) {
    const f = await lostP1RecoveryFixture();
    expect(
      await f.repo.recoverP1Receipts(f.ctx, {
        ...f.transport,
        receipt: async () => projection,
        collection: async () => {
          throw Error("must not collect");
        },
      }),
    ).toEqual({ recovered: 0 });
    expect(
      f.sql
        .prepare("SELECT status,next_attempt_at FROM sync_operations WHERE id=?")
        .get(f.command.operationId),
    ).toMatchObject({ status: "RETRYABLE", next_attempt_at: f.due });
  }
});
it("failed collection preserves future retry despite durable accepted receipt", async () => {
  const f = await lostP1RecoveryFixture();
  await expect(
    f.repo.recoverP1Receipts(f.ctx, {
      ...f.transport,
      collection: async () => {
        throw Error("read unavailable");
      },
    }),
  ).rejects.toThrow("read unavailable");
  expect(
    f.sql
      .prepare("SELECT status,next_attempt_at FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toMatchObject({ status: "RETRYABLE", next_attempt_at: f.due });
  expect((await f.repo.pending(f.ctx))[0].state).toBe("APPLIED");
});
it("readonly recovery cannot ACK over a newer live queue claim", async () => {
  const f = await lostP1RecoveryFixture();
  expect(
    await f.repo.recoverP1Receipts(f.ctx, {
      ...f.transport,
      collection: async () => {
        f.sql
          .prepare(
            "UPDATE sync_operations SET status='PROCESSING',claim_owner='new-owner' WHERE id=?",
          )
          .run(f.command.operationId);
        return f.transport.collection();
      },
    }),
  ).toEqual({ recovered: 0 });
  expect(
    f.sql
      .prepare("SELECT status,claim_owner FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toMatchObject({ status: "PROCESSING", claim_owner: "new-owner" });
});
it("readonly recovery fences Account changes and altered queue pins", async () => {
  const f = await lostP1RecoveryFixture();
  await expect(
    f.repo.recoverP1Receipts(f.ctx, {
      ...f.transport,
      receipt: async () => {
        f.switchTo(randomUUID());
        return f.receipt;
      },
    }),
  ).rejects.toThrow();
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(f.command.operationId)?.status,
  ).toBe("RETRYABLE");
  const tampered = await lostP1RecoveryFixture();
  tampered.sql
    .prepare("UPDATE sync_operations SET payload_json='{}' WHERE id=?")
    .run(tampered.command.operationId);
  await expect(
    tampered.repo.recoverP1Receipts(tampered.ctx, {
      ...tampered.transport,
      receipt: async () => {
        throw Error("network must not start");
      },
    }),
  ).rejects.toThrow("CORE_RECOVERY_QUEUE_PIN");
});
it("auth-paused and never-dispatched P1 commands are excluded from automatic readonly recovery", async () => {
  for (const change of ["attempt_count=0", "failure_category='AUTH'"]) {
    const f = await lostP1RecoveryFixture();
    f.sql.exec("UPDATE sync_operations SET " + change);
    expect(
      await f.repo.recoverP1Receipts(f.ctx, {
        ...f.transport,
        receipt: async () => {
          throw Error("must not request");
        },
      }),
    ).toEqual({ recovered: 0 });
  }
});
it.each([
  [false, "P1"],
  [true, "P1"],
  [false, "P3"],
  [true, "P3"],
  [false, "P2"],
  [true, "P2"],
  [false, "P5"],
  [true, "P5"],
] as const)(
  "resumes only accepted Source finalization after EVIDENCE_PENDING (reconciled: %s, family:%s)",
  async (reconciled, family) => {
    const f = await lostP1RecoveryFixture(true, family);
    f.sql.exec(
      "UPDATE sync_operations SET status='DEPENDENCY_BLOCKED',next_attempt_at=NULL,attempt_count=0",
    );
    let submits = 0,
      reads = 0,
      finalizations = 0;
    const transport = {
      capabilities: async () => ({
        ...coreClosedCapabilities,
        activationState: "ENABLED",
        enabledCommands: [f.command.command],
        enabledFamilies: [family],
        enabledAdmissionModes: ["REVIEWED_SOURCE"],
        sourceEvidenceAvailable: true,
      }),
      receipt: async () => (++reads === 1 ? null : f.receipt),
      submit: async () => {
        submits++;
        return f.receipt;
      },
      finalizeSourceOperation: async () => ({
        captureVersion: 2,
        slotId: f.command.admission.sourceIntentId!,
        state: ++finalizations === 1 ? "EVIDENCE_PENDING" : "COMPLETE",
        errorCode: null,
      }),
    };
    let queueTime = Date.now();
    const queue = createSyncOperationRepository(
      f.database,
      async () => account,
      () => new Date(queueTime).toISOString(),
    );
    const run = () =>
      createCoreV2SyncCoordinator(
        queue,
        createCoreV2SyncWorker(f.repo, transport as never, async () => account, hash),
        f.repo,
        trip,
        f.command.operationId,
      ).run("AUTHENTICATED_ONLINE");
    await run();
    expect((await f.repo.pending(f.ctx, f.command.operationId))[0].state).toBe("APPLIED");
    if (reconciled) {
      await f.repo.refresh(f.ctx, f.transport);
      f.sql
        .prepare(
          "UPDATE sync_operations SET status='DEPENDENCY_BLOCKED',next_attempt_at=NULL WHERE id=?",
        )
        .run(f.command.operationId);
    }
    queueTime += 120000;
    await run();
    expect(finalizations).toBe(2);
    expect(submits).toBe(1);
    expect(
      f.sql
        .prepare("SELECT status FROM sync_operations WHERE id=?")
        .get(f.command.operationId)!.status,
    ).toBe("COMPLETED");
  },
);

it.each(["MANUAL", "missingReceipt", "changedReceipt"])(
  "does not unblock unrelated or unverified APPLIED %s for Source recovery",
  async (kind) => {
    const f = await lostP1RecoveryFixture(kind !== "MANUAL");
    if (f.receipt.projection !== "FULL") throw Error("FULL_REQUIRED");
    await f.repo.applyReceipt(f.ctx, f.receipt.receipt);
    f.sql
      .prepare(
        "UPDATE sync_operations SET status='DEPENDENCY_BLOCKED',next_attempt_at=NULL WHERE id=?",
      )
      .run(f.command.operationId);
    if (kind === "missingReceipt")
      f.sql
        .prepare(
          "DELETE FROM trip_core_trip_core_command_receipts WHERE account_id=? AND operation_id=?",
        )
        .run(account, f.command.operationId);
    if (kind === "changedReceipt") {
      expect(() =>
        f.sql
          .prepare(
            "UPDATE trip_core_trip_core_command_receipts SET body_json=json_set(body_json,'$.actorAccountId',?) WHERE account_id=? AND operation_id=?",
          )
          .run(randomUUID(), account, f.command.operationId),
      ).toThrow("CORE_RECEIPT_IMMUTABLE");
    } else await f.repo.resume(f.ctx, f.command.operationId);
    expect(
      f.sql
        .prepare("SELECT status FROM sync_operations WHERE id=?")
        .get(f.command.operationId)!.status,
    ).toBe("DEPENDENCY_BLOCKED");
  },
);
