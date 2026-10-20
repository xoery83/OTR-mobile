import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { LedgerJourneyOption } from "@/data/repositories/ledgerReportingRepository";
import { loadMyLedger } from "./loadMyLedger";
import type { PersonalSpendingRow } from "./myLedgerAnalytics";

const state = vi.hoisted(() => ({
  journeys: [] as LedgerJourneyOption[],
  summaries: [] as {
    journeyId: string;
    title: string;
    startDate: string;
    endDate: string;
    currency: string;
    scale: number;
  }[],
  expenses: {} as Record<string, LedgerExpense[]>,
  facts: [] as Extract<PersonalSpendingRow, { fact: unknown }>["fact"][],
  hasNarrowSnapshot: false,
  calls: [] as string[],
}));

vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => ({
    listJourneys: async () => state.journeys,
    listMyLedger: async () => state.summaries,
    listMyLedgerSpendingFacts: async () => state.facts,
    hasMyLedgerSpendingSnapshot: async () => state.hasNarrowSnapshot,
    getPreferences: async () => ({ defaultCurrency: "NZD", debugMode: false }),
    getActorMemberId: async (id: string) => ({
      memberId: state.journeys.some((journey) => journey.journeyId === id) ? "me" : null,
    }),
    countExpenses: async () => 0,
    listExpenses: async () => [],
  }),
}));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({
  getDefaultLedgerExpenseRepository: async () => ({
    listExpensesForJourney: async (id: string) => {
      state.calls.push(id);
      return state.expenses[id] ?? [];
    },
    listRateQuotes: async () => [],
  }),
}));
vi.mock("@/data/repositories/defaultLedgerSettlementRepository", () => ({
  getDefaultLedgerSettlementRepository: async () => ({
    listFinalized: async () => [],
    hasPendingFinancialOperations: async () => false,
  }),
}));
vi.mock("@/data/repositories/defaultLedgerFxSnapshotRepository", () => ({
  getDefaultLedgerFxSnapshotRepository: async () => ({
    list: async () => ({
      snapshots: [
        {
          referenceDate: "2026-07-01",
          rates: { EUR: "1", NZD: "2" },
          observedAt: "2026-07-01T00:00:00Z",
          expiresAt: "2026-07-02T00:00:00Z",
        },
      ],
    }),
  }),
}));
vi.mock("./loadEstimatedSettlement", () => ({
  loadEstimatedSettlement: async (id: string) => ({
    balances: [
      {
        memberId: "me",
        minor: id === "nz" ? 125 : id === "eu" ? -84 : 0,
        paidMinor: 0,
        owedMinor: 0,
        currency: id === "nz" ? "NZD" : id === "eu" ? "EUR" : "ISK",
        scale: id === "zero" ? 0 : 2,
      },
    ],
    inputs: [],
    blockers: [],
  }),
}));

function journey(id: string, currency: string): LedgerJourneyOption {
  return {
    journeyId: id,
    title: id,
    startDate: "2026-07-01",
    endDate: "2026-07-10",
    settlementCurrency: currency,
    settlementScale: 2,
    hasActor: true,
    memberCount: 2,
  };
}

function expense(journeyId: string, currency: string): LedgerExpense {
  return {
    id: journeyId,
    journeyId,
    category: "Food",
    occurredAt: "2026-07-02T00:00:00Z",
    economicDate: "2026-07-02",
    original: { minor: 400, currency, scale: 2 },
    splits: [{ memberId: "me", originalMinor: 100 }],
    status: "ACCEPTED",
    deletedAt: null,
  } as LedgerExpense;
}

beforeEach(() => {
  state.journeys = [journey("nz", "NZD"), journey("eu", "EUR")];
  state.expenses = { nz: [expense("nz", "NZD")], eu: [expense("eu", "EUR")] };
  state.summaries = [];
  state.facts = [];
  state.hasNarrowSnapshot = false;
  state.calls = [];
});

