import type {
  MyLedgerPeriod,
  MyLedgerResponse,
} from "../../src/data/api/ledgerReadContracts";
import { myLedgerResponseSchema } from "../../src/data/api/ledgerReadContracts";
import {
  matchesReportingFilters,
  summarizeReporting,
  type ReportingFilters,
  type ReportingRecord,
} from "../../src/domain/ledger/reporting";

export type LightweightSnapshot = {
  linkedJourneyCount: number;
  journeys: {
    journeyId: string;
    memberId: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    currency: string;
    scale: number;
    updatedAt: string;
  }[];
  expenses: {
    expenseId: string;
    revision: number;
    journeyId: string;
    category: string;
    economicDate: string | null;
    occurredAt: string;
    status: string;
    settlementParticipation: "INCLUDED" | "EXCLUDED";
    payerMemberId: string;
    originalCurrency: string;
    originalScale: number;
    personalSplitMinor: number | null;
    personalSettlementMinor: number | null;
    settlementMinor: number | null;
    hasOpenConflict: boolean;
  }[];
};

export function summarizeMyLedgerSnapshot(
  snapshot: LightweightSnapshot,
  period: MyLedgerPeriod,
  from: string | null,
  to: string | null,
  serverTime: string,
): MyLedgerResponse {
  const filters: ReportingFilters = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const byJourney = new Map<string, LightweightSnapshot["expenses"]>();
  for (const expense of snapshot.expenses) {
    const rows = byJourney.get(expense.journeyId) ?? [];
    rows.push(expense);
    byJourney.set(expense.journeyId, rows);
  }
  const journeys = snapshot.journeys.map((journey) => {
    const records: ReportingRecord[] = (byJourney.get(journey.journeyId) ?? []).map(
      (expense) => ({
        id: expense.expenseId,
        title: "",
        description: null,
        category: expense.category,
        occurredAt: expense.occurredAt,
        payerMemberId: expense.payerMemberId,
        payerName: "",
        originalMinor: 0,
        originalCurrency: expense.originalCurrency,
        businessStatus: expense.status,
        settlementParticipation: expense.settlementParticipation,
        syncStatus: "SYNCED",
        settlementMinor: expense.settlementMinor,
        settlementCurrency: journey.currency,
        hasOpenConflict: expense.hasOpenConflict,
        hasReceipt: false,
        splits:
          expense.personalSplitMinor === null
            ? []
            : [
                {
                  memberId: journey.memberId,
                  memberName: "",
                  settlementMinor: expense.personalSettlementMinor,
                },
              ],
      }),
    );
    const mine = summarizeReporting(records, "MINE", journey.memberId, filters);
    const included = summarizeReporting(
      records.filter((record) => record.settlementParticipation === "INCLUDED"),
      "MINE",
      journey.memberId,
      filters,
    );
    const paidMinor = records
      .filter(
        (record) =>
          matchesReportingFilters(record, filters) &&
          record.businessStatus === "ACCEPTED" &&
          record.settlementParticipation === "INCLUDED" &&
          record.settlementMinor !== null &&
          !record.hasOpenConflict &&
          record.payerMemberId === journey.memberId,
      )
      .reduce((total, record) => total + record.settlementMinor!, 0);
    return {
      journeyId: journey.journeyId,
      title: journey.title,
      startDate: journey.startDate,
      endDate: journey.endDate,
      currency: journey.currency,
      scale: journey.scale,
      updatedAt: journey.updatedAt,
      mySpendMinor: mine.totalMinor,
      paidMinor,
      positionMinor: paidMinor - included.totalMinor,
      unvaluedCount: mine.unresolvedRateCount,
      conflictCount: mine.openConflictCount,
    };
  });
  const spendingFacts = snapshot.expenses.flatMap((expense) => {
    if (expense.personalSplitMinor === null || expense.status === "DELETED") return [];
    const date = expense.economicDate ?? expense.occurredAt.slice(0, 10);
    if (period === "YEAR" && from) {
      const year = new Date(new Date(from).getTime() + 86_400_000).getUTCFullYear();
      if (!date.startsWith(`${year}-`)) return [];
    }
    if (
      period === "30D" &&
      from &&
      to &&
      (date < from.slice(0, 10) || date >= to.slice(0, 10))
    )
      return [];
    return [
      {
        expenseId: expense.expenseId,
        revision: expense.revision,
        journeyId: expense.journeyId,
        category: expense.category,
        economicDate: expense.economicDate,
        occurredAt: expense.occurredAt,
        status: expense.status as "DRAFT" | "ACCEPTED" | "RATE_REQUIRED" | "DELETED",
        hasOpenConflict: expense.hasOpenConflict,
        originalCurrency: expense.originalCurrency,
        originalScale: expense.originalScale,
        personalSplitMinor: expense.personalSplitMinor,
      },
    ];
  });
  return myLedgerResponseSchema.parse({
    period,
    from,
    to,
    journeys,
    spendingFacts,
    serverTime,
  });
}
