import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ledgerMemberSchema,
  type LedgerBootstrapResponse,
} from "@/data/api/ledgerReadContracts";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createAccountSwitchCoordinator } from "@/data/auth/accountSwitchCoordinator";
import { createAuthRepository } from "@/data/auth/authSessionRepository";
import { bootstrapApplication } from "@/data/bootstrap/bootstrapApplication";
import { migrations } from "@/data/db/migrations";
import type { LocalSession } from "@/domain/auth/localSession";

import {
  createLedgerReadRepository,
  type LedgerReadDatabase,
} from "./ledgerReadRepository";
import { createTripPersonRepository } from "./tripPersonRepository";

const tripA = "10000000-0000-4000-8000-000000000001";
const tripB = "10000000-0000-4000-8000-000000000002";
const memberA = "20000000-0000-4000-8000-000000000001";
const memberB = "20000000-0000-4000-8000-000000000002";
const userA = "30000000-0000-4000-8000-000000000001";
const userB = "30000000-0000-4000-8000-000000000002";
const now = "2026-10-03T00:00:00.000Z";
const capabilities: LedgerBootstrapResponse["actor"]["capabilities"] = {
  canRead: false,
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

function bootstrap(
  tripId: string,
  members: {
    id: string;
    displayName: string;
    isParticipating?: boolean;
    participationRevision?: number;
  }[],
  linkedMemberId: string | null = null,
): LedgerBootstrapResponse {
  return {
    journey: {
      id: tripId,
      title: "Trip",
      startDate: null,
      endDate: null,
      settlementCurrency: "NZD",
      settlementScale: 2,
      valuationPolicy: "REFERENCE_RATE",
      updatedAt: now,
    },
    members: members.map((member) => ({
      ...member,
      role: "group_member",
      status: member.id === linkedMemberId ? "linked" : "unlinked",
      capabilities,
      updatedAt: now,
    })),
    households: [],
    expenses: [],
    corrections: [],
    rateQuotes: [],
    actor: { memberId: linkedMemberId, role: null, capabilities },
    cursor: null,
    serverTime: now,
  };
}

describe("canonical Trip Person read boundary", () => {
  let sqlite: DatabaseSync;
  let directory: string;
  let path: string;
  let database: LedgerReadDatabase;
  let userId: string;
  const activeUser = async () => userId;
  const read = (tripId: string) =>
    createTripPersonRepository(database, activeUser).listTripPersons(tripId);
  const hydrate = (response: LedgerBootstrapResponse) =>
    createLedgerReadRepository(database, activeUser).applyBootstrap(response);

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "otr-trip-person-"));
    path = join(directory, "cache.db");
    sqlite = new DatabaseSync(path);
    for (const migration of migrations) sqlite.exec(migration.sql);
    userId = userA;
    database = {
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
      async runAsync(sql: string, ...params: unknown[]) {
        return sqlite.prepare(sql).run(...(params as never[])) as never;
      },
      async getFirstAsync(sql: string, ...params: unknown[]) {
        return (sqlite.prepare(sql).get(...(params as never[])) ?? null) as never;
      },
      async getAllAsync(sql: string, ...params: unknown[]) {
        return sqlite.prepare(sql).all(...(params as never[])) as never;
      },
    };
  });
  afterEach(() => {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("A: reads an unlinked name-only Person without inventing an Account ID", async () => {
    await hydrate(bootstrap(tripA, [{ id: memberA, displayName: "Tina" }]));
    expect(await read(tripA)).toEqual([
      { tripId: tripA, personId: memberA, displayName: "Tina", participation: null },
    ]);
    expect(sqlite.prepare("SELECT status FROM ledger_members").get()).toMatchObject({
      status: "unlinked",
    });
  });

  it("B: preserves duplicate names as distinct Member identities", async () => {
    await hydrate(
      bootstrap(tripA, [
        { id: memberB, displayName: "David" },
        { id: memberA, displayName: "David" },
      ]),
    );
    expect(await read(tripA)).toEqual([
      { tripId: tripA, personId: memberA, displayName: "David", participation: null },
      { tripId: tripA, personId: memberB, displayName: "David", participation: null },
    ]);
  });

  it("C: the same Account has independent linked Member IDs in different Trips", async () => {
    await hydrate(bootstrap(tripA, [{ id: memberA, displayName: "Leon" }], memberA));
    await hydrate(bootstrap(tripB, [{ id: memberB, displayName: "Leon" }], memberB));
    expect((await read(tripA))[0]?.personId).toBe(memberA);
    expect((await read(tripB))[0]?.personId).toBe(memberB);
    expect(
      sqlite
        .prepare(
          "SELECT user_id, member_id FROM ledger_actor_context ORDER BY journey_id",
        )
        .all(),
    ).toEqual([
      expect.objectContaining({ user_id: userA, member_id: memberA }),
      expect.objectContaining({ user_id: userA, member_id: memberB }),
    ]);
    expect([memberA, memberB]).not.toContain(userA);
  });

  it("D: preserves pulled payer/Participant/split IDs and existing Ledger member reads", async () => {
    const response = bootstrap(tripA, [{ id: memberA, displayName: "Tina" }]);
    response.expenses = [
      {
        id: "40000000-0000-4000-8000-000000000001",
        journeyId: tripA,
        creatorMemberId: null,
        payerMemberId: memberA,
        title: "Lunch",
        description: null,
        category: "FOOD",
        occurredAt: now,
        original: { minor: 2000, currency: "NZD", scale: 2 },
        businessStatus: "ACCEPTED",
        settlementParticipation: "INCLUDED",
        revision: 1,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        participants: [
          { memberId: memberA, displayNameSnapshot: "Tina", householdIdSnapshot: null },
        ],
        splits: [
          {
            memberId: memberA,
            method: "EQUAL_PERSON",
            originalMinor: 2000,
            settlementMinor: 2000,
            weightUnits: null,
            percentageUnits: null,
            roundingAdjustmentMinor: 0,
          },
        ],
        valuation: null,
        paymentRecords: [],
        auditEvents: [],
      },
    ];
    await hydrate(response);
    const snapshot = () =>
      [
        "ledger_expenses",
        "ledger_expense_participants",
        "ledger_expense_splits",
        "ledger_members",
      ].map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all());
    const before = snapshot();
    const ledger = createLedgerReadRepository(database, activeUser);
    const membersBefore = await ledger.listMembers(tripA);
    const [person] = await read(tripA);
    expect(person?.personId).toBe(response.expenses[0]?.payerMemberId);
    expect(person?.personId).toBe(response.expenses[0]?.participants[0]?.memberId);
    expect(await ledger.listMembers(tripA)).toEqual(membersBefore);
    expect(snapshot()).toEqual(before);
    const financialBefore = before.slice(0, 3);
    response.members[0]!.isParticipating = false;
    response.members[0]!.participationRevision = 7;
    await hydrate({ ...response, expenses: [] });
    expect(snapshot().slice(0, 3)).toEqual(financialBefore);
    expect(await ledger.listMembers(tripA)).toEqual(membersBefore);
    expect((await read(tripA))[0]?.participation).toEqual({
      isParticipating: false,
      revision: 7,
    });
  });

  it("E: account switching hides A-only Persons and preserves shared authorized context", async () => {
    await hydrate(bootstrap(tripA, [{ id: memberA, displayName: "Tina" }]));
    userId = userB;
    await hydrate(bootstrap(tripB, [{ id: memberB, displayName: "David" }]));
    userId = userA;
    const repository = createTripPersonRepository(database, activeUser);
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: async () => {},
      restartSync: async () => {},
      readSession: async () => ({
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        identity: { userId, displayName: "Account", email: null },
      }),
      writeSession: async () => {},
      clearSession: async () => {},
      selectAccount: async (next) => {
        userId = next;
        return true;
      },
      adoptLocalState: async () => {},
      clearInMemoryState: () => {},
      bootstrapAccount: async () => {},
    });
    expect(await repository.listTripPersons(tripA)).toHaveLength(1);
    await coordinator.switchAccount(userB);
    expect(await repository.listTripPersons(tripA)).toEqual([]);
    expect(await repository.listTripPersons(tripB)).toEqual([
      { tripId: tripB, personId: memberB, displayName: "David", participation: null },
    ]);
    await hydrate(bootstrap(tripA, [{ id: memberA, displayName: "Tina" }]));
    expect(await repository.listTripPersons(tripA)).toHaveLength(1);
    await coordinator.switchAccount(userA);
    expect(await repository.listTripPersons(tripB)).toEqual([]);
    expect(await repository.listTripPersons(tripA)).toHaveLength(1);
  });

  it("F: reopens cached Persons with a persisted offline expired-token session", async () => {
    await hydrate(
      bootstrap(tripA, [
        {
          id: memberA,
          displayName: "Tina",
          isParticipating: false,
          participationRevision: 7,
        },
      ]),
    );
    const storage = new Map<string, string>();
    const adapter = {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        storage.set(key, value);
      },
      deleteItem: async (key: string) => {
        storage.delete(key);
      },
    };
    const session: LocalSession = {
      accessToken: "expired",
      refreshToken: "cached-refresh",
      expiresAt: "2000-01-01T00:00:00.000Z",
      identity: { userId: userA, displayName: "Account", email: null },
    };
    await createAuthRepository(adapter).writeLocalSession(session);
    sqlite.close();
    sqlite = new DatabaseSync(path);
    const restartedAuth = createAuthRepository(adapter);
    const resumeSync = vi.fn().mockRejectedValue(new Error("offline"));
    expect(
      await bootstrapApplication({
        openDatabase: async () => database,
        readLocalSession: restartedAuth.readLocalSession,
        resumeSync,
      }),
    ).toEqual({ authState: "AUTHENTICATED_OFFLINE", syncStatus: "paused_auth" });
    const repository = createTripPersonRepository(database, async () => {
      const identity = (await restartedAuth.readLocalSession())?.identity;
      if (!identity) throw new Error("No local account.");
      return identity.userId;
    });
    expect(await repository.listTripPersons(tripA)).toEqual([
      {
        tripId: tripA,
        personId: memberA,
        displayName: "Tina",
        participation: { isParticipating: false, revision: 7 },
      },
    ]);
    expect(resumeSync).toHaveBeenCalledOnce();
  });

  it("G: Person existence does not grant access, create Persons, or mutate capabilities", async () => {
    await hydrate(bootstrap(tripA, [{ id: memberA, displayName: "Tina" }]));
    const before = sqlite.prepare("SELECT * FROM ledger_actor_context").all();
    const changes = sqlite.prepare("SELECT total_changes() AS count").get();
    expect(await read(tripA)).toEqual([
      { tripId: tripA, personId: memberA, displayName: "Tina", participation: null },
    ]);
    expect(sqlite.prepare("SELECT * FROM ledger_actor_context").all()).toEqual(before);
    expect(sqlite.prepare("SELECT total_changes() AS count").get()).toEqual(changes);
    sqlite.exec("DELETE FROM ledger_actor_context");
    expect(await read(tripA)).toEqual([]);
    await hydrate(bootstrap(tripB, []));
    expect(await read(tripB)).toEqual([]);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM ledger_members").get(),
    ).toMatchObject({ count: 1 });
  });

  it.each(["different-account", "same-account-new-generation"])(
    "rejects an in-flight projection after %s transition",
    async (transition) => {
      await hydrate(bootstrap(tripA, [{ id: memberA, displayName: "Tina" }]));
      const repository = createTripPersonRepository(
        {
          async getAllAsync<T>(sql: string, ...params: unknown[]) {
            const rows = await database.getAllAsync<T>(sql, ...(params as never[]));
            if (transition === "different-account") userId = userB;
            else advanceAccountGeneration();
            return rows;
          },
        },
        activeUser,
      );
      await expect(repository.listTripPersons(tripA)).rejects.toThrow("Account changed");
    },
  );

  it("observes ACTIVE/INACTIVE without filtering the complete canonical list", async () => {
    await hydrate(
      bootstrap(tripA, [
        {
          id: memberA,
          displayName: "Tina",
          isParticipating: true,
          participationRevision: 0,
        },
        {
          id: memberB,
          displayName: "David",
          isParticipating: false,
          participationRevision: 7,
        },
      ]),
    );
    expect((await read(tripA)).map((p) => [p.personId, p.participation])).toEqual([
      [memberB, { isParticipating: false, revision: 7 }],
      [memberA, { isParticipating: true, revision: 0 }],
    ]);
  });

  it("preserves known state through omitted, lower and equal responses, then observes ABA advancement", async () => {
    const response = (state?: boolean, revision?: number) =>
      bootstrap(tripA, [
        {
          id: memberA,
          displayName: "Tina",
          ...(state === undefined
            ? {}
            : { isParticipating: state, participationRevision: revision }),
        },
      ]);
    await hydrate(response(false, 7));
    for (const old of [response(), response(true, 6), response(false, 7)]) {
      await hydrate(old);
      expect((await read(tripA))[0]?.participation).toEqual({
        isParticipating: false,
        revision: 7,
      });
    }
    await hydrate(response(true, 8));
    await hydrate(response(false, 9));
    expect((await read(tripA))[0]?.participation).toEqual({
      isParticipating: false,
      revision: 9,
    });
  });

  it.each([
    { isParticipating: true, participationRevision: 7 },
    { isParticipating: false },
    { participationRevision: 8 },
    { isParticipating: null, participationRevision: 8 },
    { isParticipating: "false", participationRevision: 8 },
    { isParticipating: true, participationRevision: null },
    { isParticipating: true, participationRevision: -1 },
    { isParticipating: true, participationRevision: 1.5 },
    { isParticipating: true, participationRevision: Number.MAX_SAFE_INTEGER + 1 },
  ])(
    "rejects inconsistent or malformed lifecycle evidence atomically: %j",
    async (pair) => {
      await hydrate(
        bootstrap(tripA, [
          {
            id: memberA,
            displayName: "Tina",
            isParticipating: false,
            participationRevision: 7,
          },
        ]),
      );
      const tables = [
        "ledger_journeys",
        "ledger_members",
        "ledger_actor_context",
        "ledger_sync_cursors",
      ];
      const snapshot = () =>
        tables.map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all());
      const before = snapshot();
      const bad = bootstrap(tripA, [
        {
          id: memberB,
          displayName: "Must roll back",
          isParticipating: true,
          participationRevision: 8,
        },
        { id: memberA, displayName: "Must also roll back", ...pair } as never,
      ]);
      bad.journey.title = "Must roll back";
      bad.cursor = "must-not-advance";
      await expect(hydrate(bad)).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    },
  );

  it("rejects a Member ID attached to another Trip without moving its observation", async () => {
    await hydrate(
      bootstrap(tripA, [
        {
          id: memberA,
          displayName: "Tina",
          isParticipating: false,
          participationRevision: 7,
        },
      ]),
    );
    await expect(
      hydrate(bootstrap(tripB, [{ id: memberA, displayName: "Tina" }])),
    ).rejects.toThrow("different Trip");
    expect((await read(tripA))[0]?.participation).toEqual({
      isParticipating: false,
      revision: 7,
    });
    expect(await read(tripB)).toEqual([]);
  });

  it("accepts legacy DTO omission and old non-strict parsers strip additive fields", () => {
    const legacy = bootstrap(tripA, [{ id: memberA, displayName: "Tina" }]).members[0]!;
    expect(ledgerMemberSchema.parse(legacy)).toEqual(legacy);
    const {
      isParticipating: _state,
      participationRevision: _revision,
      ...oldShape
    } = ledgerMemberSchema.shape;
    const oldSchema = z.object(oldShape);
    expect(
      oldSchema.parse({ ...legacy, isParticipating: false, participationRevision: 7 }),
    ).toEqual(legacy);
  });

  it("fails closed when there is no authenticated local Account", async () => {
    const getAllAsync = vi.fn();
    const repository = createTripPersonRepository({ getAllAsync }, async () => {
      throw new Error("No local account.");
    });
    await expect(repository.listTripPersons(tripA)).rejects.toThrow("No local account");
    expect(getAllAsync).not.toHaveBeenCalled();
  });
});
