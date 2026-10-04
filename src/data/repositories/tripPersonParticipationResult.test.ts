import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import {
  participationCommandSchema,
  participationIntentBytes,
  participationResultBytes,
  participationOperationType,
  participationCommandsEnabled,
  type ParticipationResult,
} from "@/domain/trip/personParticipationCommand";
import {
  encodeSharedLedgerCursor,
  serializeParticipationVector,
} from "@/domain/trip/participationSnapshot";
import { ApiClientError } from "@/data/api/client";
import type { LedgerBootstrapResponse } from "@/data/api/ledgerReadContracts";
import {
  createLedgerReadRepository,
  type LedgerReadDatabase,
} from "./ledgerReadRepository";

import {
  reconcileTripPersonParticipationResult,
  revalidateJourneyLedger,
} from "@/data/sync/ledgerReportingCoordinator";

const state = vi.hoisted(() => ({
  active: "30000000-0000-4000-8000-000000000001",
  repository: null as ReturnType<typeof createLedgerReadRepository> | null,
}));
const transport = vi.hoisted(() => ({ bootstrap: vi.fn(), pull: vi.fn() }));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_: string, s: string) =>
    createHash("sha256").update(s).digest("hex"),
}));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => state.active,
}));
vi.mock("@/data/repositories/defaultLedgerReadRepository", () => ({
  getDefaultLedgerReadRepository: async () => state.repository,
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: () => {
    throw new Error("Unused native reporting entry");
  },
}));
vi.mock("@/data/sync/ledgerReadTransport", () => ({
  createLedgerReadTransport: () => transport,
}));
vi.mock("@/data/sync/ledgerPersonalPaymentCoordinator", () => ({
  refreshLedgerPersonalPayments: async () => false,
}));
vi.mock("@/data/sync/personalSettlementReviewCoordinator", () => ({
  refreshPersonalSettlementReview: async () => undefined,
}));

const trip = "10000000-0000-4000-8000-000000000001",
  person = "20000000-0000-4000-8000-000000000001",
  actor = "30000000-0000-4000-8000-000000000001",
  second = "30000000-0000-4000-8000-000000000002";
const op = "40000000-0000-4000-8000-000000000001",
  time = "2026-10-04T00:00:00.000000Z";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const getUser = async () => state.active;
const context = () => captureAccountRequestContext(trip, getUser);
const command = () => {
  const c = participationCommandSchema.parse({
    contractVersion: 1,
    command: "SET_PARTICIPATION",
    operationId: op,
    actorUserId: actor,
    actorMemberId: null,
    tripId: trip,
    personId: person,
    expectedParticipation: { isParticipating: true, revision: 0 },
    isParticipating: false,
    reason: null,
    intentDigest: "0".repeat(64),
  });
  c.intentDigest = hash(participationIntentBytes(c));
  return c;
};
function result(): ParticipationResult {
  const c = command();
  const r = {
    receiptVersion: 1 as const,
    receiptId: "50000000-0000-4000-8000-000000000001",
    contractVersion: 1 as const,
    command: c.command,
    operationId: op,
    actorUserId: actor,
    actorMemberId: person,
    tripId: trip,
    personId: person,
    intentDigest: c.intentDigest,
    expectedParticipation: c.expectedParticipation,
    desiredParticipation: false,
    outcome: "APPLIED" as const,
    priorParticipation: c.expectedParticipation,
    resultingParticipation: { isParticipating: false, revision: 1 },
    errorCode: null,
    observedAt: time,
  };
  return {
    receipt: r,
    resultDigest: hash(participationResultBytes(r)),
    idempotentReplay: false,
  };
}
function bootstrap(active = true, revision = 0): LedgerBootstrapResponse {
  const capabilities = {
    canRead: true,
    canCreateExpense: false,
    canEditOwnExpense: false,
    canCorrectAnyExpense: false,
    canSuggestCorrection: false,
    canResolveOwnExpenseConflict: false,
    canAddOwnPaymentEvidence: false,
    canManageExpenseValuation: false,
    canManageLedgerValuationPolicy: false,
    canPrepareSettlement: false,
    canFinalizeSettlement: false,
  };
  const members = [
    {
      id: person,
      displayName: "Person",
      role: "owner",
      status: "linked",
      updatedAt: time,
      capabilities,
      isParticipating: active,
      participationRevision: revision,
    },
  ];
  const fingerprint = hash(serializeParticipationVector(members));
  return {
    journey: {
      id: trip,
      title: "Trip",
      startDate: null,
      endDate: null,
      settlementCurrency: "NZD",
      settlementScale: 2,
      valuationPolicy: "REFERENCE_RATE",
      updatedAt: time,
    },
    members,
    households: [],
    expenses: [],
    corrections: [],
    rateQuotes: [],
    actor: { userId: actor, memberId: person, role: "owner", capabilities },
    serverTime: time,
    cursor: encodeSharedLedgerCursor(7, trip, actor, fingerprint),
    participationSnapshot: {
      contractVersion: 1,
      complete: true,
      personCount: 1,
      fingerprintVersion: 1,
      fingerprint,
      observedAt: time,
    },
  };
}
let sqlite: DatabaseSync,
  db: LedgerReadDatabase,
  failSql: string | null,
  beforeCommit: (() => Promise<void>) | null;
