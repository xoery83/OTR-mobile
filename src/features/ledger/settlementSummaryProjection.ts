import { localExpensesChangesFromFinal } from "./settlementSections";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { balancesFromSettlementInputs } from "@/domain/ledger/settlement";
import type { Stage7Preview } from "@/hooks/useStage7Settlement";

type FinalizedSettlement = Parameters<typeof localExpensesChangesFromFinal>[1];
type LocalExpense = Parameters<typeof localExpensesChangesFromFinal>[0][number];
type CurrentPreview = {
  sourceAsOf: string;
  sourceFingerprintPolicy: "SETTLEMENT_SOURCE_V1";
  sourceFingerprint: string;
  balances: {
    memberId: string;
    displayNameSnapshot?: string;
    netMinor: number;
    paidMinor: number;
    owedMinor: number;
    currency: string;
    scale: number;
    transferredMinor?: 0;
  }[];
  confirmedSettlement: {
    id: string;
    inputDigest: string;
    finalizedAt: string;
    lineageSequence: number;
    balances: {
      memberId: string;
      displayNameSnapshot?: string;
      netMinor: number;
      currency?: string;
      scale?: number;
      paidMinor?: number;
      owedMinor?: number;
      transferredMinor?: 0;
    }[];
  } | null;
  confirmationDiff: {
    expenseId: string;
    change: "ADDED" | "CHANGED" | "REMOVED";
  }[];
} & Record<string, unknown>;

type LocalPreview = {
  balances: {
    memberId: string;
    minor: number;
    paidMinor: number;
    owedMinor: number;
    currency: string;
    scale: number;
  }[];
  inputs: { expense: LocalExpense }[];
};

export type SettlementSummaryProjection = {
  projectionId: string;
  freshness: "SAVED" | "CURRENT" | "LOCAL_PENDING";
  sourceAsOf: string | null;
  sourceFingerprintPolicy: "SETTLEMENT_SOURCE_V1" | null;
  sourceFingerprint: string | null;
  balanceMinor: number;
  paidMinor: number;
  shareMinor: number;
  currency: string;
  scale: number;
  confirmedSettlement: {
    id: string;
    inputDigest: string;
    finalizedAt: string;
    lineageSequence: number;
    balanceMinor: number;
  } | null;
  confirmationDiff: {
    expenseId: string;
    change: "ADDED" | "CHANGED" | "REMOVED";
  }[];
};

type SharedProjection = {
  accountGeneration: number;
  journeyId: string;
  actorMemberId: string;
  isOrganizer: boolean;
  projection: SettlementSummaryProjection;
  preview: Stage7Preview | null;
  titles: Record<string, { title: string; localId: string }>;
};

let sharedProjection: SharedProjection | null = null;
const confirmedHeads = new Map<string, { accountGeneration: number; headId: string }>();

export function markSettlementConfirmedHead(journeyId: string, headId: string) {
  confirmedHeads.set(journeyId, { accountGeneration: getAccountGeneration(), headId });
  clearSharedSettlementProjection(journeyId);
}

export function isSettlementConfirmationRefreshing(
  journeyId: string,
  projection: SettlementSummaryProjection | null,
) {
  const pending = confirmedHeads.get(journeyId);
  return (
    pending?.accountGeneration === getAccountGeneration() &&
    projection?.confirmedSettlement?.id !== pending.headId
  );
}

export function settlementProjectionAfterConfirmation(
  journeyId: string,
  projection: SettlementSummaryProjection | null,
) {
  if (!projection) return null;
  const pending = confirmedHeads.get(journeyId);
  if (!pending || pending.accountGeneration !== getAccountGeneration()) return projection;
  if (projection.confirmedSettlement?.id === pending.headId) return projection;
  return {
    ...projection,
    freshness: "SAVED" as const,
    confirmedSettlement: null,
    confirmationDiff: [],
  };
}

export function readSharedSettlementProjection(journeyId: string) {
  return sharedProjection?.accountGeneration === getAccountGeneration() &&
    sharedProjection.journeyId === journeyId
    ? sharedProjection
    : null;
}

