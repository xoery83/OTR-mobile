import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { coreReceiptStatus } from "../../../backend/src/tripCoreV2Commands";
import { createTripInstructionCorrectionLifecycle } from "./tripInstructionCorrectionLifecycle";
import { createCoreCorrectionQueueLifecycle } from "./syncOperationRepository";
import {
  createCoreV2SyncWorker,
  createCoreV2SyncCoordinator,
  assertCoreInstructionNewSubmit,
  type CoreSyncTransport,
} from "./tripCoreV2SyncWorker";
import {
  validateCoreCommand,
  coreClosedCapabilities,
} from "../../domain/trip/tripCoreV2Commands";
import type { CoreReceiptProjection } from "../../domain/trip/tripCoreV2Receipt";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, it, expect, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
} from "../repositories/tripCoreV2Repository";
import {
  createSyncOperationRepository,
  type SyncOperation,
} from "./syncOperationRepository";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "../../domain/trip/tripCoreV2Mutation";
import { coreDateBoundary } from "../../domain/trip/tripCoreV2Temporal";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import {
  executeCoreCommandV2,
  type CoreCommandStorage,
} from "../../../backend/src/tripCoreV2Commands";
const native = vi.hoisted(() => ({
  database: null as unknown,
  transport: null as unknown,
  accountId: "",
  tripId: "",
  operationId: "",
}));
vi.mock("../db/database", () => ({
  readInitializedDatabase: async () => native.database,
}));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: async () => native.accountId,
}));
vi.mock("../repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({}),
}));
vi.mock("../api/tripCoreV2Transport", () => ({
  createCoreV2Transport: () => native.transport,
}));
vi.mock("./tripNormalSync", async (original) => ({
  ...(await original<typeof import("./tripNormalSync")>()),
  createNormalTripSyncWake:
    (deps: {
      runP1(target: {
        accountId: string;
        tripId: string;
        operationId: string;
      }): Promise<unknown>;
    }) =>
    () =>
      deps.runP1({
        accountId: native.accountId,
        tripId: native.tripId,
        operationId: native.operationId,
      }),
}));
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));
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
const connections: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
  for (const db of connections.splice(0)) {
    try {
      db.close();
    } catch {}
  }
});
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
function fixture(path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  let active: string = account;
  let clockValue = stamp;
  const now = () => clockValue;
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
    repo: createTripCoreV2Repository(database, async () => active, hash, now),
    identity: async () => active,
    now,
    setClock: (value: string) => {
      clockValue = value;
    },
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
function p3InstructionCommands(id = randomUUID()) {
  const create = {
    ...sparse(),
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    payload: {
      family: "P3",
      core: { title: "Accepted Stay" },
      schedule: {
        start: coreDateBoundary("2026-12-14"),
        end: coreDateBoundary("2026-12-17"),
      },
      ...coreDefaults("member"),
    },
  };
  const entry = randomUUID();
  const append = {
    ...create,
    operationId: randomUUID(),
    command: "APPEND_INSTRUCTION",
    target: { kind: "INSTRUCTION", id: entry },
    baseVector: [
      { kind: "INSTRUCTION", id: entry, revision: null },
      { kind: "ITEM", id, revision: 1 },
    ],
    payload: {
      itemId: id,
      section: "ARRIVAL",
      body: "Call at reception.",
      sensitivity: "NORMAL",
      sourceRepresentationId: null,
      acl: { visibility: "GROUP", people: [] },
    },
  };
  return { create, append, id, entry };
}
async function queuedCorrectionFixture(path = ":memory:") {
  const f = fixture(path),
    ctx = await f.repo.captureContext(trip),
    q = p3InstructionCommands();
  let server = applyCoreCommand(emptyCoreGraph(), q.create, actor, stamp).graph;
  const initial = await collection(true, server);
  await f.repo.install(
    await f.repo.beginRefresh(ctx, 1),
    initial.manifest,
    initial.pages,
  );
  await f.repo.commitManualBatch(ctx, async () => ({
    commands: [q.append],
    result: async () => true,
  }));
  const storage: CoreCommandStorage = {
    withLockedCommand: async (_scope, work) =>
      work({
        actor,
        readReceipt: async () => null,
        hasLegacyOperation: async () => false,
        canReadReceipt: async () => true,
        enabledCommands: async () => ["APPEND_INSTRUCTION", "CORRECT_INSTRUCTION"],
        readLockedGraph: async () => server,
        verifyAdmission: async () => {},
        lifecycleGraphHash: async () => undefined,
        commit: async (mutation) => {
          if (mutation) server = mutation.graph;
          return randomUUID();
        },
      }),
  };
  const rootReceipt = await executeCoreCommandV2(
    storage,
    account,
    trip,
    q.append,
    hash,
    () => stamp,
  );
  if (rootReceipt.projection !== "FULL") throw Error("TEST_EXPECTED_FULL");
  await f.repo.applyReceipt(ctx, rootReceipt.receipt);
  const refresh = async (revision: number) => {
    const bundle = await buildCoreActorCollection(
      server,
      actor,
      { epoch: initial.manifest.epoch, revision, accessRevision: 1, generatedAt: stamp },
      [
        {
          person_id: person,
          account_id: account,
          active: true,
          participating: true,
          revision: 1,
        },
      ],
      hash,
    );
    await f.repo.install(
      await f.repo.beginRefresh(ctx, 1),
      bundle.manifest,
      bundle.pages,
    );
  };
  await refresh(3);
  expect(await f.repo.manualInstructionEligibility(ctx, q.id, q.entry)).toEqual({
    status: "ELIGIBLE",
  });
  const newEntryId = randomUUID();
  const command = {
    ...q.append,
    operationId: randomUUID(),
    command: "CORRECT_INSTRUCTION",
    baseVector: [
      { kind: "INSTRUCTION", id: q.entry, revision: 1 },
      { kind: "INSTRUCTION", id: newEntryId, revision: null },
      { kind: "ITEM", id: q.id, revision: 2 },
    ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    payload: {
      newEntryId,
      body: "Use side reception bell.",
      sensitivity: "NORMAL",
      acl: { visibility: "GROUP", people: [] },
    },
  };
  await f.repo.commitManualBatch(ctx, async () => ({
    commands: [command],
    result: async () => true,
  }));
  return { ...f, ctx, q, command, server, serverGraph: () => server, refresh, storage };
}
async function correctionObserved(
  f: Awaited<ReturnType<typeof queuedCorrectionFixture>>,
) {
  await f.repo.resume(f.ctx, f.command.operationId);
  return f.sql
    .prepare(
      `SELECT id,trip_id AS tripId,entity_type AS entityType,entity_id AS entityId,
    operation_type AS operationType,idempotency_key AS idempotencyKey,base_version AS baseVersion,
    payload_json AS payloadJson,owner_user_id AS ownerUserId,status,attempt_count AS attemptCount,
    next_attempt_at AS nextAttemptAt,dependency_operation_id AS dependencyOperationId,
    claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations WHERE id=?`,
    )
    .get(f.command.operationId) as unknown as SyncOperation;
}

it("stale completion must not overwrite a newer exact CORRECT claim", async () => {
  const f = await queuedCorrectionFixture();
  const observed = await correctionObserved(f);
  const claimed = await f.repo.claimQueuedManualInstructionCorrection(f.ctx, observed);
  if (claimed.kind !== "CLAIMED") throw Error("TEST_EXPECTED_CLAIM");
  f.sql
    .prepare("UPDATE sync_operations SET claim_owner=? WHERE id=?")
    .run("newer-claim-identity", f.command.operationId);
  const lifecycle = createCoreCorrectionQueueLifecycle(
    f.database,
    f.identity,
    hash,
    f.now,
  );
  expect(await lifecycle.settle(f.ctx, observed, claimed.claim)).toBe(false);
  expect(
    f.sql
      .prepare("SELECT status,claim_owner FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toMatchObject({ status: "PROCESSING", claim_owner: "newer-claim-identity" });
});

function adapter(
  f: Awaited<ReturnType<typeof queuedCorrectionFixture>>,
  options: { lostResponse?: boolean; mutateReceiptMetadata?: boolean } = {},
) {
  let remote: CoreReceiptProjection | null = null;
  const reads: number[] = [];
  let mutated = false;
  const transport: CoreSyncTransport = {
    capabilities: vi.fn(async () => ({
      ...coreClosedCapabilities,
      activationState: "ENABLED",
      enabledCommands: ["CORRECT_INSTRUCTION"],
      enabledAdmissionModes: ["MANUAL"],
      enabledFamilies: ["P3"],
    })),
    receipt: vi.fn(async () => {
      const row = f.sql
        .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
        .get(f.command.operationId)!;
      reads.push(Number(row.attempt_count));
      if (options.mutateReceiptMetadata && row.status === "PROCESSING" && !mutated) {
        mutated = true;
        f.sql
          .prepare(
            "UPDATE sync_operations SET last_request_id='unexpected-read-side-effect' WHERE id=?",
          )
          .run(f.command.operationId);
      }
      return remote;
    }),
    submit: vi.fn(async (ctx, command) => {
      expect(ctx.accountId).toBe(account);
      expect(command.operationId).toBe(f.command.operationId);
      expect(
        f.sql
          .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
          .get(command.operationId)!.state,
      ).toBe("IN_FLIGHT");
      expect(
        f.sql
          .prepare("SELECT attempt_count FROM sync_operations WHERE id=?")
          .get(command.operationId)!.attempt_count,
      ).toBe(1);
      remote = await executeCoreCommandV2(f.storage, account, trip, command, hash, f.now);
      if (options.lostResponse) throw new Error("TEST_RESPONSE_LOST_AFTER_SERVER_COMMIT");
      return remote;
    }),
  };
  const queue = createSyncOperationRepository(f.database, f.identity, f.now, {
    accountId: account,
    tripId: trip,
    operationId: f.command.operationId,
  });
  const lifecycle = createTripInstructionCorrectionLifecycle({
    database: f.database,
    core: f.repo,
    queue,
    transport,
    account: f.identity,
    hash,
    operationId: f.command.operationId,
    tripId: trip,
    context: f.ctx,
    now: f.now,
    preflight: () =>
      assertCoreInstructionNewSubmit(
        f.repo,
        transport,
        f.ctx,
        validateCoreCommand(f.command),
        f.identity,
        () => true,
      ),
  });
  const worker = createCoreV2SyncWorker(
    f.repo,
    transport,
    f.identity,
    hash,
    () => true,
    lifecycle.noteSubmit,
  );
  return {
    transport,
    lifecycle,
    worker,
    reads,
    getRemote: () => remote,
    setRemote: (value: CoreReceiptProjection | null) => {
      remote = value;
    },
    run: () =>
      createCoreV2SyncCoordinator(
        lifecycle.queue,
        worker,
        f.repo,
        trip,
        f.command.operationId,
      ).run("AUTHENTICATED_ONLINE"),
  };
}
it("existing Engine hooks complete actual SQLite claim -> consume -> original transport -> receipt -> same-claim settlement", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const result = await a.run();
  expect(result.processedCount).toBe(1);
  expect(a.transport.submit).toHaveBeenCalledTimes(1);
  expect(a.reads.every((count) => count === 0)).toBe(true);
  expect(
    f.sql
      .prepare("SELECT status,claim_owner,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "COMPLETED", claim_owner: null, attempt_count: 1 });
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(f.command.operationId)!.state,
  ).toBe("APPLIED");
  const stored = f.sql
    .prepare(
      "SELECT body_json FROM trip_core_trip_core_command_receipts WHERE operation_id=?",
    )
    .get(f.command.operationId)!;
  expect(JSON.parse(String(stored.body_json))).toMatchObject({
    operationId: f.command.operationId,
    outcome: "APPLIED",
  });
  await f.refresh(4);
  expect(
    (await f.repo.acceptedSnapshot(f.ctx))!.graph.trip_instruction_entries.find(
      (r) => r.id === (f.command.payload as { newEntryId: string }).newEntryId,
    )!.body,
  ).toBe("Use side reception bell.");
});
it("lost response keeps original IN_FLIGHT and recovers its receipt without second submit", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f, { lostResponse: true });
  await a.run();
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(f.command.operationId)!.state,
  ).toBe("IN_FLIGHT");
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toMatchObject({ status: "DEPENDENCY_BLOCKED", attempt_count: 1 });
  expect(a.transport.submit).toHaveBeenCalledTimes(1);
  await a.run();
  expect(a.transport.submit).toHaveBeenCalledTimes(1);
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toMatchObject({ status: "COMPLETED", attempt_count: 1 });
});
it("receipt metadata mutation after claim invalidates consume; null recovery never completes or falls back to submit", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f, { mutateReceiptMetadata: true });
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare(
        "SELECT status,attempt_count,last_request_id FROM sync_operations WHERE id=?",
      )
      .get(f.command.operationId),
  ).toMatchObject({
    status: "DEPENDENCY_BLOCKED",
    attempt_count: 0,
    last_request_id: "unexpected-read-side-effect",
  });
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(f.command.operationId)!.state,
  ).not.toBe("APPLIED");
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toMatchObject({ status: "DEPENDENCY_BLOCKED", attempt_count: 0 });
});

