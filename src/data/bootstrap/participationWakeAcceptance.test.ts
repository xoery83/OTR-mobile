import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import {
  createLedgerReadRepository,
  type LedgerReadDatabase,
} from "@/data/repositories/ledgerReadRepository";
import { createLedgerReportingRepository } from "@/data/repositories/ledgerReportingRepository";
import {
  ledgerBootstrapResponseSchema,
  ledgerChangesResponseSchema,
} from "@/data/api/ledgerReadContracts";
import { ApiClientError } from "@/data/api/client";
import {
  decodeSharedLedgerCursor,
  encodeSharedLedgerCursor,
  serializeParticipationVector,
} from "@/domain/trip/participationSnapshot";
import {
  resumeOperationalSync,
  pauseOperationalSync,
  restartOperationalSync,
  subscribeOperationalSyncLifecycle,
} from "./defaultBootstrapDependencies";
import { bootstrapApplication } from "./bootstrapApplication";
import { createAccountSwitchCoordinator } from "@/data/auth/accountSwitchCoordinator";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { LocalSession } from "@/domain/auth/localSession";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";

const fixture = vi.hoisted(() => ({
  client: null as unknown,
  online: true,
  accountId: "",
  runSync: vi.fn(),
  appListener: null as null | ((state: string) => void),
  networkListener: null as null | ((state: { isConnected: boolean }) => void),
  bootstrap: vi.fn(),
  pull: vi.fn(),
}));
vi.mock("@/data/auth/authRepository", () => ({
  readLocalSession: async () => ({
    accessToken: "cached",
    refreshToken: "cached",
    expiresAt: "2000-01-01T00:00:00Z",
    identity: { userId: fixture.accountId, displayName: "Local", email: null },
  }),
  requireActiveUserId: async () => fixture.accountId,
}));
vi.mock("@/data/auth/sessionAccessToken", () => ({
  sessionAccessToken: async () => ({ userId: account, token: "cached" }),
}));
vi.mock("@/data/db/database", () => ({ openDatabase: async () => current().db }));
vi.mock("@/data/repositories/defaultLedgerReadRepository", () => ({
  getDefaultLedgerReadRepository: async () => current().reads,
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => current().reporting,
}));
vi.mock("@/data/sync/ledgerReadTransport", () => ({
  createLedgerReadTransport: () => ({ bootstrap: fixture.bootstrap, pull: fixture.pull }),
}));
vi.mock("@/data/sync/ledgerPersonalPaymentCoordinator", () => ({
  refreshLedgerPersonalPayments: async () => false,
}));
vi.mock("@/data/sync/personalSettlementReviewCoordinator", () => ({
  refreshPersonalSettlementReview: async () => false,
}));
vi.mock("@/data/sync/transportSelection", () => ({ getSyncTransportMode: () => "dev" }));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  runLedgerOperationalSync: fixture.runSync,
  pauseLedgerOperationalSync: async () => {},
  allowLedgerOperationalSync: () => {},
  reactivateLongLivedLedgerFailures: async () => {},
  subscribeLedgerOperationalSyncCompletion: () => () => {},
}));
vi.mock("@/data/health/defaultDataHealthScheduler", () => ({
  getDefaultDataHealthScheduler: () => ({ schedule: async () => null }),
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
}));
vi.mock("expo-network", () => ({
  getNetworkStateAsync: async () => ({ isConnected: fixture.online }),
  addNetworkStateListener: (listener: typeof fixture.networkListener) => {
    fixture.networkListener = listener;
    return {
      remove() {
        fixture.networkListener = null;
      },
    };
  },
}));
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: (_event: string, listener: typeof fixture.appListener) => {
      fixture.appListener = listener;
      return {
        remove() {
          fixture.appListener = null;
        },
      };
    },
  },
}));
const account = "30000000-0000-4000-8000-000000000001",
  trip = "10000000-0000-4000-8000-000000000001",
  tripB = "10000000-0000-4000-8000-000000000002",
  person = "20000000-0000-4000-8000-000000000001";
const time = "2026-10-04T00:00:00.000000Z";
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
const member = (isParticipating = true, participationRevision = 0) => ({
  id: person,
  displayName: "Local Person",
  role: "guest",
  status: "unlinked",
  updatedAt: time,
  capabilities,
  isParticipating,
  participationRevision,
});
let rosters: Map<string, ReturnType<typeof member>[]>;
const fingerprint = (id: string) =>
  createHash("sha256")
    .update(serializeParticipationVector(rosters.get(id)!))
    .digest("hex");
