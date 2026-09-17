import { describe, expect, it } from "vitest";

import {
  createLedgerExpenseRepository,
  type LedgerExpenseDatabase,
  type LedgerExpenseCommand,
} from "./ledgerExpenseRepository";

type ExpenseRow = Record<string, unknown>;

function createInMemoryLedgerDatabase() {
  const expenses = new Map<string, ExpenseRow>();
  const participants = new Map<string, ExpenseRow[]>();
  const splits = new Map<string, ExpenseRow[]>();
  const valuations = new Map<string, ExpenseRow>();
  const payments = new Map<string, ExpenseRow[]>();
  const operations: ExpenseRow[] = [];
  const auditEvents: ExpenseRow[] = [];
  let transactionCount = 0;

  const database: LedgerExpenseDatabase = {
    async withTransactionAsync(task) {
      transactionCount += 1;
      await task();
    },
    async runAsync(sql, ...params) {
      if (sql.includes("INSERT INTO ledger_expenses")) {
        const [
          id,
          serverId,
          journeyId,
          creatorMemberId,
          payerMemberId,
          title,
          description,
          category,
          occurredAt,
          originalAmountMinor,
          originalCurrency,
          originalScale,
          businessStatus,
          settlementParticipation,
          revision,
          serverRevision,
          deletedAt,
          syncStatus,
          ,
          createdAt,
          updatedAt,
          localOwnerUserId,
        ] = params;
        expenses.set(id as string, {
          id,
          serverId,
          journeyId,
          creatorMemberId,
          payerMemberId,
          title,
          description,
          category,
          occurredAt,
          originalAmountMinor,
          originalCurrency,
          originalScale,
          businessStatus,
          settlementParticipation,
          revision,
          serverRevision,
          deletedAt,
          syncStatus,
          createdAt,
          updatedAt,
          localOwnerUserId,
        });
      } else if (sql.includes("INSERT INTO ledger_expense_participants")) {
        const [
          expenseId,
          memberId,
          displayNameSnapshot,
          householdIdSnapshot,
          displayOrder,
        ] = params;
        participants.set(expenseId as string, [
          ...(participants.get(expenseId as string) ?? []),
          { memberId, displayNameSnapshot, householdIdSnapshot, displayOrder },
        ]);
      } else if (sql.includes("INSERT INTO ledger_expense_splits")) {
        const [
          expenseId,
          memberId,
          method,
          originalMinor,
          settlementMinor,
          weightUnits,
          percentageUnits,
          roundingAdjustmentMinor,
        ] = params;
        splits.set(expenseId as string, [
          ...(splits.get(expenseId as string) ?? []),
          {
            memberId,
            method,
            originalMinor,
            settlementMinor,
            weightUnits,
            percentageUnits,
            roundingAdjustmentMinor,
          },
        ]);
      } else if (sql.includes("INTO ledger_valuation_snapshots")) {
        const [
          id,
          ,
          expenseId,
          ,
          policy,
          originalMinor,
          originalCurrency,
          originalScale,
          settlementMinor,
          settlementCurrency,
          settlementScale,
          rateSnapshotId,
          paymentRecordId,
          reason,
          isActive,
        ] = params;
        valuations.set(expenseId as string, {
          id,
          policy,
          originalMinor,
          originalCurrency,
          originalScale,
          settlementMinor,
          settlementCurrency,
          settlementScale,
          rateSnapshotId,
          paymentRecordId,
          reason,
          isActive,
        });
      } else if (sql.includes("UPDATE ledger_valuation_snapshots SET is_active = 0")) {
        const existing = valuations.get(params[0] as string);
        if (existing) existing.isActive = 0;
      } else if (sql.includes("INTO ledger_payment_records")) {
        const [
          id,
          serverId,
          expenseId,
          expenseRevision,
          payerMemberId,
          instrumentLabel,
          authorizationMinor,
          authorizationCurrency,
          authorizationScale,
          postedMinor,
          postedCurrency,
          postedScale,
          authorizedAt,
          postedAt,
          feeMinor,
          feeCurrency,
          feeScale,
          bankFxRate,
          source,
          notes,
          supersedesPaymentRecordId,
        ] = params;
        payments.set(expenseId as string, [
          ...(payments.get(expenseId as string) ?? []),
          {
            id,
            serverId,
            expenseRevision,
            payerMemberId,
            instrumentLabel,
            authorizationMinor,
            authorizationCurrency,
            authorizationScale,
            postedMinor,
            postedCurrency,
            postedScale,
            authorizedAt,
            postedAt,
            feeMinor,
            feeCurrency,
            feeScale,
            bankFxRate,
            source,
            notes,
            supersedesPaymentRecordId,
          },
        ]);
      } else if (sql.includes("INSERT INTO ledger_expense_audit_events")) {
        auditEvents.push({
          expenseId: params[1],
          revision: params[2],
          eventType: params[3],
        });
      } else if (sql.includes("INSERT INTO sync_operations")) {
        operations.push({
          tripId: params[1],
          entityType: params[2],
          entityId: params[3],
          operationType: params[4],
          idempotencyKey: params[5],
          baseVersion: params[6],
          payloadJson: params[7],
          ownerUserId: params[8],
          status: params[9],
        });
      } else if (sql.includes("UPDATE ledger_expenses SET\n      journey_id")) {
        const id = params[20] as string;
        const row = expenses.get(id);
        if (row) {
          Object.assign(row, {
            journeyId: params[0],
            creatorMemberId: params[1],
            payerMemberId: params[2],
            title: params[3],
            description: params[4],
            category: params[5],
            occurredAt: params[6],
            originalAmountMinor: params[7],
            originalCurrency: params[8],
            originalScale: params[9],
            businessStatus: params[10],
            settlementParticipation: params[11],
            revision: params[12],
            serverId: params[13],
            serverRevision: params[14],
            deletedAt: params[15],
            syncStatus: params[16],
            localOwnerUserId: params[18],
            updatedAt: params[19],
          });
        }
      } else if (sql.includes("business_status = ?, deleted_at = ?")) {
        const row = expenses.get(params[6] as string);
        if (row) {
          row.businessStatus = params[0];
          row.deletedAt = params[1];
          row.revision = params[2];
          row.syncStatus = params[3];
          row.localOwnerUserId = params[4];
        }
      } else if (sql.includes("business_status = ?, deleted_at = NULL")) {
        const row = expenses.get(params[5] as string);
        if (row) {
          row.businessStatus = params[0];
          row.deletedAt = null;
          row.revision = params[1];
          row.syncStatus = params[2];
          row.localOwnerUserId = params[3];
        }
      } else if (sql.includes("DELETE FROM ledger_expense_participants")) {
        participants.set(params[0] as string, []);
      } else if (sql.includes("DELETE FROM ledger_expense_splits")) {
        splits.set(params[0] as string, []);
      } else if (sql.includes("DELETE FROM ledger_valuation_snapshots")) {
        valuations.delete(params[0] as string);
      } else if (sql.includes("DELETE FROM ledger_payment_records")) {
        payments.set(params[0] as string, []);
      }
      return {} as never;
    },
    async getFirstAsync<T>(sql: string, ...params: unknown[]) {
      const id = params[0] as string;
      if (sql.includes("FROM ledger_expenses")) {
        const row = expenses.get(id);
        return (
          row && (row.syncStatus === "SYNCED" || row.localOwnerUserId === params[1])
            ? row
            : null
        ) as T | null;
      }
      if (sql.includes("FROM ledger_valuation_snapshots")) {
        const value = valuations.get(id);
        return (value?.isActive ? value : null) as T | null;
      }
      return null;
    },
    async getAllAsync<T>(sql: string, ...params: unknown[]) {
      const id = params[0] as string;
      if (sql.includes("FROM ledger_expenses")) {
        return [...expenses.values()].filter(
          (row) =>
            row.journeyId === id &&
            (row.syncStatus === "SYNCED" || row.localOwnerUserId === params[1]),
        ) as T[];
      }
      if (sql.includes("FROM ledger_expense_participants")) {
        return (participants.get(id) ?? []) as T[];
      }
      if (sql.includes("FROM ledger_expense_splits"))
        return (splits.get(id) ?? []) as T[];
      if (sql.includes("FROM ledger_payment_records"))
        return (payments.get(id) ?? []) as T[];
      return [] as T[];
    },
  };

  return {
    database,
    expenses,
    operations,
    auditEvents,
    valuations,
    transactionCount: () => transactionCount,
  };
}