it("generic ITEM recovery does not steal a live opaque Core claim and still recovers owner-null ordinary operations", async () => {
  const f = await queuedCorrectionFixture();
  const observed = await correctionObserved(f);
  const claimed = await f.repo.claimQueuedManualInstructionCorrection(f.ctx, observed);
  if (claimed.kind !== "CLAIMED") throw Error("TEST_EXPECTED_CLAIM");
  const ordinaryId = randomUUID();
  const ordinary = { ...f.q.create, operationId: ordinaryId };
  f.sql
    .prepare(
      `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,
    base_version,payload_json,owner_user_id,status,attempt_count,next_attempt_at,claim_owner,lease_expires_at,last_attempt_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,NULL,?,?, 'PROCESSING',0,NULL,NULL,NULL,?,?,?)`,
    )
    .run(
      ordinaryId,
      trip,
      "TRIP_CORE_V2",
      f.q.id,
      "CORE_V2_COMMAND",
      ordinaryId,
      JSON.stringify(ordinary),
      account,
      stamp,
      stamp,
      stamp,
    );
  await createSyncOperationRepository(f.database, f.identity, f.now).recoverInterrupted();
  expect(
    f.sql
      .prepare("SELECT status,claim_owner FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "PROCESSING", claim_owner: claimed.claim.claimOwner });
  expect(
    f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(ordinaryId)!
      .status,
  ).toBe("RETRYABLE");
});
it("concurrent exact Engine wakes preserve one actual claim and one original submit", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const results = await Promise.all([a.run(), a.run()]);
  expect(results.reduce((n, r) => n + r.processedCount, 0)).toBe(1);
  expect(a.transport.submit).toHaveBeenCalledTimes(1);
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "COMPLETED", attempt_count: 1 });
});
it("an error-free settle without a validated durable receipt stays nonterminal", async () => {
  const f = await queuedCorrectionFixture(),
    observed = await correctionObserved(f);
  const claimed = await f.repo.claimQueuedManualInstructionCorrection(f.ctx, observed);
  if (claimed.kind !== "CLAIMED") throw Error("TEST_EXPECTED_CLAIM");
  expect(
    await createCoreCorrectionQueueLifecycle(f.database, f.identity, hash, f.now).settle(
      f.ctx,
      observed,
      claimed.claim,
    ),
  ).toBe(true);
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "DEPENDENCY_BLOCKED", attempt_count: 0 });
});
it("missing local accepted origin proof cannot be replaced by a null Source or an ordinary submit fallback", async () => {
  const f = await queuedCorrectionFixture();
  f.sql
    .prepare("DELETE FROM trip_core_trip_core_command_receipts WHERE operation_id=?")
    .run(f.q.append.operationId);
  const a = adapter(f);
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "DEPENDENCY_BLOCKED", attempt_count: 0 });
});
it("wrong claim owner/digest/operation and changed original Account/Trip/payload cannot settle the queue", async () => {
  const f = await queuedCorrectionFixture(),
    observed = await correctionObserved(f);
  const claimed = await f.repo.claimQueuedManualInstructionCorrection(f.ctx, observed);
  if (claimed.kind !== "CLAIMED") throw Error("TEST_EXPECTED_CLAIM");
  const lifecycle = createCoreCorrectionQueueLifecycle(
    f.database,
    f.identity,
    hash,
    f.now,
  );
  const before = f.sql
    .prepare("SELECT * FROM sync_operations WHERE id=?")
    .get(f.command.operationId);
  for (const claim of [
    { ...claimed.claim, claimOwner: "wrong-owner" },
    { ...claimed.claim, intentSha256: "a".repeat(64) },
    { ...claimed.claim, operationId: randomUUID() },
  ])
    expect(await lifecycle.settle(f.ctx, observed, claim)).toBe(false);
  for (const changed of [
    { ...observed, tripId: randomUUID() },
    { ...observed, payloadJson: "{}" },
    { ...observed, ownerUserId: randomUUID() },
  ])
    await expect(lifecycle.settle(f.ctx, changed, claimed.claim)).rejects.toThrow(
      "QUEUE_BINDING",
    );
  f.switchTo(randomUUID());
  await expect(lifecycle.settle(f.ctx, observed, claimed.claim)).rejects.toThrow();
  expect(
    f.sql.prepare("SELECT * FROM sync_operations WHERE id=?").get(f.command.operationId),
  ).toEqual(before);
});
it("live claim is not stolen by another exact wake; expired claim recovers only the original receipt", async () => {
  const f = await queuedCorrectionFixture(),
    observed = await correctionObserved(f);
  const claimed = await f.repo.claimQueuedManualInstructionCorrection(f.ctx, observed);
  if (claimed.kind !== "CLAIMED") throw Error("TEST_EXPECTED_CLAIM");
  const a = adapter(f);
  expect((await a.run()).processedCount).toBe(0);
  expect(a.transport.receipt).toHaveBeenCalled();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT claim_owner FROM sync_operations WHERE id=?")
      .get(f.command.operationId)!.claim_owner,
  ).toBe(claimed.claim.claimOwner);
  f.setClock("2026-10-12T00:06:00Z");
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "DEPENDENCY_BLOCKED", attempt_count: 0 });
});
it("formal conflict and rejection receipts retain their outcome instead of appearing Synced", async () => {
  for (const rejected of [false, true]) {
    const f = await queuedCorrectionFixture(),
      a = adapter(f);
    if (rejected) {
      const original = f.storage.withLockedCommand;
      f.storage.withLockedCommand = (scope, work) =>
        original(scope, (tx) =>
          work({
            ...tx,
            verifyAdmission: async () => {
              throw Error("SCOPE_NOT_AUTHORIZED");
            },
          }),
        );
    } else f.server.itinerary_events[0].semantic_revision = 3;
    await a.run();
    expect(a.transport.submit).toHaveBeenCalledOnce();
    expect(
      f.sql
        .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
        .get(f.command.operationId)!.state,
    ).toBe(rejected ? "REVIEW" : "CONFLICT");
    expect(
      f.sql
        .prepare("SELECT status FROM sync_operations WHERE id=?")
        .get(f.command.operationId)!.status,
    ).toBe(rejected ? "FAILED" : "CONFLICT");
  }
});