function serverBootstrap(id: string) {
  const hash = fingerprint(id);
  return ledgerBootstrapResponseSchema.parse({
    journey: {
      id,
      title: "Local Trip",
      startDate: null,
      endDate: null,
      settlementCurrency: "NZD",
      settlementScale: 2,
      valuationPolicy: "REFERENCE_RATE",
      updatedAt: time,
    },
    members: rosters.get(id),
    households: [],
    expenses: [],
    corrections: [],
    rateQuotes: [],
    actor: { userId: fixture.accountId, memberId: null, role: null, capabilities },
    cursor: encodeSharedLedgerCursor(0, id, fixture.accountId, hash),
    serverTime: time,
    reviewProtocol: 2,
    reviewFindings: [],
    reviewActions: [],
    participationSnapshot: {
      contractVersion: 1,
      complete: true,
      personCount: rosters.get(id)!.length,
      fingerprintVersion: 1,
      fingerprint: hash,
      observedAt: time,
    },
  });
}
function serverPull(id: string, token: string) {
  if (!fixture.online) throw new ApiClientError("Local network unavailable", "network");
  const binding = decodeSharedLedgerCursor(token, id, fixture.accountId);
  if (binding.participationFingerprint !== fingerprint(id))
    throw new ApiClientError("Drift", "http", 400, "INVALID_CURSOR");
  return ledgerChangesResponseSchema.parse({
    changes: [],
    cursor: token,
    hasMore: false,
    serverTime: time,
    reviewProtocol: 2,
    reviewFindings: [],
    reviewActions: [],
    participationVerification: {
      contractVersion: 1,
      fingerprintVersion: 1,
      fingerprint: binding.participationFingerprint,
      observedAt: "2026-10-04T00:00:01.000000Z",
    },
  });
}
function client(path = ":memory:") {
  const sqlite = new DatabaseSync(path);
  if (
    path === ":memory:" ||
    !sqlite.prepare("SELECT name FROM sqlite_master WHERE name='ledger_members'").get()
  )
    for (const migration of migrations) sqlite.exec(migration.sql);
  const db: LedgerReadDatabase = {
    async withTransactionAsync(task) {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async runAsync(sql, ...params) {
      return sqlite.prepare(sql).run(...(params as unknown as never[])) as never;
    },
    async getFirstAsync(sql, ...params) {
      return (sqlite.prepare(sql).get(...(params as unknown as never[])) ??
        null) as never;
    },
    async getAllAsync(sql, ...params) {
      return sqlite.prepare(sql).all(...(params as unknown as never[])) as never;
    },
  };
  return {
    sqlite,
    db,
    reads: createLedgerReadRepository(db, async () => fixture.accountId),
    reporting: createLedgerReportingRepository(db, async () => fixture.accountId),
  };
}
const current = () => fixture.client as ReturnType<typeof client>;
let clients: ReturnType<typeof client>[] = [];
let subscription: ReturnType<typeof subscribeOperationalSyncLifecycle> | null = null;
async function seed(c: ReturnType<typeof client>, id = trip) {
  fixture.client = c;
  await refreshJourneyLedger(id);
  c.sqlite
    .prepare(
      "INSERT INTO account_local_state(user_id,selected_journey_id,default_currency,updated_at) VALUES (?,?,'NZD',?) ON CONFLICT(user_id) DO UPDATE SET selected_journey_id=excluded.selected_journey_id",
    )
    .run(fixture.accountId, id, time);
  fixture.bootstrap.mockClear();
  fixture.pull.mockClear();
}
async function wake(kind: "foreground" | "reconnect" | "cold start") {
  if (kind === "foreground") fixture.appListener?.("active");
  if (kind === "reconnect") {
    fixture.networkListener?.({ isConnected: false });
    fixture.online = true;
    fixture.networkListener?.({ isConnected: true });
  }
  await resumeOperationalSync();
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.online = true;
  fixture.accountId = account;
  fixture.runSync.mockImplementation(async () => {});
  rosters = new Map([
    [trip, [member()]],
    [tripB, []],
  ]);
  fixture.bootstrap.mockImplementation(async (id: string) => {
    if (!fixture.online) throw new ApiClientError("Local network unavailable", "network");
    return serverBootstrap(id);
  });
  fixture.pull.mockImplementation(async (id: string, token: string) =>
    serverPull(id, token),
  );
});
afterEach(() => {
  subscription?.remove();
  subscription = null;
  for (const c of clients) c.sqlite.close();
  clients = [];
});
describe("real central-owner lifecycle convergence with local clients", () => {
  it.each(["foreground", "reconnect", "cold start"] as const)(
    "%s discovers stale participation without a queue or financial change",
    async (kind) => {
      const c = client();
      clients.push(c);
      await seed(c);
      subscription = subscribeOperationalSyncLifecycle();
      await Promise.resolve();
      rosters.set(trip, [member(false, 1)]);
      const old = (await c.reads.getParticipationCertificate(trip))!.cursor;
      expect(c.sqlite.prepare("SELECT count(*) AS n FROM sync_operations").get()?.n).toBe(
        0,
      );
      await wake(kind);
      expect(fixture.pull).toHaveBeenCalledOnce();
      expect(fixture.bootstrap).toHaveBeenCalledOnce();
      expect((await c.reads.getParticipationCertificate(trip))?.cursor).not.toBe(old);
      expect(
        c.sqlite
          .prepare(
            "SELECT participation_active,participation_revision FROM ledger_members",
          )
          .get(),
      ).toEqual({ participation_active: 0, participation_revision: 1 });
      expect(c.sqlite.prepare("SELECT count(*) AS n FROM ledger_expenses").get()?.n).toBe(
        0,
      );
    },
  );
  it("valid zero-change cold wake verifies without bootstrap", async () => {
    const c = client();
    clients.push(c);
    await seed(c);
    await wake("cold start");
    expect(fixture.pull).toHaveBeenCalledOnce();
    expect(fixture.bootstrap).not.toHaveBeenCalled();
    expect((await c.reads.getParticipationCertificate(trip))?.verifiedAt).toBe(
      "2026-10-04T00:00:01.000000Z",
    );
  });
  it("two isolated clients converge only on their own wake across inactive/reactive ABA", async () => {
    const one = client(),
      two = client();
    clients.push(one, two);
    await seed(one);
    await seed(two);
    const original = (await two.reads.getParticipationCertificate(trip))!.cursor;
    rosters.set(trip, [member(false, 1)]);
    fixture.client = two;
    await wake("cold start");
    expect(
      one.sqlite.prepare("SELECT participation_revision AS r FROM ledger_members").get()
        ?.r,
    ).toBe(0);
    rosters.set(trip, [member(true, 2)]);
    fixture.client = one;
    await wake("cold start");
    expect(
      one.sqlite.prepare("SELECT participation_revision AS r FROM ledger_members").get()
        ?.r,
    ).toBe(2);
    expect(
      two.sqlite.prepare("SELECT participation_revision AS r FROM ledger_members").get()
        ?.r,
    ).toBe(1);
    expect((await one.reads.getParticipationCertificate(trip))!.cursor).not.toBe(
      original,
    );
    fixture.client = two;
    await wake("cold start");
    expect((await two.reads.getParticipationCertificate(trip))!.cursor).toBe(
      (await one.reads.getParticipationCertificate(trip))!.cursor,
    );
  });
  it("offline cached launch and network loss retain certificate, reconnect then converges", async () => {
    const c = client();
    clients.push(c);
    await seed(c);
    subscription = subscribeOperationalSyncLifecycle();
    await Promise.resolve();
    const before = (await c.reads.getParticipationCertificate(trip))!.cursor;
    fixture.online = false;
    await expect(
      bootstrapApplication({
        openDatabase: async () => c.db,
        readLocalSession: async () => ({
          accessToken: "expired",
          refreshToken: "cached",
          expiresAt: "2000-01-01T00:00:00Z",
          identity: { userId: account, displayName: "Local", email: null },
        }),
        resumeSync: resumeOperationalSync,
      }),
    ).resolves.toMatchObject({ authState: "AUTHENTICATED_OFFLINE" });
    await expect(resumeOperationalSync()).resolves.toBeUndefined();
    expect((await c.reads.getParticipationCertificate(trip))!.cursor).toBe(before);
    rosters.set(trip, [member(false, 1)]);
    await wake("reconnect");
    expect((await c.reads.getParticipationCertificate(trip))!.cursor).not.toBe(before);
  });
  it("file-backed restart retains v2 certificate and discovers drift on wake", async () => {
    const dir = mkdtempSync(join(tmpdir(), "otr-i2b3-")),
      path = join(dir, "client.db");
    let c = client(path);
    await seed(c);
    const before = (await c.reads.getParticipationCertificate(trip))!.cursor;
    c.sqlite.close();
    c = client(path);
    clients.push(c);
    fixture.client = c;
    expect((await c.reads.getParticipationCertificate(trip))!.cursor).toBe(before);
    rosters.set(trip, [member(false, 1)]);
    await wake("cold start");
    expect((await c.reads.getParticipationCertificate(trip))!.cursor).not.toBe(before);
    rmSync(dir, { recursive: true, force: true });
  });
  it("Trip A→B→A uses each scoped cursor and catches A drift on re-entry", async () => {
    const c = client();
    clients.push(c);
    await seed(c);
    await seed(c, tripB);
    rosters.set(trip, [member(false, 1)]);
    await wake("cold start");
    expect(fixture.pull.mock.calls[0][0]).toBe(tripB);
    expect(fixture.bootstrap).not.toHaveBeenCalled();
    c.sqlite.prepare("UPDATE account_local_state SET selected_journey_id=?").run(trip);
    fixture.pull.mockClear();
    await wake("cold start");
    expect(fixture.pull.mock.calls[0][0]).toBe(trip);
    expect(fixture.bootstrap).toHaveBeenCalledOnce();
    expect(
      c.sqlite.prepare("SELECT count(*) AS n FROM ledger_sync_cursors").get()?.n,
    ).toBe(2);
  });
  it("coalesces simultaneous wakes through the existing global and shared owner", async () => {
    const c = client();
    clients.push(c);
    await seed(c);
    await Promise.all([
      resumeOperationalSync(),
      resumeOperationalSync(),
      resumeOperationalSync(),
    ]);
    expect(fixture.pull).toHaveBeenCalledOnce();
    expect(fixture.bootstrap).not.toHaveBeenCalled();
  });
  it("one recovery exits even if participation changes again immediately after its snapshot", async () => {
    const c = client();
    clients.push(c);
    await seed(c);
    rosters.set(trip, [member(false, 1)]);
    fixture.bootstrap.mockImplementationOnce(async (id: string) => {
      const result = serverBootstrap(id);
      rosters.set(id, [member(true, 2)]);
      return result;
    });
    await wake("cold start");
    expect(fixture.pull).toHaveBeenCalledOnce();
    expect(fixture.bootstrap).toHaveBeenCalledOnce();
    expect(
      c.sqlite.prepare("SELECT participation_revision AS r FROM ledger_members").get()?.r,
    ).toBe(1);
    await wake("cold start");
    expect(
      c.sqlite.prepare("SELECT participation_revision AS r FROM ledger_members").get()?.r,
    ).toBe(2);
  });
  it.each(["switchAccount", "activateSession"] as const)(
    "%s keeps installed B and its generation when real shared pull is unavailable",
    async (method) => {
      const c = client();
      clients.push(c);
      await seed(c);
      const b = "30000000-0000-4000-8000-000000000002";
      fixture.accountId = b;
      await seed(c);
      const certificate = await c.reads.getParticipationCertificate(trip);
      fixture.accountId = account;
      const selected: string[] = [];
      let installedGeneration = -1;
      const session = (id: string): LocalSession => ({
        accessToken: "cached",
        refreshToken: "cached",
        expiresAt: "2099-01-01T00:00:00Z",
        identity: { userId: id, displayName: "Local", email: null },
      });
      const coordinator = createAccountSwitchCoordinator({
        pauseSync: pauseOperationalSync,
        restartSync: restartOperationalSync,
        readSession: async () => session(fixture.accountId),
        writeSession: async (next) => {
          fixture.accountId = next.identity!.userId;
        },
        clearSession: async () => {
          fixture.accountId = "";
        },
        selectAccount: async (id) => {
          selected.push(id);
          fixture.accountId = id;
          return true;
        },
        adoptLocalState: async () => {
          installedGeneration = getAccountGeneration();
        },
        clearInMemoryState: () => {},
        bootstrapAccount: async () => {},
      });
      fixture.online = false;
      const transition =
        method === "switchAccount"
          ? coordinator.switchAccount(b)
          : coordinator.activateSession(session(b));
      await expect(transition).resolves.toMatchObject({ identity: { userId: b } });
      expect(fixture.accountId).toBe(b);
      expect(getAccountGeneration()).toBe(installedGeneration);
      expect(selected).not.toContain(account);
      expect(fixture.pull).toHaveBeenCalledOnce();
      expect(await c.reads.getParticipationCertificate(trip)).toEqual(certificate);
      expect(c.sqlite.prepare("SELECT count(*) AS n FROM sync_operations").get()?.n).toBe(
        0,
      );
      expect(c.sqlite.prepare("SELECT count(*) AS n FROM ledger_journeys").get()?.n).toBe(
        1,
      );
      rosters.set(trip, [member(false, 1)]);
      fixture.online = true;
      await resumeOperationalSync();
      expect(
        decodeSharedLedgerCursor(
          (await c.reads.getParticipationCertificate(trip))!.cursor,
          trip,
          fixture.accountId,
        ).participationFingerprint,
      ).toBe(fingerprint(trip));
      expect(fixture.accountId).toBe(b);
      expect(getAccountGeneration()).toBe(installedGeneration);
    },
  );
  it.each(["cold start", "foreground", "reconnect"] as const)(
    "%s shared failure is nonfatal and a later wake converges",
    async (kind) => {
      const c = client();
      clients.push(c);
      await seed(c);
      subscription = subscribeOperationalSyncLifecycle();
      await Promise.resolve();
      const certificate = await c.reads.getParticipationCertificate(trip);
      const generation = getAccountGeneration();
      fixture.pull.mockRejectedValueOnce(new ApiClientError("Unavailable", "network"));
      if (kind === "cold start") {
        await expect(
          bootstrapApplication({
            openDatabase: async () => c.db,
            readLocalSession: async () => ({
              accessToken: "cached",
              refreshToken: "cached",
              expiresAt: "2099-01-01T00:00:00Z",
              identity: { userId: account, displayName: "Local", email: null },
            }),
            resumeSync: resumeOperationalSync,
          }),
        ).resolves.toMatchObject({ authState: "AUTHENTICATED_OFFLINE" });
      }
      await expect(wake(kind)).resolves.toBeUndefined();
      expect(fixture.pull).toHaveBeenCalledOnce();
      expect(fixture.accountId).toBe(account);
      expect(getAccountGeneration()).toBe(generation);
      expect(await c.reads.getParticipationCertificate(trip)).toEqual(certificate);
      rosters.set(trip, [member(false, 1)]);
      await wake(kind);
      expect(
        decodeSharedLedgerCursor(
          (await c.reads.getParticipationCertificate(trip))!.cursor,
          trip,
          fixture.accountId,
        ).participationFingerprint,
      ).toBe(fingerprint(trip));
    },
  );
  it("skips selected Trip refresh if generation changes during operational sync", async () => {
    const c = client();
    clients.push(c);
    await seed(c);
    fixture.runSync.mockImplementationOnce(async () => {
      advanceAccountGeneration();
    });
    await resumeOperationalSync();
    expect(fixture.pull).not.toHaveBeenCalled();
    expect(fixture.bootstrap).not.toHaveBeenCalled();
  });
  it("coalesces a mounted-owner pull with global resume", async () => {
    const c = client();
    clients.push(c);
    await seed(c);
    let release!: () => void;
    fixture.pull.mockImplementationOnce(async (id: string, token: string) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return serverPull(id, token);
    });
    const mounted = refreshJourneyLedger(trip);
    await vi.waitFor(() => expect(fixture.pull).toHaveBeenCalledOnce());
    const global = resumeOperationalSync();
    await vi.waitFor(() => expect(fixture.runSync).toHaveBeenCalledOnce());
    // Drain the global owner's awaited repository selection before releasing pull.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    release();
    await Promise.all([mounted, global]);
    expect(fixture.pull).toHaveBeenCalledOnce();
  });
  it.each(["switchAccount", "activateSession"] as const)(
    "%s still restores A after actual Account bootstrap failure",
    async (method) => {
      const c = client();
      clients.push(c);
      await seed(c);
      const b = "30000000-0000-4000-8000-000000000002";
      const session = (id: string): LocalSession => ({
        accessToken: "cached",
        refreshToken: "cached",
        expiresAt: "2099-01-01T00:00:00Z",
        identity: { userId: id, displayName: "Local", email: null },
      });
      const selected: string[] = [];
      let bGeneration = -1;
      const coordinator = createAccountSwitchCoordinator({
        pauseSync: pauseOperationalSync,
        restartSync: restartOperationalSync,
        readSession: async () => session(fixture.accountId),
        writeSession: async (next) => {
          fixture.accountId = next.identity!.userId;
        },
        clearSession: async () => {
          fixture.accountId = "";
        },
        selectAccount: async (id) => {
          selected.push(id);
          fixture.accountId = id;
          return true;
        },
        adoptLocalState: async () => {
          bGeneration = getAccountGeneration();
        },
        clearInMemoryState: () => {},
        bootstrapAccount: async (next) => {
          if (next?.identity?.userId === b) throw new Error("Account bootstrap failed");
        },
      });
      fixture.online = false;
      await expect(
        method === "switchAccount"
          ? coordinator.switchAccount(b)
          : coordinator.activateSession(session(b)),
      ).rejects.toThrow("Account bootstrap failed");
      expect(fixture.accountId).toBe(account);
      expect(selected).toContain(account);
      expect(getAccountGeneration()).toBeGreaterThan(bGeneration);
    },
  );
});
