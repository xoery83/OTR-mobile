import type { ExpenseAggregate, Money, PaymentRecord } from "./types";

export const reviewV2Ruleset = "ledger-review-v2";
export type ReviewV2RuleId =
  | "POSSIBLE_DUPLICATE"
  | "AMOUNT_OUTLIER"
  | "RATE_OUTLIER"
  | "EVIDENCE_MISMATCH"
  | "PARTICIPANT_ANOMALY";
export type ReviewV2Category =
  "Duplicate" | "Amount" | "Exchange rate" | "Evidence" | "Participants";

export type ReviewV2Observation = {
  expenseId: string;
  expenseRevision: number;
  ruleId: ReviewV2RuleId;
  ruleVersion: 2;
  ruleCategory: ReviewV2Category;
  severity: "WARNING" | "INFO";
  confidence: number;
  evidenceCode: string;
  // Canonical ordered JSON; backend hashes this with SHA-256, not an unordered object.
  input: string;
  comparison: string | null;
  context: Record<string, unknown>;
};

const byId = (a: ExpenseAggregate, b: ExpenseAggregate) => a.id.localeCompare(b.id);
const money = (value: Money) => [value.minor, value.currency, value.scale] as const;
const day = (value: string) => value.slice(0, 10);
const title = (value: string) => value.trim().toLowerCase();

type DatedExpense = ExpenseAggregate & { occurredAt?: string };