it("cold SQLite reopen preserves a live claim, then uses expired-claim receipt-only recovery without re-submission", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-native-claim-cold-"));
  folders.push(folder);
  const path = join(folder, "core.sqlite");
  const f = await queuedCorrectionFixture(path),
    observed = await correctionObserved(f);
  const claimed = await f.repo.claimQueuedManualInstructionCorrection(f.ctx, observed);
  if (claimed.kind !== "CLAIMED") throw Error("TEST_EXPECTED_CLAIM");
  f.sql.close();
  const reopened = fixture(path, false);
  const cold = { ...f, ...reopened, ctx: await reopened.repo.captureContext(trip) };
  const a = adapter(cold);
  expect((await a.run()).processedCount).toBe(0);
  expect(
    cold.sql
      .prepare("SELECT claim_owner FROM sync_operations WHERE id=?")
      .get(f.command.operationId)!.claim_owner,
  ).toBe(claimed.claim.claimOwner);
  cold.setClock("2026-10-12T00:06:00Z");
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    cold.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "DEPENDENCY_BLOCKED", attempt_count: 0 });
  const original = await executeCoreCommandV2(
    f.storage,
    account,
    trip,
    f.command,
    hash,
    cold.now,
  );
  a.setRemote(original);
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    cold.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(f.command.operationId)!.status,
  ).toBe("COMPLETED");
  expect(
    cold.sql
      .prepare("SELECT count(*) n FROM sync_operations WHERE id=?")
      .get(f.command.operationId)!.n,
  ).toBe(1);
});
it("generation switch after actual submit skips old settlement and preserves original IN_FLIGHT claim", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const submit = vi.mocked(a.transport.submit).getMockImplementation()!;
  vi.mocked(a.transport.submit).mockImplementation(async (ctx, command) => {
    const result = await submit(ctx, command);
    advanceAccountGeneration();
    return result;
  });
  expect((await a.run()).status).toBe("paused_auth");
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "PROCESSING", attempt_count: 1 });
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(f.command.operationId)!.state,
  ).toBe("IN_FLIGHT");
  const restored = { ...f, ctx: await f.repo.captureContext(trip) },
    b = adapter(restored);
  b.setRemote(a.getRemote());
  f.setClock("2026-10-12T00:06:00Z");
  await b.run();
  expect(b.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(f.command.operationId)!.status,
  ).toBe("COMPLETED");
});
it("status-only receipt and receipt error never become a null-success or a new submit", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const original = await executeCoreCommandV2(
    f.storage,
    account,
    trip,
    f.command,
    hash,
    f.now,
  );
  if (original.projection !== "FULL") throw Error("TEST_EXPECTED_FULL");
  a.setRemote(coreReceiptStatus(original.domainReceiptId, original.receipt));
  await expect(a.run()).rejects.toThrow("CORE_CURRENT_AUTHORIZATION_REQUIRED");
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(f.command.operationId)!.state,
  ).not.toBe("APPLIED");
  const read = vi.mocked(a.transport.receipt).getMockImplementation()!;
  vi.mocked(a.transport.receipt).mockRejectedValueOnce(new Error("TEST_RECEIPT_503"));
  await expect(a.run()).rejects.toThrow("TEST_RECEIPT_503");
  vi.mocked(a.transport.receipt).mockImplementation(read);
  a.setRemote(original);
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "COMPLETED", attempt_count: 0 });
});
it("Trip revoke between claim and consume prevents submit and cannot terminally settle", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const read = vi.mocked(a.transport.receipt).getMockImplementation()!;
  vi.mocked(a.transport.receipt).mockImplementation(async (ctx, id) => {
    const result = await read(ctx, id);
    if (
      f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(id)!.status ===
      "PROCESSING"
    )
      f.sql
        .prepare("UPDATE trip_core_scopes SET revoked=1 WHERE account_id=? AND trip_id=?")
        .run(account, trip);
    return result;
  });
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "PROCESSING", attempt_count: 0 });
});
it("a changed owner after consume cannot record or send an ordinary fallback POST", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const worker = createCoreV2SyncWorker(
    f.repo,
    a.transport,
    f.identity,
    hash,
    () => true,
    async (operation) => {
      f.sql
        .prepare("UPDATE sync_operations SET claim_owner='newer-claim' WHERE id=?")
        .run(operation.id);
      await a.lifecycle.noteSubmit(operation);
    },
  );
  await createCoreV2SyncCoordinator(
    a.lifecycle.queue,
    worker,
    f.repo,
    trip,
    f.command.operationId,
  ).run("AUTHENTICATED_ONLINE");
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT status,claim_owner,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "PROCESSING", claim_owner: "newer-claim", attempt_count: 0 });
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(f.command.operationId)!.state,
  ).toBe("IN_FLIGHT");
});
it("a receipt belonging to a different original operation cannot mark this claim Synced", async () => {
  const f = await queuedCorrectionFixture(),
    observed = await correctionObserved(f);
  const claimed = await f.repo.claimQueuedManualInstructionCorrection(f.ctx, observed);
  if (claimed.kind !== "CLAIMED") throw Error("TEST_EXPECTED_CLAIM");
  const old = f.sql
    .prepare(
      "SELECT body_json,receipt_sha256 FROM trip_core_trip_core_command_receipts WHERE operation_id=?",
    )
    .get(f.q.append.operationId)!;
  f.sql
    .prepare(
      `INSERT INTO trip_core_trip_core_command_receipts(account_id,trip_id,operation_id,intent_sha256,receipt_sha256,body_json,receipt_version) VALUES(?,?,?,?,?,?,2)`,
    )
    .run(
      account,
      trip,
      f.command.operationId,
      claimed.claim.intentSha256,
      old.receipt_sha256,
      old.body_json,
    );
  await expect(
    createCoreCorrectionQueueLifecycle(f.database, f.identity, hash, f.now).settle(
      f.ctx,
      observed,
      claimed.claim,
    ),
  ).rejects.toThrow("RECEIPT_BINDING");
  expect(
    f.sql
      .prepare("SELECT status,claim_owner FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "PROCESSING", claim_owner: claimed.claim.claimOwner });
});

it("closed new capability does not burn a fresh claim or prevent original receipt recovery", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const capability = vi.mocked(a.transport.capabilities).getMockImplementation()!;
  vi.mocked(a.transport.capabilities).mockResolvedValue(coreClosedCapabilities);
  await a.run();
  expect(
    f.sql
      .prepare(
        "SELECT status,attempt_count,last_attempt_at,claim_owner FROM sync_operations WHERE id=?",
      )
      .get(f.command.operationId),
  ).toEqual({
    status: "PENDING",
    attempt_count: 0,
    last_attempt_at: null,
    claim_owner: null,
  });
  expect(a.transport.submit).not.toHaveBeenCalled();
  vi.mocked(a.transport.capabilities).mockImplementation(capability);
  await a.run();
  expect(a.transport.submit).toHaveBeenCalledOnce();
});
it("a retained original FULL receipt survives missing current Item and closed new capabilities", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const original = await executeCoreCommandV2(
    f.storage,
    account,
    trip,
    f.command,
    hash,
    f.now,
  );
  a.setRemote(original);
  const accepted = (await f.repo.acceptedSnapshot(f.ctx))!;
  const removed = await buildCoreActorCollection(
    emptyCoreGraph(),
    actor,
    {
      epoch: accepted.certificate.epoch,
      revision: 4,
      accessRevision: 1,
      generatedAt: stamp,
    },
    [
      {
        person_id: person,
        account_id: account,
        active: true,
        participating: true,
        revision: 1,
      },
    ],
    hash,
  );
  await f.repo.install(
    await f.repo.beginRefresh(f.ctx, 1),
    removed.manifest,
    removed.pages,
  );
  vi.mocked(a.transport.capabilities).mockResolvedValue(coreClosedCapabilities);
  await a.run();
  expect(a.transport.capabilities).not.toHaveBeenCalled();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "COMPLETED", attempt_count: 0 });
});
it("valid original NO_CHANGE maps to APPLIED/completion only through durable validated receipt (mapping fixture)", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const { coreHashValue } = await import("../../domain/trip/tripCoreV2Read");
  const { coreReceiptSchema } = await import("../../domain/trip/tripCoreV2Receipt");
  const command = validateCoreCommand(f.command);
  const body = {
    receiptVersion: 2,
    commandVersion: 2,
    intentVersion: 2,
    actorAccountId: account,
    tripId: trip,
    operationId: command.operationId,
    command: command.command,
    intentSha256: await coreHashValue("otr-trip-core-intent-v2", command, hash),
    targetVector: command.baseVector.map((b) => ({
      kind: b.kind,
      id: b.id,
      baseRevision: b.revision,
      committedRevision: b.revision,
    })),
    outcome: "NO_CHANGE",
    result: {
      created: [],
      changed: [],
      retiredEdges: [],
      replacement: null,
      custodyGrantId: null,
    },
    errorCode: null,
    committedAt: stamp,
    audit: { before: [], after: [], evidenceRefs: [], authorizationRefs: [] },
  };
  const receipt = coreReceiptSchema.parse({
    ...body,
    receiptSha256: await coreHashValue("otr-trip-core-receipt-v2", body, hash),
  });
  a.setRemote({ projection: "FULL", domainReceiptId: randomUUID(), receipt });
  await a.run();
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(command.operationId)!.state,
  ).toBe("APPLIED");
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(command.operationId)!.status,
  ).toBe("COMPLETED");
});

