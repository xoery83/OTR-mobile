import type { ExpenseAggregate } from "./types";

export const ledgerReviewRulesetVersion = "ledger-review-v1";

export type LedgerReviewObservation = {
  findingType:
    | "POSSIBLE_DUPLICATE"
    | "AMOUNT_OUTLIER"
    | "RATE_OUTLIER"
    | "EVIDENCE_MISMATCH"
    | "PARTICIPANT_ANOMALY";
  severity: "INFO" | "WARNING";
  confidence: number;
  evidenceCodes: string[];
  expenseId: string;
  entityRevision: number;
  rulesetVersion: typeof ledgerReviewRulesetVersion;
};

export function reviewExpenses(
  expenses: readonly ExpenseAggregate[],
): LedgerReviewObservation[] {
  const accepted = expenses.filter((expense) => expense.status === "ACCEPTED");
  const findings: LedgerReviewObservation[] = [];
  const amounts = accepted.map((expense) => expense.original.minor).sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
  const contextCode = `CONTEXT_FINGERPRINT:${fingerprint(
    accepted
      .map((expense) => `${expense.id}:${expense.revision}`)
      .sort()
      .join("|"),
  )}`;

  for (const expense of accepted) {
    const add = (
      findingType: LedgerReviewObservation["findingType"],
      severity: LedgerReviewObservation["severity"],
      confidence: number,
      ...evidenceCodes: string[]
    ) =>
      findings.push({
        findingType,
        severity,
        confidence,
        evidenceCodes: [...evidenceCodes, contextCode],
        expenseId: expense.id,
        entityRevision: expense.revision,
        rulesetVersion: ledgerReviewRulesetVersion,
      });

    if (
      accepted.some(
        (other) =>
          other.id < expense.id &&
          other.payerMemberId === expense.payerMemberId &&
          other.original.minor === expense.original.minor &&
          other.original.currency === expense.original.currency &&
          other.title.trim().toLowerCase() === expense.title.trim().toLowerCase(),
      )
    )
      add("POSSIBLE_DUPLICATE", "WARNING", 0.9, "SAME_PAYER_AMOUNT_CURRENCY_TITLE");

    // ponytail: median multiplier is intentionally simple; replace with category cohorts when real replay data justifies it.
    if (accepted.length >= 5 && median > 0 && expense.original.minor >= median * 10)
      add("AMOUNT_OUTLIER", "WARNING", 0.75, "TEN_TIMES_JOURNEY_MEDIAN");

    const rate = expense.valuation?.decimalRate
      ? Number(expense.valuation.decimalRate)
      : expense.valuation && expense.original.minor > 0
        ? expense.valuation.settlement.minor / expense.original.minor
        : null;
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || rate > 1000))
      add("RATE_OUTLIER", "WARNING", 0.95, "RATE_OUTSIDE_V1_BOUNDS");

    const posted = expense.paymentRecords.find((record) => record.posted)?.posted;
    if (
      posted &&
      posted.currency === expense.original.currency &&
      posted.scale === expense.original.scale &&
      posted.minor !== expense.original.minor
    )
      add(
        "EVIDENCE_MISMATCH",
        "WARNING",
        0.95,
        "POSTED_AMOUNT_DIFFERS_FROM_MERCHANT_AMOUNT",
      );

    if (
      !expense.participants.some(
        (participant) => participant.memberId === expense.payerMemberId,
      )
    )
      add("PARTICIPANT_ANOMALY", "INFO", 0.7, "PAYER_NOT_PARTICIPATING");
  }

  return findings;
}

function fingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
