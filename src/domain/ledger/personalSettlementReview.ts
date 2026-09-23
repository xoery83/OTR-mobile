import type { SettlementPreview } from "./settlement";

export type PersonalSettlementContribution = {
  expenseId: string;
  expenseTitleSnapshot: string;
  sourceRevision: number;
  valuationSnapshotId: string;
  valuationFingerprint: string;
  payerMemberId: string;
  expenseSettlementMinor: number;
  payerCreditMinor: number;
  shareMinor: number;
  netMinor: number;
  inclusion: "INCLUDED";
};

export type PersonalSettlementStatement = {
  journeyId: string;
  memberId: string;
  currency: string;
  scale: number;
  settingsRevision: number;
  algorithmVersion: string;
  settlementId: string | null;
  settlementRevision: number | null;
  settlementInputDigest: string | null;
  paidMinor: number;
  shareMinor: number;
  balanceMinor: number;
  contributions: PersonalSettlementContribution[];
};

export type PersonalSettlementDelta = {
  previousBalanceMinor: number;
  currentBalanceMinor: number;
  netDeltaMinor: number;
  changedExpenses: {
    expenseId: string;
    expenseTitleSnapshot: string;
    oldContribution: PersonalSettlementContribution | null;
    newContribution: PersonalSettlementContribution | null;
    changeGroups: ("INCLUSION" | "PAYER" | "VALUATION_OR_AMOUNT" | "SHARE")[];
  }[];
};

export function buildPersonalSettlementStatement(
  preview: SettlementPreview,
  memberId: string,
  titles: ReadonlyMap<string, string>,
  lineage: {
    settlementId: string;
    settlementRevision: number;
    settlementInputDigest: string;
  } | null,
): PersonalSettlementStatement {
  if (preview.state !== "PREVIEW_READY")
    throw new Error("Personal Settlement review is blocked.");
  const balance = preview.balances.find((item) => item.memberId === memberId);
  if (!balance) throw new Error("Settlement member is unavailable.");
  const contributions = preview.inputs.flatMap((input) => {
    const payerCreditMinor =
      input.payer.memberId === memberId ? input.settlement.minor : 0;
    const shareMinor =
      input.splits.find((split) => split.member.memberId === memberId)?.settlementMinor ??
      0;
    if (payerCreditMinor === 0 && shareMinor === 0) return [];
    return [
      {
        expenseId: input.expenseId,
        expenseTitleSnapshot: titles.get(input.expenseId) ?? "Expense",
        sourceRevision: input.expenseRevision,
        valuationSnapshotId: input.valuation.id,
        valuationFingerprint: JSON.stringify({
          policy: input.valuation.policy,
          rateSnapshotId: input.valuation.rateSnapshotId,
          paymentRecordId: input.valuation.paymentRecordId,
          decimalRate: input.valuation.decimalRate,
          roundingMode: input.valuation.roundingMode,
          settlement: input.settlement,
        }),
        payerMemberId: input.payer.memberId,
        expenseSettlementMinor: input.settlement.minor,
        payerCreditMinor,
        shareMinor,
        netMinor: payerCreditMinor - shareMinor,
        inclusion: "INCLUDED" as const,
      },
    ];
  });
  return {
    journeyId: preview.journeyId,
    memberId,
    currency: balance.currency,
    scale: balance.scale,
    settingsRevision: preview.settingsRevision,
    algorithmVersion: preview.algorithmVersion,
    settlementId: lineage?.settlementId ?? null,
    settlementRevision: lineage?.settlementRevision ?? null,
    settlementInputDigest: lineage?.settlementInputDigest ?? null,
    paidMinor: balance.paidMinor,
    shareMinor: balance.owedMinor,
    balanceMinor: balance.netMinor,
    contributions,
  };
}

export function comparePersonalSettlementStatements(
  previous: PersonalSettlementStatement,
  current: PersonalSettlementStatement,
): PersonalSettlementDelta | null {
  const oldById = new Map(previous.contributions.map((item) => [item.expenseId, item]));
  const newById = new Map(current.contributions.map((item) => [item.expenseId, item]));
  const changedExpenses = [...new Set([...oldById.keys(), ...newById.keys()])]
    .sort()
    .flatMap((expenseId) => {
      const oldContribution = oldById.get(expenseId) ?? null;
      const newContribution = newById.get(expenseId) ?? null;
      const groups: PersonalSettlementDelta["changedExpenses"][number]["changeGroups"] =
        [];
      if (!oldContribution || !newContribution) groups.push("INCLUSION");
      if (
        oldContribution &&
        newContribution &&
        oldContribution.payerMemberId !== newContribution.payerMemberId &&
        oldContribution.payerCreditMinor !== newContribution.payerCreditMinor
      )
        groups.push("PAYER");
      if (
        oldContribution &&
        newContribution &&
        (oldContribution.valuationFingerprint !== newContribution.valuationFingerprint ||
          oldContribution.expenseSettlementMinor !==
            newContribution.expenseSettlementMinor)
      )
        groups.push("VALUATION_OR_AMOUNT");
      if (
        oldContribution &&
        newContribution &&
        oldContribution.shareMinor !== newContribution.shareMinor
      )
        groups.push("SHARE");
      return groups.length
        ? [
            {
              expenseId,
              expenseTitleSnapshot:
                newContribution?.expenseTitleSnapshot ??
                oldContribution?.expenseTitleSnapshot ??
                "Expense",
              oldContribution,
              newContribution,
              changeGroups: groups,
            },
          ]
        : [];
    });
  if (!changedExpenses.length) return null;
  return {
    previousBalanceMinor: previous.balanceMinor,
    currentBalanceMinor: current.balanceMinor,
    netDeltaMinor: current.balanceMinor - previous.balanceMinor,
    changedExpenses,
  };
}
