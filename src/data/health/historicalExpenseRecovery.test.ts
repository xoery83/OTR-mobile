import { describe, expect, it } from "vitest";

import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import {
  inspectHistoricalExpenseRecovery,
  ledgerExpenseToUpdateRequest,
  type HistoricalExpenseOperation,
} from "./historicalExpenseRecovery";

describe("historical Expense recovery evidence", () => {
  it("accepts one or many unambiguous attempted historical edits deterministically", () => {
    const one = fixture();
    const first = inspectHistoricalExpenseRecovery(one);
    expect(first).toMatchObject({
      createOperationId: "create",
      historicalUpdateIds: ["update-1"],
    });

    const many = fixture();
    many.operations.push(operation("update-2", "LEDGER_UPDATE_EXPENSE", "FAILED", 2));
    const second = inspectHistoricalExpenseRecovery(many);
    expect(second?.historicalUpdateIds).toEqual(["update-1", "update-2"]);
    expect(
      inspectHistoricalExpenseRecovery({
        ...many,
        operations: [...many.operations].reverse(),
      }),
    ).toEqual(second);
  });

  it.each([
    [
      "missing payload",
      (value: ReturnType<typeof fixture>) => {
        value.operations[0].payloadJson = "{}";
      },
    ],
    [
      "ambiguous root",
      (value: ReturnType<typeof fixture>) => {
        value.operations.push(
          operation("create-2", "LEDGER_CREATE_EXPENSE", "FAILED", 3),
        );
      },
    ],
    [
      "structured rejection",
      (value: ReturnType<typeof fixture>) => {
        value.operations[0].failureCategory = "VALIDATION";
      },
    ],
    [
      "conflict",
      (value: ReturnType<typeof fixture>) => {
        value.operations[0].status = "CONFLICT";
      },
    ],
    [
      "mapped identity",
      (value: ReturnType<typeof fixture>) => {
        value.expense!.serverId = "server";
        value.expense!.serverRevision = 1;
      },
    ],
    [
      "unauthorized Journey",
      (value: ReturnType<typeof fixture>) => {
        value.journeyAuthorized = false;
      },
    ],
    [
      "mismatched Journey",
      (value: ReturnType<typeof fixture>) => {
        value.operations[1].journeyId = "journey-b";
      },
    ],
    [
      "unrelated mutation",
      (value: ReturnType<typeof fixture>) => {
        value.operations[1].operationType = "LEDGER_DELETE_EXPENSE";
      },
    ],
    [
      "unattempted root",
      (value: ReturnType<typeof fixture>) => {
        value.operations[0].errorMessage = null;
        value.operations[0].updatedAt = value.operations[0].createdAt;
      },
    ],
  ])("protects %s with no executable evidence", (_name, mutate) => {
    const value = fixture();
    mutate(value);
    expect(inspectHistoricalExpenseRecovery(value)).toBeNull();
  });

  it("binds the plan to the complete current aggregate and immutable chain", () => {
    const value = fixture();
    const before = inspectHistoricalExpenseRecovery(value)?.inputDigest;
    value.expense!.title = "Changed after planning";
    const after = inspectHistoricalExpenseRecovery(value)?.inputDigest;
    expect(after).not.toBe(before);
    expect(ledgerExpenseToUpdateRequest(value.expense!)).toMatchObject({
      title: "Changed after planning",
      original: { minor: 100, currency: "USD", scale: 2 },
    });
  });
});

function fixture() {
  const expense = currentExpense();
  const original = {
    ...ledgerExpenseToUpdateRequest(expense),
    original: { minor: 200, currency: "CNY", scale: 2 },
  };
  return {
    accountId: "user-a",
    journeyAuthorized: true,
    expense,
    operations: [
      operation("create", "LEDGER_CREATE_EXPENSE", "FAILED", 0, original),
      operation(
        "update-1",
        "LEDGER_UPDATE_EXPENSE",
        "FAILED",
        1,
        ledgerExpenseToUpdateRequest(expense),
      ),
    ],
  };
}

function operation(
  id: string,
  operationType: string,
  status: string,
  hour: number,
  expense = ledgerExpenseToUpdateRequest(currentExpense()),
): HistoricalExpenseOperation {
  const createdAt = `2026-09-2${3 + Math.min(hour, 1)}T0${hour}:00:00Z`;
  return {
    id,
    journeyId: "journey-a",
    entityId: "expense-a",
    operationType,
    idempotencyKey: `${id}-key`,
    payloadJson: JSON.stringify({
      expenseId: "expense-a",
      revision: hour + 1,
      reason: null,
      expense,
      baseExpense: null,
    }),
    status,
    attemptCount: 0,
    failureCategory: null,
    errorCode: null,
    errorMessage: "SYNC_FAILED",
    lastAttemptAt: null,
    dependencyOperationId: null,
    createdAt,
    updatedAt: createdAt.replace(":00:00Z", ":01:00Z"),
  };
}

function currentExpense(): LedgerExpense {
  const memberId = "00000000-0000-4000-8000-000000000010";
  return {
    id: "expense-a",
    serverId: null,
    serverRevision: 0,
    journeyId: "journey-a",
    creatorMemberId: null,
    payerMemberId: memberId,
    title: "Current intent",
    description: null,
    category: "other",
    occurredAt: "2026-09-24T00:00:00Z",
    economicDate: "2026-09-24",
    original: { minor: 100, currency: "USD", scale: 2 },
    participants: [
      { memberId, displayNameSnapshot: "Member", householdIdSnapshot: null },
    ],
    splits: [
      {
        memberId,
        method: "EXACT",
        originalMinor: 100,
        settlementMinor: null,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: null,
    paymentRecords: [],
    status: "DRAFT",
    settlementParticipation: "INCLUDED",
    revision: 2,
    deletedAt: null,
    syncStatus: "FAILED",
    createdAt: "2026-09-23T00:00:00Z",
    updatedAt: "2026-09-24T00:00:00Z",
  };
}