const command: LedgerExpenseCommand = {
  journeyId: "journey-a",
  creatorMemberId: "member-a",
  payerMemberId: "member-a",
  title: "Lisbon dinner",
  category: "food",
  occurredAt: "2026-09-11T18:30:00.000Z",
  original: { minor: 10_000, currency: "EUR", scale: 2 },
  participants: [
    { memberId: "member-a", displayNameSnapshot: "Alex", householdIdSnapshot: null },
    { memberId: "member-b", displayNameSnapshot: "Bea", householdIdSnapshot: null },
  ],
  splits: [
    {
      memberId: "member-a",
      originalMinor: 5_000,
      settlementMinor: 9_900,
      method: "EQUAL_PERSON",
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
    {
      memberId: "member-b",
      originalMinor: 5_000,
      settlementMinor: 9_900,
      method: "EQUAL_PERSON",
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: {
    id: "valuation-a",
    policy: "REFERENCE_RATE",
    original: { minor: 10_000, currency: "EUR", scale: 2 },
    settlement: { minor: 19_800, currency: "NZD", scale: 2 },
    rateSnapshotId: "rate-a",
    paymentRecordId: "payment-a",
    reason: "Agreed Journey rate",
  },
  status: "ACCEPTED",
};

describe("Ledger Expense repository", () => {
  const activeUser = async () => "user-a";

  it("atomically persists the full Expense aggregate and one durable create operation", async () => {
    const { database, operations, auditEvents, transactionCount } =
      createInMemoryLedgerDatabase();
    const repository = createLedgerExpenseRepository(database, activeUser);

    const created = await repository.createExpense(command);

    expect(transactionCount()).toBe(1);
    expect(created).toMatchObject({
      journeyId: "journey-a",
      title: "Lisbon dinner",
      settlementParticipation: "INCLUDED",
      syncStatus: "PENDING_CREATE",
      paymentRecords: [],
    });
    expect(operations).toEqual([
      expect.objectContaining({
        entityId: created.id,
        entityType: "ledger_expense",
        idempotencyKey: expect.stringMatching(/^ledger-idempotency_/),
        operationType: "LEDGER_CREATE_EXPENSE",
        status: "PENDING",
      }),
    ]);
    expect(auditEvents).toEqual([
      expect.objectContaining({
        expenseId: created.id,
        revision: 1,
        eventType: "CREATED",
      }),
    ]);
  });

  it("rehydrates the same persisted aggregate and keeps Journey lists isolated", async () => {
    const { database } = createInMemoryLedgerDatabase();
    const writer = createLedgerExpenseRepository(database, activeUser);
    const created = await writer.createExpense(command);
    await writer.addPaymentRecord(created.id, {
      instrumentLabel: "Travel card",
      authorization: null,
      posted: { minor: 19_943, currency: "NZD", scale: 2 },
      postedAt: "2026-09-12T00:00:00.000Z",
      fee: null,
      supersedesPaymentRecordId: null,
    });
    await writer.createExpense({ ...command, journeyId: "journey-b", title: "B only" });

    const restartedReader = createLedgerExpenseRepository(database, activeUser);

    await expect(restartedReader.getExpense(created.id)).resolves.toMatchObject({
      id: created.id,
      original: { minor: 10_000, currency: "EUR" },
      valuation: { settlement: { minor: 19_800, currency: "NZD" } },
      paymentRecords: [{ posted: { minor: 19_943, currency: "NZD" } }],
    });
    await expect(
      restartedReader.listExpensesForJourney("journey-a"),
    ).resolves.toHaveLength(1);
    await expect(
      restartedReader.listExpensesForJourney("journey-b"),
    ).resolves.toHaveLength(1);
  });

  it("records revisioned update, tombstone, and restore operations without a duplicate row", async () => {
    const { database, expenses, operations, auditEvents } =
      createInMemoryLedgerDatabase();
    const repository = createLedgerExpenseRepository(database, activeUser);
    const created = await repository.createExpense(command);

    const updated = await repository.updateExpense(
      created.id,
      {
        ...command,
        title: "Lisbon dinner corrected",
        settlementParticipation: "EXCLUDED",
      },
      "Corrected receipt title and settlement participation",
    );
    await repository.tombstoneExpense(created.id, "Duplicate entry");
    await repository.restoreExpense(created.id, "ACCEPTED", "Not a duplicate");

    expect(expenses.size).toBe(1);
    expect(updated).toMatchObject({
      revision: 2,
      settlementParticipation: "EXCLUDED",
      syncStatus: "PENDING_UPDATE",
    });
    expect(JSON.parse(operations[1]!.payloadJson as string)).toMatchObject({
      expense: { settlementParticipation: "EXCLUDED" },
      baseExpense: { settlementParticipation: "INCLUDED" },
    });
    expect(operations.map((operation) => operation.operationType)).toEqual([
      "LEDGER_CREATE_EXPENSE",
      "LEDGER_UPDATE_EXPENSE",
      "LEDGER_DELETE_EXPENSE",
      "LEDGER_RESTORE_EXPENSE",
    ]);
    expect(auditEvents.map((event) => event.eventType)).toEqual([
      "CREATED",
      "UPDATED",
      "TOMBSTONED",
      "RESTORED",
    ]);
  });

  it("retains historical valuation evidence while a date correction becomes RATE_REQUIRED", async () => {
    const { database, valuations, operations, auditEvents } =
      createInMemoryLedgerDatabase();
    const repository = createLedgerExpenseRepository(database, activeUser);
    const created = await repository.createExpense(command);
    await expect(
      repository.updateExpense(
        created.id,
        { ...command, occurredAt: "2026-09-12", valuation: created.valuation },
        "Wrong date",
      ),
    ).rejects.toThrow(/cannot retain/);

    const corrected = await repository.updateExpense(
      created.id,
      {
        ...command,
        occurredAt: "2026-09-12",
        valuation: null,
        status: "RATE_REQUIRED",
        splits: command.splits.map((split) => ({ ...split, settlementMinor: null })),
      },
      "Corrected date",
    );
    expect(corrected.status).toBe("RATE_REQUIRED");
    expect((await repository.getExpense(created.id))?.valuation).toBeNull();
    expect(valuations.get(created.id)).toMatchObject({ id: "valuation-a", isActive: 0 });
    expect(JSON.parse(operations[1]!.payloadJson as string)).toMatchObject({
      expense: {
        occurredAt: "2026-09-12",
        valuation: null,
        businessStatus: "RATE_REQUIRED",
      },
    });
    expect(auditEvents.map((event) => event.eventType)).toEqual(["CREATED", "UPDATED"]);
  });

  it("queues append-only PaymentRecord evidence without revising the Expense", async () => {
    const { database, operations } = createInMemoryLedgerDatabase();
    const repository = createLedgerExpenseRepository(database, activeUser);
    const created = await repository.createExpense(command);
    const payment = await repository.addPaymentRecord(created.id, {
      instrumentLabel: "Visa NZ",
      authorization: null,
      posted: { minor: 19_943, currency: "NZD", scale: 2 },
      authorizedAt: null,
      postedAt: "2026-09-12T00:00:00.000Z",
      fee: { minor: 200, currency: "NZD", scale: 2 },
      bankFxRate: "1.9943",
      source: "manual",
      notes: null,
      supersedesPaymentRecordId: null,
    });

    expect(payment).toMatchObject({
      expenseRevision: 1,
      payerMemberId: "member-a",
      posted: { minor: 19_943 },
    });
    await expect(repository.getExpense(created.id)).resolves.toMatchObject({
      revision: 1,
      valuation: { settlement: { minor: 19_800 } },
    });
    expect(operations.map((item) => item.operationType)).toEqual([
      "LEDGER_CREATE_EXPENSE",
      "LEDGER_ADD_PAYMENT_RECORD",
    ]);
  });
});
