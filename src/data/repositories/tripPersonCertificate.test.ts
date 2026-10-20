import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
  assertAccountRequestGeneration,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { createAccountSwitchCoordinator } from "@/data/auth/accountSwitchCoordinator";
import type { LocalSession } from "@/domain/auth/localSession";
import {
  getAccountGeneration,
  advanceAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  serializeParticipationVector,
  encodeSharedLedgerCursor,
} from "@/domain/trip/participationSnapshot";
import type {
  LedgerBootstrapResponse,
  LedgerChangesResponse,
} from "@/data/api/ledgerReadContracts";
import {
  createLedgerReadRepository,
  type LedgerReadDatabase,
} from "./ledgerReadRepository";

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
}));
const trip = "10000000-0000-4000-8000-000000000001",
  user = "30000000-0000-4000-8000-000000000001";
const p1 = "20000000-0000-4000-8000-000000000001",
  p2 = "20000000-0000-4000-8000-000000000002";
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
const person = (id = p1, active = false, revision = 7) => ({
  id,
  displayName: id,
  role: "guest",
  status: "unlinked",
  updatedAt: time,
  capabilities,
  isParticipating: active,
  participationRevision: revision,
});
function bootstrap(members = [person()], sequence = 0): LedgerBootstrapResponse {
  const fingerprint = createHash("sha256")
    .update(serializeParticipationVector(members))
    .digest("hex");
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
    actor: { userId: user, memberId: null, role: null, capabilities },
    serverTime: time,
    participationSnapshot: {
      contractVersion: 1,
      complete: true,
      personCount: members.length,
      fingerprintVersion: 1,
      fingerprint,
      observedAt: time,
    },
    cursor: encodeSharedLedgerCursor(sequence, trip, user, fingerprint),
  };
}
function page(response: LedgerBootstrapResponse, sequence = 1): LedgerChangesResponse {
  return {
    changes: [],
    cursor: encodeSharedLedgerCursor(
      sequence,
      trip,
      user,
      response.participationSnapshot!.fingerprint,
    ),
    hasMore: false,
    serverTime: time,
    participationVerification: {
      contractVersion: 1,
      fingerprintVersion: 1,
      fingerprint: response.participationSnapshot!.fingerprint,
      observedAt: "2026-10-04T00:00:01.000000Z",
    },
  };
}
describe("atomic participation certificate projection", () => {
  let sqlite: DatabaseSync;
  let db: LedgerReadDatabase;
  let active: string;
  let failSave: boolean;
  let failCommit: boolean;
  const getUser = async () => active;
  const context = () => captureAccountRequestContext(trip, getUser);
  const snapshot = () =>
    [
      "ledger_journeys",
      "ledger_members",
      "ledger_actor_context",
      "ledger_sync_cursors",
    ].map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all());
  beforeEach(() => {
    active = user;
    failSave = false;
    failCommit = false;
    sqlite = new DatabaseSync(":memory:");
    for (const migration of migrations) sqlite.exec(migration.sql);
    db = {
      async withTransactionAsync(task) {
        sqlite.exec("BEGIN");
        try {
          await task();
          if (failCommit) throw new Error("commit failed");
          sqlite.exec("COMMIT");
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
      async runAsync(sql, ...params) {
        if (failSave && sql.includes("INSERT INTO ledger_sync_cursors"))
          throw new Error("cursor save failed");
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
  });
  afterEach(() => {
    sqlite.close();
  });
  it("certifies the complete received set while retaining extra historical Persons", async () => {
    const repo = createLedgerReadRepository(db, getUser);
    const old = bootstrap([person(p2)]);
    delete old.participationSnapshot;
    old.cursor = "legacy";
    await repo.applyBootstrap(old);
    const response = bootstrap();
    await repo.applyBootstrap(response, await context());
    const certificate = await repo.getParticipationCertificate(trip);
    expect(certificate?.ids).toEqual([p1]);
    expect(sqlite.prepare("SELECT count(*) AS n FROM ledger_members").get()?.n).toBe(2);
    expect(certificate?.cursor).toBe(response.cursor);
    const added = bootstrap([person(p2, true, 8), person()]);
    await repo.applyBootstrap(added, await context());
    expect((await repo.getParticipationCertificate(trip))?.ids).toEqual([p1, p2]);
  });
  it.each(["save", "commit"])(
    "rolls back every row/certificate/cursor on %s failure",
    async (failure) => {
      const repo = createLedgerReadRepository(db, getUser);
      const before = snapshot();
      failSave = failure === "save";
      failCommit = failure === "commit";
      await expect(repo.applyBootstrap(bootstrap(), await context())).rejects.toThrow(
        /failed/,
      );
      expect(snapshot()).toEqual(before);
    },
  );
  it.each([person(p1, true, 6), person(p1, true, 7)])(
    "does not certify lower or equal/opposite %j",
    async (incoming) => {
      const repo = createLedgerReadRepository(db, getUser);
      await repo.applyBootstrap(bootstrap(), await context());
      const before = snapshot();
      await expect(
        repo.applyBootstrap(bootstrap([incoming]), await context()),
      ).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    },
  );
  it.each(["pair", "count", "hash", "duplicate", "actor", "trip", "complete", "version"])(
    "rejects malformed snapshot %s atomically",
    async (kind) => {
      const repo = createLedgerReadRepository(db, getUser);
      const response = bootstrap();
      if (kind === "pair")
        delete (response.members[0] as { participationRevision?: number })
          .participationRevision;
      if (kind === "count") response.participationSnapshot!.personCount = 2;
      if (kind === "hash") response.participationSnapshot!.fingerprint = "0".repeat(64);
      if (kind === "duplicate") response.members.push(response.members[0]);
      if (kind === "actor") response.actor.userId = p2;
      if (kind === "trip") response.journey.id = p2;
      if (kind === "complete")
        (response.participationSnapshot as { complete: boolean }).complete = false;
      if (kind === "version")
        (response.participationSnapshot as { contractVersion: number }).contractVersion =
          2;
      const before = snapshot();
      await expect(repo.applyBootstrap(response, await context())).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    },
  );
  it("commits zero-change verified page and preserves full-snapshot time/set", async () => {
    const repo = createLedgerReadRepository(db, getUser);
    const response = bootstrap();
    const ctx = await context();
    await repo.applyBootstrap(response, ctx);
    const next = page(response);
    await repo.applyChanges(trip, next, ctx, response.cursor);
    const cert = await repo.getParticipationCertificate(trip);
    expect(cert?.snapshot.observedAt).toBe(time);
    expect(cert?.verifiedAt).toBe(next.participationVerification!.observedAt);
    expect(cert?.cursor).toBe(next.cursor);
  });
  it.each(["save", "commit"])(
    "rolls back page verification/cursor on %s failure",
    async (failure) => {
      const repo = createLedgerReadRepository(db, getUser);
      const response = bootstrap();
      const ctx = await context();
      await repo.applyBootstrap(response, ctx);
      const before = snapshot();
      failCommit = failure === "commit";
      failSave = failure === "save";
      await expect(
        repo.applyChanges(trip, page(response), ctx, response.cursor),
      ).rejects.toThrow(/failed/);
      expect(snapshot()).toEqual(before);
    },
  );
  it("requires exact request cursor and current local certificate before checkpoint advance", async () => {
    const repo = createLedgerReadRepository(db, getUser);
    const response = bootstrap();
    const ctx = await context();
    await expect(
      repo.applyChanges(trip, page(response), ctx, response.cursor),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await repo.applyBootstrap(response, ctx);
    const before = snapshot();
    await expect(
      repo.applyChanges(trip, page(response), ctx, "other"),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(snapshot()).toEqual(before);
    sqlite.exec("UPDATE ledger_members SET participation_revision=8");
    expect(await repo.getParticipationCertificate(trip)).toBeNull();
    const changed = snapshot();
    await expect(
      repo.applyChanges(trip, page(response), ctx, response.cursor),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(snapshot()).toEqual(changed);
  });
  it("legacy cursor upsert preserves old certificate but cannot renew verification", async () => {
    const repo = createLedgerReadRepository(db, getUser);
    const response = bootstrap();
    await repo.applyBootstrap(response, await context());
    const before = sqlite
      .prepare(
        "SELECT participation_fingerprint,participation_verified_at FROM ledger_sync_cursors",
      )
      .get();
    const legacy = bootstrap();
    delete legacy.participationSnapshot;
    delete legacy.members[0].isParticipating;
    delete legacy.members[0].participationRevision;
    legacy.cursor = "v1";
    await repo.applyBootstrap(legacy, await context());
    expect(await repo.getParticipationCertificate(trip)).toBeNull();
    expect(
      sqlite
        .prepare(
          "SELECT participation_fingerprint,participation_verified_at FROM ledger_sync_cursors",
        )
        .get(),
    ).toEqual(before);
    expect(
      sqlite
        .prepare("SELECT participation_active,participation_revision FROM ledger_members")
        .get(),
    ).toEqual({ participation_active: 0, participation_revision: 7 });
  });
  it.each([false, true])(
    "rejects delayed A response after Account transition, return to A=%s",
    async (returnToA) => {
      const repo = createLedgerReadRepository(db, getUser);
      const ctx = await context();
      advanceAccountGeneration();
      active = p2;
      if (returnToA) {
        advanceAccountGeneration();
        active = user;
      }
      await expect(repo.applyBootstrap(bootstrap(), ctx)).rejects.toThrow(
        "Account changed",
      );
      expect(snapshot()).toEqual([[], [], [], []]);
    },
  );
  it("switch cannot advance generation/session through an asynchronous DB apply window", async () => {
    const original = db.runAsync;
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => (entered = r));
    const paused = new Promise<void>((r) => (release = r));
    db.runAsync = async (sql, ...params) => {
      if (sql.includes("INTO ledger_journeys")) {
        entered();
        await paused;
      }
      return original(sql, ...(params as unknown as never[]));
    };
    const repo = createLedgerReadRepository(db, getUser);
    const apply = repo.applyBootstrap(bootstrap(), await context());
    await started;
    const switching = beginAccountTransition();
    release();
    await expect(apply).rejects.toThrow("Account changed");
    const lease = await switching;
    active = p2;
    endAccountTransition(lease);
    expect(snapshot()).toEqual([[], [], [], []]);
  });
  const sessionFor = (accountId: string): LocalSession => ({
    accessToken: "local",
    refreshToken: "local",
    expiresAt: "2099-01-01T00:00:00Z",
    identity: {
      userId: accountId,
      displayName: accountId,
      email: "synthetic@example.test",
    },
  });
  const accountBootstrap = (accountId: string) => {
    const response = bootstrap();
    response.actor.userId = accountId;
    response.cursor = encodeSharedLedgerCursor(
      0,
      trip,
      accountId,
      response.participationSnapshot!.fingerprint,
    );
    return response;
  };
  it.each([
    ["switchAccount", "bootstrap"],
    ["switchAccount", "restart"],
    ["activateSession", "bootstrap"],
    ["activateSession", "restart"],
  ] as const)(
    "%s %s recovery waits after final validation until B COMMIT finishes",
    async (method, failure) => {
      const repo = createLedgerReadRepository(db, getUser);
      const oldA = await context();
      let stored = sessionFor(user);
      let currentActor: string | null = user;
      let bContext!: AccountRequestContext;
      let apply!: Promise<void>;
      let reached!: () => void;
      let release!: () => void;
      const atCommit = new Promise<void>((resolve) => (reached = resolve));
      const paused = new Promise<void>((resolve) => (release = resolve));
      const events: string[] = [];
      const original = db.withTransactionAsync;
      db.withTransactionAsync = (task) =>
        original(async () => {
          await task(); // Repository has completed its final request-context validation.
          if (active === p2) {
            reached();
            await paused;
            expect(active).toBe(p2); // A must not become visible before this COMMIT.
            events.push("B commit");
          }
        });
      const coordinator = createAccountSwitchCoordinator({
        pauseSync: async () => {},
        readSession: async () => stored,
        writeSession: async (next) => {
          stored = next;
          active = next.identity!.userId;
        },
        clearSession: async () => {
          active = "";
        },
        selectAccount: async (id) => {
          events.push(`select ${id}`);
          active = id;
          stored = sessionFor(id);
          return true;
        },
        adoptLocalState: async () => {},
        clearInMemoryState: async () => {
          currentActor = null;
        },
        bootstrapAccount: async (next) => {
          await withAccountApplyGate(async () => {}); // No network bootstrap owns the gate.
          const id = next!.identity!.userId;
          if (id === p2) {
            bContext = await context();
            apply = repo.applyBootstrap(accountBootstrap(p2), bContext);
            void apply.catch(() => undefined);
            await atCommit;
            if (failure === "bootstrap") throw new Error("target failed");
          } else {
            await repo.applyBootstrap(accountBootstrap(user), await context());
            currentActor = user;
          }
        },
        restartSync: async () => {
          if (active === p2 && failure === "restart") throw new Error("target failed");
          await withAccountApplyGate(async () => {});
        },
      });
      const operation =
        method === "switchAccount"
          ? coordinator.switchAccount(p2)
          : coordinator.activateSession(sessionFor(p2));
      void operation.catch(() => undefined);
      await atCommit;
      const bGeneration = bContext.generation;
      try {
        await vi.waitFor(() =>
          expect(() => assertAccountRequestGeneration(bContext)).toThrow(
            "Account changed",
          ),
        );
        expect(active).toBe(p2);
        expect(stored.identity!.userId).toBe(p2);
        expect(getAccountGeneration()).toBe(bGeneration);
        expect(events).not.toContain(`select ${user}`);
      } finally {
        release();
      }
      await expect(apply).resolves.toBeUndefined();
      await expect(operation).rejects.toThrow("target failed");
      expect(events.indexOf("B commit")).toBeLessThan(events.indexOf(`select ${user}`));
      expect(active).toBe(user);
      expect(stored.identity!.userId).toBe(user);
      expect(currentActor).toBe(user);
      expect(getAccountGeneration()).toBeGreaterThan(bGeneration);
      expect(bGeneration).toBeGreaterThan(oldA.generation);
      expect((await repo.getParticipationCertificate(trip))?.cursor).toBe(
        accountBootstrap(user).cursor,
      );
      await expect(repo.applyBootstrap(accountBootstrap(p2), bContext)).rejects.toThrow(
        "Account changed",
      );
      await expect(repo.applyBootstrap(accountBootstrap(user), oldA)).rejects.toThrow(
        "Account changed",
      );
    },
  );
  it.each(["switchAccount", "activateSession"] as const)(
    "%s recovery wins before delayed B apply and fences pre-switch A",
    async (method) => {
      const repo = createLedgerReadRepository(db, getUser);
      const oldA = await context();
      let stored = sessionFor(user);
      let bContext!: AccountRequestContext;
      const coordinator = createAccountSwitchCoordinator({
        pauseSync: async () => {},
        restartSync: async () => {
          await withAccountApplyGate(async () => {});
        },
        readSession: async () => stored,
        writeSession: async (next) => {
          stored = next;
          active = next.identity!.userId;
        },
        clearSession: async () => {
          active = "";
        },
        selectAccount: async (id) => {
          active = id;
          stored = sessionFor(id);
          return true;
        },
        adoptLocalState: async () => {},
        clearInMemoryState: async () => {},
        bootstrapAccount: async (next) => {
          await withAccountApplyGate(async () => {});
          if (next!.identity!.userId === p2) {
            bContext = await context();
            throw new Error("target failed");
          }
          await repo.applyBootstrap(accountBootstrap(user), await context());
        },
      });
      await expect(
        method === "switchAccount"
          ? coordinator.switchAccount(p2)
          : coordinator.activateSession(sessionFor(p2)),
      ).rejects.toThrow("target failed");
      expect(active).toBe(user);
      expect(getAccountGeneration()).toBeGreaterThan(bContext.generation);
      const before = snapshot();
      await expect(repo.applyBootstrap(accountBootstrap(p2), bContext)).rejects.toThrow(
        "Account changed",
      );
      await expect(repo.applyBootstrap(accountBootstrap(user), oldA)).rejects.toThrow(
        "Account changed",
      );
      expect(snapshot()).toEqual(before);
      for (const table of ["ledger_actor_context", "ledger_sync_cursors"])
        expect(sqlite.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(p2)).toEqual(
          [],
        );
    },
  );
  const overlapCases = (["switchAccount", "activateSession"] as const).flatMap((first) =>
    (["switchAccount", "activateSession"] as const).flatMap((second) =>
      (["owned transition", "before commit", "completed"] as const).map(
        (phase) => [first, second, phase] as const,
      ),
    ),
  );
  it.each(overlapCases)(
    "%s stale failure vs another %s (%s) cannot recover over C",
    async (firstMethod, secondMethod, phase) => {
      const c = "30000000-0000-4000-8000-000000000003";
      let stored = sessionFor(user);
      const repo = createLedgerReadRepository(db, getUser);
      const oldA = await context();
      let oldB!: AccountRequestContext;
      let failB!: () => void;
      let bEntered!: () => void;
      let cEntered!: () => void;
      let releaseC!: () => void;
      const bReady = new Promise<void>((resolve) => (bEntered = resolve));
      const bFailure = new Promise<void>((resolve) => (failB = resolve));
      const cReady = new Promise<void>((resolve) => (cEntered = resolve));
      const cPause = new Promise<void>((resolve) => (releaseC = resolve));
      const events: string[] = [];
      const original = db.withTransactionAsync;
      db.withTransactionAsync = (task) =>
        original(async () => {
          await task();
          if (active === c) {
            if (phase === "before commit") {
              cEntered();
              await cPause;
            }
            expect(active).toBe(c);
            events.push("C commit");
          }
        });
      const makeCoordinator = () =>
        createAccountSwitchCoordinator({
          pauseSync: async () => {},
          readSession: async () => stored,
          writeSession: async (next) => {
            active = next.identity!.userId;
            stored = next;
            events.push(`install ${active}`);
            if (active === c && phase === "owned transition") {
              cEntered();
              await cPause;
            }
          },
          clearSession: async () => {
            active = "";
          },
          selectAccount: async (id) => {
            active = id;
            stored = sessionFor(id);
            events.push(`install ${id}`);
            if (id === c && phase === "owned transition") {
              cEntered();
              await cPause;
            }
            return true;
          },
          adoptLocalState: async () => {},
          clearInMemoryState: async () => {},
          bootstrapAccount: async (next) => {
            await withAccountApplyGate(async () => {});
            const id = next!.identity!.userId;
            if (id === p2) {
              oldB = await context();
              bEntered();
              await bFailure;
              events.push("B failure");
              throw new Error("B bootstrap failed");
            }
            await repo.applyBootstrap(accountBootstrap(id), await context());
          },
          restartSync: async () => {
            await withAccountApplyGate(async () => {});
          },
        });
      const first = makeCoordinator();
      const second = makeCoordinator();
      const bOperation =
        firstMethod === "switchAccount"
          ? first.switchAccount(p2)
          : first.activateSession(sessionFor(p2));
      let bSettled = false;
      void bOperation.then(
        () => {
          bSettled = true;
        },
        () => {
          bSettled = true;
        },
      );
      await bReady;
      const cOperation =
        secondMethod === "switchAccount"
          ? second.switchAccount(c)
          : second.activateSession(sessionFor(c));
      void cOperation.catch(() => undefined);
      if (phase === "completed") await cOperation;
      else await cReady;
      const generationC = getAccountGeneration();
      failB();
      try {
        // Drain runnable promise work so B recovery has requested serialization.
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(events).toContain("B failure");
        expect(active).toBe(c);
        expect(stored.identity!.userId).toBe(c);
        expect(getAccountGeneration()).toBe(generationC);
        expect(events).not.toContain(`install ${user}`);
        if (phase !== "completed") expect(bSettled).toBe(false);
      } finally {
        releaseC();
      }
      await cOperation;
      await expect(bOperation).rejects.toThrow("B bootstrap failed");
      expect(active).toBe(c);
      expect(stored.identity!.userId).toBe(c);
      expect(getAccountGeneration()).toBe(generationC);
      expect(events.filter((event) => event.startsWith("install "))).toEqual([
        `install ${p2}`,
        `install ${c}`,
      ]);
      expect(events).toContain("C commit");
      expect((await repo.getParticipationCertificate(trip))?.cursor).toBe(
        accountBootstrap(c).cursor,
      );
      const before = snapshot();
      await expect(repo.applyBootstrap(accountBootstrap(p2), oldB)).rejects.toThrow(
        "Account changed",
      );
      await expect(repo.applyBootstrap(accountBootstrap(user), oldA)).rejects.toThrow(
        "Account changed",
      );
      expect(snapshot()).toEqual(before);
      expect(sqlite.prepare("SELECT user_id FROM ledger_actor_context").all()).toEqual([
        { user_id: c },
      ]);
      expect(sqlite.prepare("SELECT user_id FROM ledger_sync_cursors").all()).toEqual([
        { user_id: c },
      ]);
    },
  );
  it("survives reopening SQLite and rolls back a disconnected transaction", async () => {
    const dir = mkdtempSync(join(tmpdir(), "otr-i2b2-sqlite-"));
    const path = join(dir, "cache.db");
    sqlite.close();
    sqlite = new DatabaseSync(path);
    for (const migration of migrations) sqlite.exec(migration.sql);
    const repo = createLedgerReadRepository(db, getUser);
    const response = bootstrap();
    await repo.applyBootstrap(response, await context());
    const before = snapshot();
    sqlite.exec("BEGIN");
    sqlite.exec(
      "UPDATE ledger_sync_cursors SET participation_verified_at='2026-10-04T00:00:09.000000Z'",
    );
    sqlite.close();
    sqlite = new DatabaseSync(path);
    expect(snapshot()).toEqual(before);
    expect((await repo.getParticipationCertificate(trip))?.cursor).toBe(response.cursor);
    rmSync(dir, { recursive: true, force: true });
  });
  it("SQLite upgrade keeps legacy cursor metadata unobserved and disallows partial certificate", () => {
    expect(() =>
      sqlite.exec(
        `INSERT INTO ledger_sync_cursors(user_id,journey_id,updated_at,participation_fingerprint) VALUES ('${user}','${trip}','now','${"a".repeat(64)}')`,
      ),
    ).toThrow(/CHECK/);
  });
});