export function readSavedSettlementProjection(journeyId: string) {
  const cached = readSharedSettlementProjection(journeyId)?.projection;
  return cached
    ? settlementProjectionAfterConfirmation(journeyId, {
        ...cached,
        freshness: cached.freshness === "CURRENT" ? "SAVED" : cached.freshness,
      })
    : null;
}

export function clearSharedSettlementProjection(journeyId: string) {
  if (readSharedSettlementProjection(journeyId)) sharedProjection = null;
}

export function shouldPublishSavedSettlementProjection(
  existing: SettlementSummaryProjection | null | undefined,
  saved: SettlementSummaryProjection | null,
  canonicalFingerprint: string | null,
) {
  if (!existing) return true;
  if (existing.freshness === "CURRENT")
    return (
      canonicalFingerprint !== existing.sourceFingerprint ||
      existing.confirmedSettlement?.id !== saved?.confirmedSettlement?.id
    );
  return (
    existing.projectionId !== saved?.projectionId ||
    existing.freshness !== saved?.freshness ||
    existing.confirmedSettlement?.id !== saved?.confirmedSettlement?.id
  );
}

export function rememberSettlementProjection(
  journeyId: string,
  actorMemberId: string,
  isOrganizer: boolean,
  projection: SettlementSummaryProjection,
  preview: Stage7Preview | null,
) {
  const previous = readSharedSettlementProjection(journeyId);
  sharedProjection = {
    accountGeneration: getAccountGeneration(),
    journeyId,
    actorMemberId,
    isOrganizer,
    projection: settlementProjectionAfterConfirmation(journeyId, projection)!,
    preview,
    titles: previous?.titles ?? {},
  };
}

export function rememberSettlementExpenseTitles(
  journeyId: string,
  expenses: { id: string; serverId: string | null; title: string }[],
) {
  const shared = readSharedSettlementProjection(journeyId);
  if (!shared) return;
  shared.titles = Object.fromEntries(
    expenses.flatMap((expense) =>
      [expense.id, expense.serverId]
        .filter((id): id is string => Boolean(id))
        .map((id) => [id, { title: expense.title, localId: expense.id }]),
    ),
  );
}

export function adjustmentMatchesCurrentProjection(
  preview: Pick<Stage7Preview, "confirmedSettlement" | "confirmationDiff" | "blockers">,
  adjustment: {
    expectedHeadId: string | null;
    rootSettlementId: string;
    changedExpenses: { expenseId: string; change: "NEW" | "CHANGED" | "DELETED" }[];
    blockers: { expenseId: string; reason: string }[];
  },
) {
  const changes = (items: { expenseId: string; change: string }[]) =>
    items
      .map((item) => `${item.expenseId}:${item.change}`)
      .sort()
      .join("|");
  const blockers = (items: { expenseId: string; reason: string }[]) =>
    items
      .map((item) => `${item.expenseId}:${item.reason}`)
      .sort()
      .join("|");
  return (
    (adjustment.expectedHeadId ?? adjustment.rootSettlementId) ===
      preview.confirmedSettlement?.id &&
    changes(
      adjustment.changedExpenses.map((item) => ({
        ...item,
        change:
          item.change === "NEW"
            ? "ADDED"
            : item.change === "DELETED"
              ? "REMOVED"
              : "CHANGED",
      })),
    ) === changes(preview.confirmationDiff) &&
    blockers(adjustment.blockers) === blockers(preview.blockers)
  );
}

export function countSettlementChanges(
  changes: SettlementSummaryProjection["confirmationDiff"],
) {
  const counts = { ADDED: 0, CHANGED: 0, REMOVED: 0 };
  for (const item of changes) counts[item.change] += 1;
  return counts;
}

export function settlementReviewBlockers(
  changes: SettlementSummaryProjection["confirmationDiff"],
  expenses: { id: string; serverId: string | null; status: string }[],
  authoritative: Stage7Preview["blockers"] = [],
) {
  const blockers = [...authoritative];
  for (const change of changes) {
    if (
      change.change === "REMOVED" &&
      expenses.some(
        (expense) =>
          (expense.id === change.expenseId || expense.serverId === change.expenseId) &&
          expense.status === "RATE_REQUIRED",
      ) &&
      !blockers.some((blocker) => blocker.expenseId === change.expenseId)
    )
      blockers.push({ expenseId: change.expenseId, reason: "RATE_REQUIRED" });
  }
  return blockers;
}

