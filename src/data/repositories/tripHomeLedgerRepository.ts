import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import type { AnalysisExpense } from "@/domain/ledger/spendingAnalysis";
import type { ReportingAggregate } from "@/domain/ledger/reporting";
import {
  createLedgerReportingRepository,
  type LedgerReportingDatabase,
  type LedgerJourneyOption,
} from "./ledgerReportingRepository";

export type TripHomeLedgerSnapshot = {
  context: AccountRequestContext;
  journey: LedgerJourneyOption;
  memberId: string;
  group: ReportingAggregate;
  mine: ReportingAggregate;
  expenseCount: number;
  categories: { category: string; count: number }[];
  recent: AnalysisExpense[];
};

export function createTripHomeLedgerRepository(
  database: LedgerReportingDatabase,
  getActiveUserId: () => Promise<string>,
) {
  const reporting = createLedgerReportingRepository(database, getActiveUserId);
  return {
    async read(tripId: string): Promise<TripHomeLedgerSnapshot | null> {
      const context = await captureAccountRequestContext(tripId, getActiveUserId);
      return withAccountApplyGate(async () => {
        let snapshot: TripHomeLedgerSnapshot | null = null;
        await database.withTransactionAsync(async () => {
          await assertAccountRequestContext(context, getActiveUserId);
          // Ledger's server journey PK references trips(id). UUID equality alone grants nothing.
          const journey = (await reporting.listJourneys()).find(
            (item) => item.journeyId === tripId && item.hasActor,
          );
          if (journey) {
            const memberId = (await reporting.getActorMemberId(tripId))?.memberId;
            if (memberId) {
              const dataset = await reporting.loadSpendingAnalysisProjection(
                tripId,
                memberId,
              );
              if (dataset.members.some((member) => member.id === memberId)) {
                const query = { journeyId: tripId, memberId };
                const group = await reporting.summarize({ ...query, scope: "GROUP" });
                const mine = await reporting.summarize({ ...query, scope: "MINE" });
                const expenses = [
                  ...new Map(dataset.expenses.map((item) => [item.id, item])).values(),
                ];
                const counts = new Map<string, number>();
                for (const expense of expenses)
                  counts.set(expense.category, (counts.get(expense.category) ?? 0) + 1);
                snapshot = {
                  context,
                  journey,
                  memberId,
                  group,
                  mine,
                  expenseCount: expenses.length,
                  categories: [...counts]
                    .map(([category, count]) => ({ category, count }))
                    .sort(
                      (a, b) => b.count - a.count || a.category.localeCompare(b.category),
                    ),
                  recent: expenses
                    .filter(
                      (item) =>
                        item.createdAt && Number.isFinite(Date.parse(item.createdAt)),
                    )
                    .sort(
                      (a, b) =>
                        Date.parse(b.createdAt!) - Date.parse(a.createdAt!) ||
                        a.id.localeCompare(b.id),
                    )
                    .slice(0, 3),
                };
              }
            }
          }
          await assertAccountRequestContext(context, getActiveUserId);
        });
        return snapshot;
      });
    },
  };
}

export async function readTripHomeLedgerRepository() {
  return createTripHomeLedgerRepository(
    await readInitializedDatabase(),
    requireActiveUserId,
  );
}