const repo = () => state.repository!;
function rows() {
  return [
    "ledger_members",
    "ledger_sync_cursors",
    "ledger_actor_context",
    "sync_operations",
    "trip_person_participation_results",
  ].map((t) => sqlite.prepare(`SELECT * FROM ${t}`).all());
}
beforeEach(async () => {
  vi.clearAllMocks();
  transport.bootstrap.mockReset();
  transport.pull.mockReset();
  state.active = actor;
  failSql = null;
  beforeCommit = null;
  sqlite = new DatabaseSync(":memory:");
  for (const m of migrations) sqlite.exec(m.sql);
  db = {
    async withTransactionAsync(task) {
      sqlite.exec("BEGIN");
      try {
        await task();
        await beforeCommit?.();
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    async runAsync(sql, ...args) {
      if (failSql && sql.includes(failSql)) throw new Error("TEST_SQL_FAILURE");
      return sqlite.prepare(sql).run(...(args as unknown as never[])) as never;
    },
    async getFirstAsync(sql, ...args) {
      return (sqlite.prepare(sql).get(...(args as unknown as never[])) ?? null) as never;
    },
    async getAllAsync(sql, ...args) {
      return sqlite.prepare(sql).all(...(args as unknown as never[])) as never;
    },
  };
  state.repository = createLedgerReadRepository(db, getUser);
  await repo().applyBootstrap(bootstrap(), await context());
  sqlite
    .prepare(
      "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,owner_user_id,status,attempt_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'PROCESSING',1,?,?)",
    )
    .run(
      op,
      trip,
      "TRIP_PERSON",
      person,
      participationOperationType,
      op,
      0,
      JSON.stringify(command()),
      actor,
      time,
      time,
    );
});
afterEach(() => {
  sqlite.close();
  state.repository = null;
});
it("atomic receipt/pair/queue/certificate apply preserves financial and private cursors and all Account contexts", async () => {
  const old = sqlite.prepare("SELECT cursor,server_time FROM ledger_sync_cursors").get();
  const actorRows = sqlite.prepare("SELECT * FROM ledger_actor_context").all();
  sqlite
    .prepare(
      "INSERT INTO ledger_sync_cursors(user_id,journey_id,cursor,server_time,updated_at) VALUES(?,?,?,?,?)",
    )
    .run(second, trip, "second-financial-cursor", time, time);
  sqlite
    .prepare(
      "INSERT INTO ledger_personal_payment_sync_cursors(user_id,journey_id,cursor,server_time,updated_at) VALUES(?,?,?,?,?)",
    )
    .run(actor, trip, "private-v1", time, time);
  expect(
    await repo().applyParticipationResult(command(), result(), await context()),
  ).toBe(true);
  expect(
    sqlite
      .prepare("SELECT participation_active,participation_revision FROM ledger_members")
      .get(),
  ).toEqual({ participation_active: 0, participation_revision: 1 });
  expect(
    sqlite
      .prepare("SELECT cursor,server_time FROM ledger_sync_cursors WHERE user_id=?")
      .get(actor),
  ).toEqual(old);
  expect(
    sqlite.prepare("SELECT cursor FROM ledger_sync_cursors WHERE user_id=?").get(second),
  ).toEqual({ cursor: "second-financial-cursor" });
  expect(
    sqlite.prepare("SELECT cursor FROM ledger_personal_payment_sync_cursors").get(),
  ).toEqual({
    cursor: "private-v1",
  });
  expect(sqlite.prepare("SELECT * FROM ledger_actor_context").all()).toEqual(actorRows);
  expect(sqlite.prepare("SELECT status FROM sync_operations").get()).toEqual({
    status: "COMPLETED",
  });
  expect(await repo().getParticipationCertificate(trip)).toBeNull();
  const cert = sqlite
    .prepare("SELECT * FROM ledger_sync_cursors WHERE user_id=?")
    .get(actor)!;
  expect(
    Object.entries(cert)
      .filter(([key]) => key.startsWith("participation_"))
      .every(([, v]) => v === null),
  ).toBe(true);
  expect(participationCommandsEnabled).toBe(false);
});
it("a stale conflict retains authoritative observation and marks the operation CONFLICT", async () => {
  const received = result();
  received.receipt.outcome = "REVISION_CONFLICT";
  received.receipt.priorParticipation = { isParticipating: false, revision: 2 };
  received.receipt.resultingParticipation = { isParticipating: false, revision: 2 };
  received.receipt.errorCode = "PARTICIPATION_REVISION_CONFLICT";
  received.resultDigest = hash(participationResultBytes(received.receipt));
  await repo().applyParticipationResult(command(), received, await context());
  expect(sqlite.prepare("SELECT status FROM sync_operations WHERE id=?").get(op)).toEqual(
    { status: "CONFLICT" },
  );
  expect(await repo().getParticipationCertificate(trip)).toBeNull();
  expect(
    sqlite
      .prepare("SELECT participation_revision AS revision FROM ledger_members WHERE id=?")
      .get(person),
  ).toEqual({ revision: 2 });
});

it("duplicate historic replay is neutral after a newer certified bootstrap", async () => {
  await repo().applyParticipationResult(command(), result(), await context());
  await repo().applyBootstrap(bootstrap(true, 2), await context());
  const before = rows();
  expect(
    await repo().applyParticipationResult(
      command(),
      { ...result(), idempotentReplay: true },
      await context(),
    ),
  ).toBe(false);
  expect(rows()).toEqual(before);
});
it("a newer cached row survives first consumption of an older success", async () => {
  await repo().applyBootstrap(bootstrap(true, 2), await context());
  await repo().applyParticipationResult(command(), result(), await context());
  expect(
    sqlite
      .prepare("SELECT participation_active,participation_revision FROM ledger_members")
      .get(),
  ).toEqual({ participation_active: 1, participation_revision: 2 });
});
it("equal revision/opposite pair rejects atomically", async () => {
  await repo().applyBootstrap(bootstrap(true, 1), await context());
  const before = rows();
  await expect(
    repo().applyParticipationResult(command(), result(), await context()),
  ).rejects.toThrow("Inconsistent");
  expect(rows()).toEqual(before);
});
it("receipt and row roll back if certificate invalidation fails", async () => {
  const before = rows();
  failSql = "participation_snapshot_contract_version=NULL";
  await expect(
    repo().applyParticipationResult(command(), result(), await context()),
  ).rejects.toThrow("TEST_SQL_FAILURE");
  expect(rows()).toEqual(before);
});
it("changed result digest or queue ownership never applies", async () => {
  const before = rows();
  await expect(
    repo().applyParticipationResult(
      command(),
      { ...result(), resultDigest: "0".repeat(64) },
      await context(),
    ),
  ).rejects.toThrow("binding");
  expect(rows()).toEqual(before);
  sqlite.prepare("UPDATE sync_operations SET owner_user_id=?").run(second);
  const other = rows();
  await expect(
    repo().applyParticipationResult(command(), result(), await context()),
  ).rejects.toThrow("operation binding");
  expect(rows()).toEqual(other);
});
it("A to B to A rejects the old generation without queue completion", async () => {
  const old = await context();
  state.active = second;
  advanceAccountGeneration();
  state.active = actor;
  advanceAccountGeneration();
  const before = rows();
  await expect(repo().applyParticipationResult(command(), result(), old)).rejects.toThrow(
    "Account changed",
  );
  expect(rows()).toEqual(before);
});
it("Account transition waits behind the result COMMIT fence", async () => {
  let arrived!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (arrived = r)),
    wait = new Promise<void>((r) => (release = r));
  beforeCommit = async () => {
    arrived();
    await wait;
  };
  const apply = repo().applyParticipationResult(command(), result(), await context());
  await entered;
  let switched = false;
  const switchPending = beginAccountTransition().then((lease) => {
    switched = true;
    return lease;
  });
  await Promise.resolve();
  expect(switched).toBe(false);
  release();
  await apply;
  const lease = await switchPending;
  endAccountTransition(lease);
  expect(switched).toBe(true);
});
it("pre-command in-flight snapshot drains before result and a fresh bounded recovery certifies the new row", async () => {
  let arrived!: () => void, release!: (r: LedgerBootstrapResponse) => void;
  const entered = new Promise<void>((r) => (arrived = r));
  transport.bootstrap
    .mockImplementationOnce(() => {
      arrived();
      return new Promise((r) => (release = r));
    })
    .mockResolvedValueOnce(bootstrap(false, 1));
  transport.pull.mockRejectedValueOnce(
    new ApiClientError("refresh", "validation", 400, "INVALID_CURSOR"),
  );
  const earlier = revalidateJourneyLedger(trip);
  await entered;
  const reconciled = reconcileTripPersonParticipationResult(
    command(),
    result(),
    await context(),
  );
  await Promise.resolve();
  expect(
    sqlite.prepare("SELECT count(*) AS n FROM trip_person_participation_results").get(),
  ).toEqual({ n: 0 });
  release(bootstrap());
  await earlier;
  expect(await reconciled).toEqual({ applied: true, refresh: "COMPLETE" });
  expect(transport.bootstrap).toHaveBeenCalledTimes(2);
  expect(transport.pull).toHaveBeenCalledTimes(1);
  expect(await repo().getParticipationCertificate(trip)).not.toBeNull();
  expect(
    sqlite
      .prepare("SELECT participation_active,participation_revision FROM ledger_members")
      .get(),
  ).toEqual({ participation_active: 0, participation_revision: 1 });
});
it("post-command offline failure leaves accepted receipt/cached access and invalid certificate", async () => {
  transport.pull.mockRejectedValueOnce(new Error("offline"));
  expect(
    await reconcileTripPersonParticipationResult(command(), result(), await context()),
  ).toEqual({ applied: true, refresh: "PENDING" });
  expect(sqlite.prepare("SELECT status FROM sync_operations").get()).toEqual({
    status: "COMPLETED",
  });
  expect(await repo().getParticipationCertificate(trip)).toBeNull();
  expect(sqlite.prepare("SELECT count(*) AS n FROM ledger_actor_context").get()).toEqual({
    n: 1,
  });
});
