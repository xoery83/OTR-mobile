import type { LedgerReviewFinding } from "@/hooks/useLedgerReview";
import type { Stage7Finalized } from "@/hooks/useStage7Settlement";

export type FinalizedTransfer = Stage7Finalized["transfers"][number];
export type SettlementTransferRow = {
  settlement: Stage7Finalized;
  transfer: FinalizedTransfer;
};

export function settlementTransferRows(
  finalized: Stage7Finalized | null,
  lineage: Stage7Finalized[],
): SettlementTransferRow[] {
  if (!finalized) return [];
  return (lineage.length ? lineage : [finalized]).flatMap((settlement) =>
    settlement.transfers.map((transfer) => ({ settlement, transfer })),
  );
}

export function settlementMemberName(settlement: Stage7Finalized, memberId: string) {
  return (
    settlement.balances.find((member) => member.memberId === memberId)
      ?.displayNameSnapshot ??
    settlement.adjustmentDeltas?.find((member) => member.memberId === memberId)
      ?.displayNameSnapshot ??
    "Traveller"
  );
}

export function transferStatusLabel(transfer: FinalizedTransfer) {
  if (transfer.status === "SETTLED") return "Received";
  if (transfer.status === "DISPUTED") return "Disputed";
  if (transfer.awaitingAmount.minor > 0) return "Waiting for confirmation";
  if (transfer.confirmedDischarge.minor > 0) return "Partly paid";
  return "Payment needed";
}

export function paymentStatusLabel(payment: FinalizedTransfer["payments"][number]) {
  if (payment.status === "AWAITING_CONFIRMATION")
    return payment.syncStatus === "SYNCED"
      ? "Waiting for confirmation"
      : "Saved on this iPhone—will sync";
  if (payment.status === "CONFIRMED") return "Received";
  if (payment.status === "DISPUTED") return "Disputed";
  if (payment.status === "REJECTED") return "Not received";
  return "Payment corrected";
}

export function primaryTransferAction(
  transfer: FinalizedTransfer,
  actorMemberId: string | null,
) {
  if (
    actorMemberId === transfer.toMemberId &&
    transfer.payments.some((payment) => payment.status === "AWAITING_CONFIRMATION")
  )
    return "CONFIRM_RECEIVED" as const;
  if (actorMemberId === transfer.fromMemberId && transfer.availableToReport.minor > 0)
    return "MARK_PAID" as const;
  return null;
}

const findingCopy: Record<string, { title: string; why: string }> = {
  POSSIBLE_DUPLICATE: {
    title: "Possible duplicate Expense",
    why: "This looks similar to another Expense and may count the same spending twice.",
  },
  AMOUNT_OUTLIER: {
    title: "Unusually large amount",
    why: "This amount is much larger than typical Expenses in this Journey.",
  },
  RATE_OUTLIER: {
    title: "Exchange rate looks unusual",
    why: "The saved exchange rate is outside the expected range and should be checked.",
  },
  EVIDENCE_MISMATCH: {
    title: "Receipt and Expense differ",
    why: "The payment evidence does not match the saved Expense amount.",
  },
  PARTICIPANT_ANOMALY: {
    title: "Payer is not included",
    why: "The person who paid is not included among this Expense’s participants.",
  },
};

export function reviewFindingCopy(finding: LedgerReviewFinding) {
  return (
    findingCopy[finding.findingType] ?? {
      title: finding.findingType
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase()),
      why: "This Expense needs a quick review before the group relies on it.",
    }
  );
}

export function reviewStatusLabel(status: LedgerReviewFinding["status"]) {
  if (status === "OPEN") return "Needs review";
  if (status === "ACKNOWLEDGED") return "Acknowledged";
  if (status === "DISMISSED") return "Dismissed";
  if (status === "RESOLVED") return "Resolved";
  return "No longer current";
}

export function canActOnFinding(finding: LedgerReviewFinding) {
  return (
    finding.layer === "HEURISTIC" &&
    finding.status !== "STALE" &&
    finding.status !== "RESOLVED"
  );
}
