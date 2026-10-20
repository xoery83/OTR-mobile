import { t, type MessageKey } from "@/ui/locale";
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
    t("common.traveller")
  );
}

export function transferStatusLabel(transfer: FinalizedTransfer) {
  if (transfer.status === "SETTLED") return t("settlement.received");
  if (transfer.status === "DISPUTED") return t("ledgerMigration.copy77");
  if (transfer.awaitingAmount.minor > 0) return t("ledgerMigration.copy78");
  if (transfer.confirmedDischarge.minor > 0) return t("ledgerMigration.copy79");
  return t("ledgerMigration.copy80");
}

export function paymentStatusLabel(payment: FinalizedTransfer["payments"][number]) {
  if (payment.status === "AWAITING_CONFIRMATION")
    return payment.syncStatus === "SYNCED"
      ? t("ledgerMigration.copy78")
      : t("ledgerMigration.copy81");
  if (payment.status === "CONFIRMED") return t("settlement.received");
  if (payment.status === "DISPUTED") return t("ledgerMigration.copy77");
  if (payment.status === "REJECTED") return t("ledgerMigration.copy82");
  return t("ledgerMigration.copy83");
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

const findingCopy: Record<string, { titleKey: MessageKey; whyKey: MessageKey }> = {
  HUMAN_CONCERN: {
    titleKey: "expense.somethingWrong",
    whyKey: "reviewFlow.label18",
  },
  POSSIBLE_DUPLICATE: {
    titleKey: "reviewFlow.label19",
    whyKey: "reviewFlow.label20",
  },
  AMOUNT_OUTLIER: {
    titleKey: "reviewFlow.label21",
    whyKey: "reviewFlow.label22",
  },
  RATE_OUTLIER: {
    titleKey: "reviewFlow.label23",
    whyKey: "reviewFlow.label24",
  },
  EVIDENCE_MISMATCH: {
    titleKey: "reviewFlow.label25",
    whyKey: "reviewFlow.label26",
  },
  PARTICIPANT_ANOMALY: {
    titleKey: "reviewFlow.label27",
    whyKey: "reviewFlow.label28",
  },
};

export function reviewFindingCopy(finding: LedgerReviewFinding) {
  if (finding.origin === "HUMAN" && finding.humanNote?.trim())
    return { title: finding.humanNote.trim(), why: t(findingCopy.HUMAN_CONCERN.whyKey) };
  const copy = findingCopy[finding.findingType];
  if (copy) return { title: t(copy.titleKey), why: t(copy.whyKey) };
  return {
    title: finding.findingType
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^./, (letter) => letter.toUpperCase()),
    why: t("reviewFlow.label29"),
  };
}

export function reviewStatusLabel(status: LedgerReviewFinding["status"]) {
  if (status === "OPEN") return t("ui.needsReview");
  if (status === "ACKNOWLEDGED") return t("reviewFlow.label13");
  if (status === "DISMISSED") return t("reviewFlow.label14");
  if (status === "RESOLVED") return t("reviewFlow.label15");
  return t("reviewFlow.label16");
}

export function canActOnFinding(finding: LedgerReviewFinding) {
  return (
    finding.layer === "HEURISTIC" &&
    (finding.origin === "HUMAN" || finding.ruleId != null) &&
    finding.lifecycle === "ACTIVE"
  );
}