it("lease expiry after consume is a negative POST fence, never permission for a new attempt", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const worker = createCoreV2SyncWorker(
    f.repo,
    a.transport,
    f.identity,
    hash,
    () => true,
    async (operation) => {
      f.setClock("2026-10-12T00:06:00Z");
      await a.lifecycle.noteSubmit(operation);
    },
  );
  await createCoreV2SyncCoordinator(
    a.lifecycle.queue,
    worker,
    f.repo,
    trip,
    f.command.operationId,
  ).run("AUTHENTICATED_ONLINE");
  expect(a.transport.submit).not.toHaveBeenCalled();
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(f.command.operationId)!.state,
  ).toBe("IN_FLIGHT");
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "DEPENDENCY_BLOCKED", attempt_count: 0 });
});

it("normal factory mounts the exact lifecycle on the same real Core instance and refreshes its accepted parent", async () => {
  const f = await queuedCorrectionFixture(),
    a = adapter(f);
  const initial = (await f.repo.acceptedSnapshot(f.ctx))!;
  native.database = f.database;
  native.accountId = account;
  native.tripId = trip;
  native.operationId = f.command.operationId;
  native.transport = {
    ...a.transport,
    collection: async () =>
      buildCoreActorCollection(
        f.serverGraph(),
        actor,
        {
          epoch: initial.certificate.epoch,
          revision: 4,
          accessRevision: 1,
          generatedAt: stamp,
        },
        [
          {
            person_id: person,
            account_id: account,
            active: true,
            participating: true,
            revision: 1,
          },
        ],
        hash,
      ),
  };
  const { createNativeNormalTripSyncRunner } = await import("./tripNormalCoordinator");
  await createNativeNormalTripSyncRunner(
    { accountId: account, newTripsFrom: "2026-10-11T00:00:00Z" },
    () => true,
    false,
    () => true,
  )("AUTHENTICATED_ONLINE");
  expect(a.transport.submit).toHaveBeenCalledOnce();
  expect(
    f.sql
      .prepare("SELECT status,attempt_count FROM sync_operations WHERE id=?")
      .get(f.command.operationId),
  ).toEqual({ status: "COMPLETED", attempt_count: 1 });
  expect(
    (await f.repo.acceptedSnapshot(f.ctx))!.graph.trip_instruction_entries.find(
      (r) => r.id === (f.command.payload as { newEntryId: string }).newEntryId,
    )!.body,
  ).toBe("Use side reception bell.");
});
