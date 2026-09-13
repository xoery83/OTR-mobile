import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";

import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { getSchemaVersion, type MigrationDatabase } from "@/data/db/migrationRunner";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { createLedgerSettlementTransport } from "@/data/sync/ledgerSettlementTransport";
import type { LedgerReadDatabase } from "@/data/repositories/ledgerReadRepository";
import { summarizeReporting, type ReportingRecord } from "@/domain/ledger/reporting";
import {
  buildSettlementAdjustmentVectors,
  buildSettlementPreview,
  type SettlementExpenseCandidate,
} from "@/domain/ledger/settlement";

type Check = { name: string; ok: boolean; detail: string };
const hostedJourneyId = "10000000-0000-4000-8000-000000009180";
const stage9JourneyId = process.env.EXPO_PUBLIC_OTR_STAGE9_JOURNEY_ID ?? "";

const reportingBase: ReportingRecord = {
  id: "included",
  title: "Synthetic meal",
  description: null,
  category: "food",
  occurredAt: "2026-09-13T00:00:00.000Z",
  payerMemberId: "a",
  payerName: "A",
  originalMinor: 100,
  originalCurrency: "NZD",
  businessStatus: "ACCEPTED",
  settlementParticipation: "INCLUDED",
  syncStatus: "SYNCED",
  settlementMinor: 100,
  settlementCurrency: "NZD",
  hasOpenConflict: false,
  hasReceipt: false,
  splits: [{ memberId: "b", memberName: "B", settlementMinor: 100 }],
};