export function reviewExpensesV2(
  expenses: readonly DatedExpense[],
): ReviewV2Observation[] {
  const accepted = expenses.filter((expense) => expense.status === "ACCEPTED").sort(byId);
  const observations: ReviewV2Observation[] = [];
  for (const expense of accepted) {
    const common = {
      expenseId: expense.id,
      expenseRevision: expense.revision,
      expenseTitleSnapshot: expense.title,
      expenseDateSnapshot: expenseDate(expense),
      payerMemberId: expense.payerMemberId,
      originalMoney: expense.original,
    };
    const add = (
      ruleId: ReviewV2RuleId,
      ruleCategory: ReviewV2Category,
      severity: ReviewV2Observation["severity"],
      confidence: number,
      evidenceCode: string,
      input: unknown[],
      comparison: unknown[] | null,
      details: Record<string, unknown>,
    ) =>
      observations.push({
        expenseId: expense.id,
        expenseRevision: expense.revision,
        ruleId,
        ruleVersion: 2,
        ruleCategory,
        severity,
        confidence,
        evidenceCode,
        input: JSON.stringify(input),
        comparison: comparison ? JSON.stringify(comparison) : null,
        context: { ...common, ruleId, ruleVersion: 2, ruleCategory, ...details },
      });

    const sameDay = accepted.filter(
      (other) =>
        other.id < expense.id &&
        other.payerMemberId === expense.payerMemberId &&
        other.original.minor === expense.original.minor &&
        other.original.currency === expense.original.currency &&
        other.original.scale === expense.original.scale &&
        title(other.title) === title(expense.title) &&
        expenseDate(other) === expenseDate(expense),
    );
    const match = sameDay[0];
    if (match && expenseDate(expense))
      add(
        "POSSIBLE_DUPLICATE",
        "Duplicate",
        "WARNING",
        0.9,
        "SAME_DAY_PAYER_AMOUNT_CURRENCY_SCALE_TITLE",
        [
          expense.payerMemberId,
          ...money(expense.original),
          title(expense.title),
          expenseDate(expense),
        ],
        [
          match.id,
          match.payerMemberId,
          ...money(match.original),
          title(match.title),
          expenseDate(match),
        ],
        {
          matchedExpenseId: match.id,
          matchedExpenseRevision: match.revision,
          matchedTitleSnapshot: match.title,
          matchedDateSnapshot: expenseDate(match),
          matchedPayerMemberId: match.payerMemberId,
          matchedOriginalMoney: match.original,
          criteria: "same-calendar-day-payer-amount-currency-scale-normalized-title",
        },
      );

    const cohort = accepted.filter(
      (other) =>
        other.original.currency === expense.original.currency &&
        other.original.scale === expense.original.scale,
    );
    const sorted = cohort.map((item) => item.original.minor).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (
      cohort.length >= 5 &&
      median > 0 &&
      BigInt(expense.original.minor) >= BigInt(median) * 10n
    )
      add(
        "AMOUNT_OUTLIER",
        "Amount",
        "WARNING",
        0.75,
        "TEN_TIMES_CURRENCY_COHORT_MEDIAN",
        money(expense.original).slice(),
        cohort.map((item) => [item.id, item.original.minor]),
        {
          observedMoney: expense.original,
          cohortCurrency: expense.original.currency,
          cohortScale: expense.original.scale,
          cohortSampleSize: cohort.length,
          medianMinor: median,
          thresholdMultiplier: 10,
          ratio: expense.original.minor / median,
        },
      );

    const rateSource = expense.valuation?.decimalRate
      ? "DECIMAL_RATE"
      : "SETTLEMENT_ORIGINAL_RATIO";
    const rate = expense.valuation?.decimalRate
      ? Number(expense.valuation.decimalRate)
      : expense.valuation && expense.original.minor > 0
        ? expense.valuation.settlement.minor / expense.original.minor
        : null;
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || rate > 1000))
      add(
        "RATE_OUTLIER",
        "Exchange rate",
        "WARNING",
        0.95,
        "RATE_OUTSIDE_V2_BOUNDS",
        [
          expense.valuation?.decimalRate ?? null,
          rateSource,
          ...money(expense.original),
          ...(expense.valuation ? money(expense.valuation.settlement) : []),
        ],
        null,
        {
          rateValue: expense.valuation?.decimalRate ?? String(rate),
          rateSource,
          settlementMoney: expense.valuation?.settlement,
          lowerExclusive: 0,
          upperInclusive: 1000,
          direction: !Number.isFinite(rate) ? "NON_FINITE" : rate <= 0 ? "LOW" : "HIGH",
        },
      );

    const posted = expense.paymentRecords
      .filter((record) => record.posted)
      .sort(
        (a, b) =>
          (a.postedAt ?? "").localeCompare(b.postedAt ?? "") || a.id.localeCompare(b.id),
      )[0];
    if (
      posted?.posted &&
      posted.posted.currency === expense.original.currency &&
      posted.posted.scale === expense.original.scale &&
      posted.posted.minor !== expense.original.minor
    )
      add(
        "EVIDENCE_MISMATCH",
        "Evidence",
        "WARNING",
        0.95,
        "POSTED_AMOUNT_DIFFERS_FROM_MERCHANT_AMOUNT",
        [...money(expense.original), ...paymentInput(posted)],
        null,
        {
          paymentRecordId: posted.id,
          postedMoney: posted.posted,
          differenceMinor: posted.posted.minor - expense.original.minor,
          selection: "earliest-posted-at-then-id",
          sameCurrencyAndScale: true,
        },
      );

    const participants = [...expense.participants].sort((a, b) =>
      a.memberId.localeCompare(b.memberId),
    );
    if (
      !participants.some((participant) => participant.memberId === expense.payerMemberId)
    )
      add(
        "PARTICIPANT_ANOMALY",
        "Participants",
        "INFO",
        0.7,
        "PAYER_NOT_PARTICIPATING",
        [expense.payerMemberId, participants.map((item) => item.memberId)],
        null,
        {
          participantMemberIds: participants.map((item) => item.memberId),
          participantDisplaySnapshots: participants.map((item) => [
            item.memberId,
            item.displayNameSnapshot,
          ]),
          payerNotParticipating: true,
        },
      );
  }
  return observations;
}

function expenseDate(expense: DatedExpense) {
  return day(expense.occurredAt ?? "");
}

function paymentInput(record: PaymentRecord) {
  return [record.id, record.postedAt, ...(record.posted ? money(record.posted) : [])];
}
