import { expect, it } from "vitest";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import {
  settlementRateCandidates,
  rateAcceptanceMessage,
} from "./settlementRateCandidates";

it("offers only unchanged eligible dated values and preserves the actual rate, not a ratio of rounded money", () => {
  const expense = {
    id: "e",
    journeyId: "j",
    revision: 4,
    title: "AON",
    status: "RATE_REQUIRED",
    syncStatus: "SYNCED",
    valuation: null,
    settlementParticipation: "INCLUDED",
    economicDate: "2026-09-28",
    original: { minor: 685, currency: "JPY", scale: 0 },
  } as LedgerExpense;
  const estimate = {
    money: { minor: 767, currency: "NZD", scale: 2 },
    quoteId: null,
    exactDate: false,
    referenceDate: "2026-09-25",
    decimalRate: "0.01119",
  };
  const estimates = new Map([[expense.id, estimate]]);
  expect(settlementRateCandidates([expense], estimates)).toMatchObject([
    {
      revision: 4,
      decimalRate: "0.01119",
      referenceDate: "2026-09-25",
      settlement: { minor: 767 },
    },
  ]);
  for (const patch of [
    { syncStatus: "PENDING_UPDATE" },
    { settlementParticipation: "EXCLUDED" },
    { economicDate: null },
    { status: "ACCEPTED" },
  ]) {
    expect(
      settlementRateCandidates([{ ...expense, ...patch } as LedgerExpense], estimates),
    ).toEqual([]);
  }
  expect(
    settlementRateCandidates(
      [expense],
      new Map([[expense.id, { ...estimate, money: { ...estimate.money, minor: 768 } }]]),
    ),
  ).toEqual([]);
  expect(
    settlementRateCandidates(
      [expense],
      new Map([[expense.id, { ...estimate, referenceDate: "2026-09-28" }]]),
    ),
  ).toEqual([]);
});

it("keeps explicit operation feedback in business language", () => {
  for (const state of [
    "PENDING_SYNC",
    "SERVER_CONFIRMED",
    "CONFLICT_REQUIRES_ACTION",
    "RETRYABLE_FAILURE",
    "TERMINAL_FAILURE",
  ] as const) {
    const message = rateAcceptanceMessage({
      expenseId: "e",
      title: "Meal",
      operationId: "op",
      state,
      operationResult: null,
    });
    expect(message).not.toMatch(/revision|canonical|CAS|queue|operationId|sync engine/i);
    expect(message).toBeTruthy();
  }
});

it("explains confirmed Settlement protection without offering a generic retry", () => {
  expect(
    rateAcceptanceMessage({
      expenseId: "e",
      title: "Meal",
      operationId: "op",
      state: "CONFLICT_REQUIRES_ACTION",
      operationResult: {
        error: { code: "SETTLEMENT_INPUT_STALE", message: "Protected" },
      } as never,
    }),
  ).toContain("confirmed Settlement");
});

it("does not call a discarded or replaced rate choice applied", () => {
  for (const disposition of ["KEPT_SERVER", "SUPERSEDED"] as const) {
    const message = rateAcceptanceMessage({
      expenseId: "e",
      title: "Meal",
      operationId: "op",
      state: "SERVER_CONFIRMED",
      operationResult: { disposition } as never,
    });
    expect(message).not.toContain("Agreed rate saved");
  }
});

it("presents a verified historical no-op as a business latest-value choice", async () => {
  const { conflictChoices } = await import("./expenseConflictPresentation");
  const conflict = {
    commandType: "UPDATE",
    submittedIntent: { type: "UPDATE", patch: {} },
    reason: "VERIFIED_LEGACY_EQUIVALENT",
  } as Parameters<typeof conflictChoices>[0];
  expect(conflictChoices(conflict)).toEqual([
    { choice: "ACCEPT_EQUIVALENT", label: "Use latest value" },
  ]);
});