export function settlementExpenseIdentity(
  id: string,
  expenses: { id: string; serverId: string | null; title: string }[],
  titles: SharedProjection["titles"] = {},
) {
  const expense = expenses.find((item) => item.id === id || item.serverId === id);
  return {
    title: expense?.title || titles[id]?.title || "Expense",
    localId: expense?.id ?? titles[id]?.localId,
  };
}

export function currentSettlementSummaryProjection(
  preview: CurrentPreview,
  actorMemberId: string,
): SettlementSummaryProjection | null {
  const balance = preview.balances.find((item) => item.memberId === actorMemberId);
  if (!balance) return null;
  const confirmedBalance = preview.confirmedSettlement?.balances.find(
    (item) => item.memberId === actorMemberId,
  );
  return {
    projectionId: `${preview.sourceFingerprintPolicy}:${preview.sourceFingerprint}`,
    freshness: "CURRENT",
    sourceAsOf: preview.sourceAsOf,
    sourceFingerprintPolicy: preview.sourceFingerprintPolicy,
    sourceFingerprint: preview.sourceFingerprint,
    balanceMinor: balance.netMinor,
    paidMinor: balance.paidMinor,
    shareMinor: balance.owedMinor,
    currency: balance.currency,
    scale: balance.scale,
    confirmedSettlement:
      preview.confirmedSettlement && confirmedBalance
        ? {
            id: preview.confirmedSettlement.id,
            inputDigest: preview.confirmedSettlement.inputDigest,
            finalizedAt: preview.confirmedSettlement.finalizedAt,
            lineageSequence: preview.confirmedSettlement.lineageSequence,
            balanceMinor: confirmedBalance.netMinor,
          }
        : null,
    confirmationDiff: preview.confirmationDiff,
  };
}

export function savedSettlementSummaryProjection(
  preview: LocalPreview,
  confirmed: FinalizedSettlement | null,
  actorMemberId: string,
  pending: boolean,
): SettlementSummaryProjection | null {
  const balance = preview.balances.find((item) => item.memberId === actorMemberId);
  if (!balance) return null;
  const confirmedBalances = confirmed?.balances.length
    ? confirmed.balances
    : confirmed
      ? balancesFromSettlementInputs(
          confirmed.inputs,
          [],
          confirmed.settlementCurrency,
          confirmed.settlementScale,
        )
      : [];
  const confirmedBalance = confirmedBalances.find(
    (item) => item.memberId === actorMemberId,
  );
  const confirmationDiff = confirmed
    ? localExpensesChangesFromFinal(
        preview.inputs.map(({ expense }) => expense),
        confirmed,
      ).map(({ expenseId, change }) => ({
        expenseId,
        change:
          change === "NEW"
            ? ("ADDED" as const)
            : change === "DELETED"
              ? ("REMOVED" as const)
              : ("CHANGED" as const),
      }))
    : [];
  const generation = preview.inputs
    .map(({ expense }) => `${expense.serverId ?? expense.id}:${expense.revision}`)
    .sort()
    .join(",");
  return {
    projectionId: `LOCAL:${generation}`,
    freshness: pending ? "LOCAL_PENDING" : "SAVED",
    sourceAsOf: null,
    sourceFingerprintPolicy: null,
    sourceFingerprint: null,
    balanceMinor: balance.minor,
    paidMinor: balance.paidMinor,
    shareMinor: balance.owedMinor,
    currency: balance.currency,
    scale: balance.scale,
    confirmedSettlement:
      confirmed && confirmedBalance
        ? {
            id: confirmed.id,
            inputDigest: confirmed.inputDigest,
            finalizedAt: confirmed.finalizedAt,
            lineageSequence: confirmed.lineageSequence ?? 0,
            balanceMinor: confirmedBalance.netMinor,
          }
        : null,
    confirmationDiff,
  };
}