const settlementBase: SettlementExpenseCandidate = {
  id: "included",
  revision: 1,
  occurredAt: "2026-09-13T00:00:00.000Z",
  businessStatus: "ACCEPTED",
  settlementParticipation: "INCLUDED",
  hasOpenConflict: false,
  payerMemberId: "a",
  original: { minor: 100, currency: "NZD", scale: 2 },
  participants: [{ memberId: "b", displayNameSnapshot: "B" }],
  splits: [
    {
      memberId: "b",
      method: "EXACT",
      originalMinor: 100,
      settlementMinor: 100,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: {
    id: "valuation-included",
    policy: "SAME_CURRENCY",
    original: { minor: 100, currency: "NZD", scale: 2 },
    settlement: { minor: 100, currency: "NZD", scale: 2 },
    rateSnapshotId: null,
    paymentRecordId: null,
    reason: null,
  },
};

function preview(expenses: SettlementExpenseCandidate[]) {
  return buildSettlementPreview({
    journeyId: "synthetic-journey",
    throughTimestamp: "2026-09-13T23:59:59.999Z",
    settlementCurrency: "NZD",
    settlementScale: 2,
    settingsRevision: 1,
    members: [
      { memberId: "a", displayNameSnapshot: "A" },
      { memberId: "b", displayNameSnapshot: "B" },
    ],
    expenses,
  });
}

function runChecks(): Check[] {
  const reporting = [
    reportingBase,
    { ...reportingBase, id: "excluded", settlementParticipation: "EXCLUDED" as const },
  ];
  const spending = summarizeReporting(reporting, "GROUP", "a");
  const excluded = {
    ...settlementBase,
    id: "excluded",
    settlementParticipation: "EXCLUDED" as const,
    valuation: { ...settlementBase.valuation!, id: "valuation-excluded" },
  };
  const root = preview([settlementBase, excluded]);
  const toggled = preview([
    settlementBase,
    { ...excluded, settlementParticipation: "INCLUDED" },
  ]);
  const adjustment = buildSettlementAdjustmentVectors({
    currency: "NZD",
    scale: 2,
    rootBalances: root.balances,
    priorDeltaVectors: [],
    currentBalances: toggled.balances,
  });
  return [
    {
      name: "Spending includes INCLUDED and EXCLUDED",
      ok: spending.totalMinor === 200 && spending.expenseCount === 2,
      detail: "Two ACCEPTED Expenses remain consumption facts.",
    },
    {
      name: "Settlement includes only INCLUDED",
      ok: root.inputs.length === 1 && root.inputs[0]?.expenseId === "included",
      detail: "The excluded participant split creates no debt.",
    },
    {
      name: "Exclusion is explainable and non-blocking",
      ok:
        root.state === "PREVIEW_READY" &&
        root.blockers.length === 0 &&
        root.exclusions[0]?.reason === "EXCLUDED_FROM_SETTLEMENT",
      detail: "Stable reason: EXCLUDED_FROM_SETTLEMENT.",
    },
    {
      name: "Toggle creates exact Adjustment delta",
      ok:
        adjustment.balances.find((item) => item.memberId === "a")?.deltaMinor === 100 &&
        adjustment.balances.find((item) => item.memberId === "b")?.deltaMinor === -100,
      detail: "EXCLUDED → INCLUDED adds only the omitted obligation vector.",
    },
    {
      name: "Settlement invariants remain zero-sum",
      ok:
        root.balances.reduce((sum, item) => sum + item.netMinor, 0) === 0 &&
        adjustment.balances.reduce((sum, item) => sum + item.deltaMinor, 0) === 0,
      detail: "Root and Adjustment vectors both net to zero.",
    },
  ];
}

export function useSettlementParticipationAcceptance(mode: string) {
  const [checks, setChecks] = useState(runChecks);

  useEffect(() => {
    void runHostedChecks(mode).then(async (hosted) => {
      const next = [...runChecks(), ...hosted];
      setChecks(next);
      if (stage9JourneyId)
        await FileSystem.writeAsStringAsync(
          `${FileSystem.documentDirectory}stage9-acceptance.json`,
          JSON.stringify({ mode, checks: next }),
        );
    });
  }, [mode]);
  return checks;
}

async function runHostedChecks(mode: string): Promise<Check[]> {
  if (stage9JourneyId) return runStage9Checks(mode);
  try {
    await signInToSupabaseDev(
      process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL ?? "",
      process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD ?? "",
    );
    const transport = createLedgerReadTransport();
    const repository = await getDefaultLedgerReadRepository();
    const bootstrap = await transport.bootstrap(hostedJourneyId);
    await repository.applyBootstrap(bootstrap);
    const bootstrapCounts = await participationCounts();
    const pull = await transport.pull(hostedJourneyId, null);
    await repository.applyChanges(hostedJourneyId, pull);
    const pullCounts = await participationCounts();
    const expected =
      bootstrap.expenses.length === 3 &&
      bootstrap.expenses.filter(
        (expense) => expense.settlementParticipation === "INCLUDED",
      ).length === 2 &&
      bootstrap.expenses.filter(
        (expense) => expense.settlementParticipation === "EXCLUDED",
      ).length === 1;
    return [
      {
        name: "Hosted Dev bootstrap preserves participation",
        ok: expected && bootstrapCounts.included === 2 && bootstrapCounts.excluded === 1,
        detail: `${bootstrapCounts.included} INCLUDED · ${bootstrapCounts.excluded} EXCLUDED`,
      },
      {
        name: "Hosted Dev pull preserves participation",
        ok:
          pull.changes.length > 0 &&
          pullCounts.included === 2 &&
          pullCounts.excluded === 1,
        detail: `${pull.changes.length} changes · ${pullCounts.included}/${pullCounts.excluded}`,
      },
    ];
  } catch (error) {
    return [
      {
        name: "Hosted Dev Mobile compatibility",
        ok: false,
        detail: error instanceof Error ? error.message : "Unknown failure",
      },
    ];
  }
}

async function runStage9Checks(mode: string): Promise<Check[]> {
  try {
    if (mode === "inspect") return inspectStage9Sqlite();
    await signInToSupabaseDev(
      process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL ?? "",
      process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD ?? "",
    );
    const transport = createLedgerReadTransport();
    const repository = await getDefaultLedgerReadRepository();
    const bootstrap = await transport.bootstrap(stage9JourneyId);
    const included = bootstrap.expenses.filter(
      (expense) => expense.settlementParticipation === "INCLUDED",
    );
    const excluded = bootstrap.expenses.filter(
      (expense) => expense.settlementParticipation === "EXCLUDED",
    );
    await repository.applyBootstrap(bootstrap);
    const cursor = (await repository.getCursor(stage9JourneyId))?.cursor ?? null;
    const pull = await transport.pull(stage9JourneyId, cursor);
    await repository.applyChanges(stage9JourneyId, pull);

    const reporting = await getDefaultLedgerReportingRepository();
    const actor = await reporting.getActorMemberId(stage9JourneyId);
    if (!actor?.memberId) throw new Error("Stage 9 actor context is missing.");
    const query = {
      journeyId: stage9JourneyId,
      memberId: actor.memberId,
      scope: "GROUP" as const,
    };
    const [spending, search, summary, analysis, serverAnalysis, myLedger, preview] =
      await Promise.all([
        reporting.listExpenses(query, 200),
        reporting.listExpenses({ ...query, query: "Imported" }, 200),
        reporting.summarize(query),
        reporting.analyze(query, "CATEGORY"),
        transport.analysis(stage9JourneyId, "GROUP", "CATEGORY"),
        transport.myLedger("ALL", { from: null, to: null }),
        createLedgerSettlementTransport().preview(
          stage9JourneyId,
          "9999-12-31T23:59:59.999Z",
        ),
      ]);
    await repository.cacheMyLedger(myLedger);
    const cachedMyLedger = (await repository.listMyLedgerSummaries("ALL")).find(
      (journey) => journey.journeyId === stage9JourneyId,
    );
    const serverMyLedger = myLedger.journeys.find(
      (journey) => journey.journeyId === stage9JourneyId,
    );
    const local = await stage9SqliteState();
    return [
      {
        name: "Europe Replay bootstrap contract",
        ok:
          bootstrap.members.length === 8 &&
          bootstrap.expenses.length === 126 &&
          included.length === 68 &&
          excluded.length === 58 &&
          bootstrap.expenses.reduce(
            (sum, expense) => sum + expense.participants.length,
            0,
          ) === 531 &&
          bootstrap.expenses.reduce((sum, expense) => sum + expense.splits.length, 0) ===
            531 &&
          bootstrap.expenses.filter((expense) => expense.valuation).length === 126 &&
          (bootstrap.reviewFindings?.length ?? 0) === 0,
        detail: "1/8/126 · 68 INCLUDED · 58 EXCLUDED · 531/531 · 126 valuations",
      },
      {
        name: "Spending, Search and Analysis include all accepted Expenses",
        ok:
          spending.length === 126 &&
          search.length === 126 &&
          summary.expenseCount === 126 &&
          analysis.reduce((sum, bucket) => sum + bucket.expenseCount, 0) === 126 &&
          serverAnalysis.summary.expenseCount === 126,
        detail: "126 Spending · 126 Search · 126 local/server Analysis",
      },
      {
        name: "Settlement uses INCLUDED only",
        ok:
          preview.state === "PREVIEW_READY" &&
          preview.blockers.length === 0 &&
          preview.inputs.length === 68 &&
          preview.exclusions.length === 58 &&
          preview.exclusions.every(
            (item) => item.reason === "EXCLUDED_FROM_SETTLEMENT",
          ) &&
          preview.balances.reduce((sum, balance) => sum + balance.netMinor, 0) === 0,
        detail: "68 inputs · 58 excluded · zero-sum balance vector",
      },
      {
        name: "My Ledger server/cache parity",
        ok:
          Boolean(serverMyLedger && cachedMyLedger) &&
          serverMyLedger?.mySpendMinor === cachedMyLedger?.mySpendMinor &&
          serverMyLedger?.paidMinor === cachedMyLedger?.paidMinor &&
          serverMyLedger?.positionMinor === cachedMyLedger?.positionMinor &&
          serverMyLedger?.unvaluedCount === 0 &&
          serverMyLedger?.conflictCount === 0,
        detail: "normal product response and SQLite cache agree",
      },
      {
        name: "Incremental pull is duplicate-free",
        ok:
          pull.changes.length === 0 &&
          local.expenses === 126 &&
          local.distinctExpenses === 126 &&
          local.participants === 531 &&
          local.splits === 531,
        detail: "0 changes · 126 unique Expenses · 531/531",
      },
      {
        name: "SQLite v17 hydration and privacy shape",
        ok:
          local.integrity === "ok" &&
          local.schemaVersion === 17 &&
          local.members === 8 &&
          local.included === 68 &&
          local.excluded === 58 &&
          local.valuations === 126 &&
          local.rateSnapshotReferences === 126 &&
          local.reviewFindings === 0 &&
          local.paymentRecords === 0 &&
          local.auditEvents === 0,
        detail: "schema 17 · 68/58 · no findings/payment/audit rows",
      },
    ];
  } catch (error) {
    return [
      {
        name: "Europe Replay normal product path",
        ok: false,
        detail: error instanceof Error ? error.message : "Unknown failure",
      },
    ];
  }
}

async function inspectStage9Sqlite(): Promise<Check[]> {
  try {
    const state = await stage9SqliteState();
    return [
      {
        name: "Europe Replay offline cached cold start",
        ok:
          state.integrity === "ok" &&
          state.schemaVersion === 17 &&
          state.expenses === 126 &&
          state.distinctExpenses === 126 &&
          state.included === 68 &&
          state.excluded === 58 &&
          state.participants === 531 &&
          state.splits === 531 &&
          state.valuations === 126 &&
          state.rateSnapshotReferences === 126,
        detail: "SQLite v17 · 126 unique · 68/58 · 531/531 · 126 valuation/rate refs",
      },
    ];
  } catch (error) {
    return [
      {
        name: "Europe Replay offline cached cold start",
        ok: false,
        detail: error instanceof Error ? error.message : "Unknown failure",
      },
    ];
  }
}

async function stage9SqliteState() {
  const database = await openDatabase();
  const one = async (sql: string) =>
    (
      await (database as unknown as LedgerReadDatabase).getFirstAsync<{ count: number }>(
        sql,
        stage9JourneyId,
      )
    )?.count ?? 0;
  const participation = await database.getAllAsync<{
    settlementParticipation: "INCLUDED" | "EXCLUDED";
    count: number;
  }>(
    `SELECT settlement_participation AS settlementParticipation, COUNT(*) AS count
       FROM ledger_expenses WHERE journey_id = ? GROUP BY settlement_participation`,
    stage9JourneyId,
  );
  const integrity = await (database as unknown as LedgerReadDatabase).getFirstAsync<{
    integrity_check: string;
  }>("PRAGMA integrity_check");
  return {
    integrity: integrity?.integrity_check,
    schemaVersion: await getSchemaVersion(database as unknown as MigrationDatabase),
    members: await one(
      "SELECT COUNT(*) AS count FROM ledger_members WHERE journey_id = ?",
    ),
    expenses: await one(
      "SELECT COUNT(*) AS count FROM ledger_expenses WHERE journey_id = ?",
    ),
    distinctExpenses: await one(
      "SELECT COUNT(DISTINCT id) AS count FROM ledger_expenses WHERE journey_id = ?",
    ),
    included:
      participation.find((item) => item.settlementParticipation === "INCLUDED")?.count ??
      0,
    excluded:
      participation.find((item) => item.settlementParticipation === "EXCLUDED")?.count ??
      0,
    participants: await one(
      `SELECT COUNT(*) AS count FROM ledger_expense_participants p
       JOIN ledger_expenses e ON e.id = p.expense_id WHERE e.journey_id = ?`,
    ),
    splits: await one(
      `SELECT COUNT(*) AS count FROM ledger_expense_splits s
       JOIN ledger_expenses e ON e.id = s.expense_id WHERE e.journey_id = ?`,
    ),
    valuations: await one(
      `SELECT COUNT(*) AS count FROM ledger_valuation_snapshots v
       JOIN ledger_expenses e ON e.id = v.expense_id
       WHERE e.journey_id = ? AND v.is_active = 1`,
    ),
    rateSnapshotReferences: await one(
      `SELECT COUNT(DISTINCT v.rate_snapshot_id) AS count
       FROM ledger_valuation_snapshots v
       JOIN ledger_expenses e ON e.id = v.expense_id
       WHERE e.journey_id = ? AND v.is_active = 1`,
    ),
    reviewFindings: await one(
      "SELECT COUNT(*) AS count FROM ledger_review_findings WHERE journey_id = ?",
    ),
    paymentRecords: await one(
      `SELECT COUNT(*) AS count FROM ledger_payment_records p
       JOIN ledger_expenses e ON e.id = p.expense_id WHERE e.journey_id = ?`,
    ),
    auditEvents: await one(
      `SELECT COUNT(*) AS count FROM ledger_expense_audit_events a
       JOIN ledger_expenses e ON e.id = a.expense_id WHERE e.journey_id = ?`,
    ),
  };
}

async function participationCounts() {
  const database = await openDatabase();
  const rows = await database.getAllAsync<{
    settlementParticipation: "INCLUDED" | "EXCLUDED";
    count: number;
  }>(
    `SELECT settlement_participation AS settlementParticipation, COUNT(*) AS count
     FROM ledger_expenses WHERE journey_id = ? GROUP BY settlement_participation`,
    hostedJourneyId,
  );
  return {
    included: rows.find((row) => row.settlementParticipation === "INCLUDED")?.count ?? 0,
    excluded: rows.find((row) => row.settlementParticipation === "EXCLUDED")?.count ?? 0,
  };
}
