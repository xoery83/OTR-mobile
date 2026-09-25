import { localExpensesChangesFromFinal } from "./settlementSections";

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
  const confirmedBalance = confirmed?.balances.find(
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