describe("My Ledger local loading", () => {
  it("changes analytical spending currency without changing Journey balances", async () => {
    const nzd = await loadMyLedger("YEAR", "NZD", "SETTLEMENTS", new Date("2026-09-25"));
    const eur = await loadMyLedger("YEAR", "EUR", "SETTLEMENTS", new Date("2026-09-25"));
    expect(nzd.spending.totalMinor).toBe(300);
    expect(eur.spending.totalMinor).toBe(150);
    expect(
      nzd.settlements.map(({ projection }) => [
        projection?.balanceMinor,
        projection?.currency,
      ]),
    ).toEqual([
      [125, "NZD"],
      [-84, "EUR"],
    ]);
    expect(
      eur.settlements.map(({ projection }) => [
        projection?.balanceMinor,
        projection?.currency,
      ]),
    ).toEqual([
      [125, "NZD"],
      [-84, "EUR"],
    ]);
  });

  it("loads Spending without settlement work and stays within accessible Journeys", async () => {
    state.journeys = [journey("eu", "EUR")];
    const result = await loadMyLedger("ALL", null, "SPENDING", new Date("2026-09-25"));
    expect(result.settlements).toEqual([]);
    expect(result.options).toEqual(["EUR"]);
    expect(state.calls).toEqual(["eu"]);
    expect(result.spending.totalMinor).toBe(100);
  });

  it("preserves a balanced Journey at zero in its own currency", async () => {
    state.journeys = [{ ...journey("zero", "ISK"), settlementScale: 0 }];
    state.expenses = {};
    const result = await loadMyLedger(
      "YEAR",
      "ISK",
      "SETTLEMENTS",
      new Date("2026-09-25"),
    );
    expect(result.settlements[0].projection).toMatchObject({
      balanceMinor: 0,
      currency: "ISK",
      scale: 0,
    });
  });

  it("keeps an authorized summary-only Journey visible without inventing spending or balance", async () => {
    state.journeys = [];
    state.summaries = [
      {
        journeyId: "saved",
        title: "Saved",
        startDate: "2026-07-01",
        endDate: "2026-07-10",
        currency: "EUR",
        scale: 2,
      },
    ];
    const result = await loadMyLedger(
      "YEAR",
      null,
      "SETTLEMENTS",
      new Date("2026-09-25"),
    );
    expect(result.options).toEqual(["EUR"]);
    expect(result.incompleteJourneyCount).toBe(1);
    expect(result.spending.totalMinor).toBe(0);
    expect(result.settlements[0]).toMatchObject({
      status: "Saved Journey data unavailable",
      projection: null,
    });
  });

  it("renders economic-date Spending offline from narrow facts without making Settlement available", async () => {
    state.journeys = [journey("nz", "NZD")];
    state.expenses = { nz: [] };
    state.summaries = [
      {
        journeyId: "saved",
        title: "Saved",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        currency: "EUR",
        scale: 2,
      },
    ];
    state.hasNarrowSnapshot = true;
    state.facts = [
      {
        expenseId: "remote",
        revision: 3,
        journeyId: "saved",
        category: "food",
        economicDate: "2026-07-02",
        occurredAt: "2025-12-31T23:00:00Z",
        status: "ACCEPTED",
        hasOpenConflict: false,
        originalCurrency: "EUR",
        originalScale: 2,
        personalSplitMinor: 50,
      },
    ];
    const result = await loadMyLedger(
      "YEAR",
      "NZD",
      "SETTLEMENTS",
      new Date("2026-09-25"),
    );
    expect(result.spending.totalMinor).toBe(100);
    expect(result.incompleteJourneyCount).toBe(0);
    expect(
      result.settlements.find(({ journey }) => journey.journeyId === "saved"),
    ).toMatchObject({
      projection: null,
      status: "Saved Journey data unavailable",
    });
  });

  it("lets a pending full local Expense override its remote narrow fact", async () => {
    state.journeys = [journey("nz", "NZD")];
    state.expenses = {
      nz: [
        {
          ...expense("nz", "NZD"),
          id: "local",
          serverId: "remote",
          syncStatus: "PENDING_UPDATE",
        },
      ],
    };
    state.facts = [
      {
        expenseId: "remote",
        revision: 3,
        journeyId: "nz",
        category: "food",
        economicDate: "2026-07-02",
        occurredAt: "2026-07-02T00:00:00Z",
        status: "ACCEPTED",
        hasOpenConflict: false,
        originalCurrency: "NZD",
        originalScale: 2,
        personalSplitMinor: 999,
      },
    ];
    const result = await loadMyLedger("YEAR", "NZD", "SPENDING", new Date("2026-09-25"));
    expect(result.spending.totalMinor).toBe(100);
  });
});
