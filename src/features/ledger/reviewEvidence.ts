import type { LedgerReviewFinding } from "@/hooks/useLedgerReview";
import { formatLedgerMoney } from "./format";

type Money = { minor: number; currency: string; scale: number };
const value = (money: unknown) => {
  const item = money as Money | null;
  return item &&
    Number.isFinite(item.minor) &&
    item.currency &&
    Number.isInteger(item.scale)
    ? formatLedgerMoney(item.minor, item.currency, item.scale)
    : "Unavailable";
};

export function reviewEvidence(
  finding: LedgerReviewFinding,
  memberNames: Record<string, string> = {},
) {
  const context = finding.observationContext;
  if (!context) return [];
  if (finding.origin === "HUMAN")
    return [
      ["Raised by", "A Journey member"],
      ["Target", String(context.targetType ?? finding.targetType ?? "Financial item")],
      ["Source revision", String(context.sourceRevision ?? finding.targetSourceRevision)],
    ];
  const original = context.originalMoney as Money | undefined;
  switch (finding.ruleId) {
    case "AMOUNT_OUTLIER":
      return [
        ["Expense amount", value(context.observedMoney ?? original)],
        [
          "Journey median (same currency)",
          original
            ? value({ ...original, minor: Number(context.medianMinor) })
            : "Unavailable",
        ],
        ["Comparable Expenses", String(context.cohortSampleSize ?? "Unavailable")],
        ["Difference", `${Number(context.ratio).toFixed(1)}× the Journey median`],
      ];
    case "POSSIBLE_DUPLICATE":
      return [
        [
          "This Expense",
          `${context.expenseTitleSnapshot ?? "Expense"} · ${value(original)} · ${context.expenseDateSnapshot ?? ""} · ${memberNames[String(context.payerMemberId)] ?? "Traveller"} paid`,
        ],
        [
          "Matches",
          `${context.matchedTitleSnapshot ?? "Expense"} · ${value(context.matchedOriginalMoney)} · ${context.matchedDateSnapshot ?? ""} · ${memberNames[String(context.matchedPayerMemberId)] ?? "Traveller"} paid`,
        ],
      ];
    case "RATE_OUTLIER":
      return [
        ["Recorded rate", String(context.rateValue ?? "Unavailable")],
        [
          "Currency pair",
          `${original?.currency ?? "?"} → ${(context.settlementMoney as Money | undefined)?.currency ?? "?"}`,
        ],
        ["Expected Review bounds", "Greater than 0 · no more than 1,000"],
        [
          "Comparison",
          context.direction === "HIGH"
            ? "Above the Review bound"
            : context.direction === "LOW"
              ? "At or below the Review bound"
              : "Not a finite rate",
        ],
        [
          "Rate source",
          context.rateSource === "DECIMAL_RATE"
            ? "Recorded decimal rate"
            : "Settlement / original amount",
        ],
      ];
    case "EVIDENCE_MISMATCH":
      return [
        ["Expense amount", value(original)],
        ["Posted payment", value(context.postedMoney)],
        [
          "Difference",
          original
            ? value({ ...original, minor: Math.abs(Number(context.differenceMinor)) })
            : "Unavailable",
        ],
        ...(context.paymentRecordId
          ? [["Payment record", String(context.paymentRecordId)]]
          : []),
      ];
    case "PARTICIPANT_ANOMALY": {
      const names = Array.isArray(context.participantDisplaySnapshots)
        ? context.participantDisplaySnapshots
            .map((entry) => (Array.isArray(entry) ? entry[1] || entry[0] : entry))
            .join(", ")
        : "Unavailable";
      return [
        ["Payer", memberNames[String(context.payerMemberId)] ?? "Traveller"],
        ["Participants", names || "None"],
        [
          "Why this appeared",
          "The payer is not included in the participant list for this Expense.",
        ],
      ];
    }
    default:
      return [];
  }
}

export function reviewCardEvidence(finding: LedgerReviewFinding) {
  const context = finding.observationContext;
  if (!context) return "Review this Expense";
  if (finding.origin === "HUMAN") return finding.humanNote || "A member raised this";
  switch (finding.ruleId) {
    case "AMOUNT_OUTLIER":
      return `${value(context.originalMoney)} · ${Number(context.ratio).toFixed(1)}× Journey median`;
    case "POSSIBLE_DUPLICATE":
      return `${value(context.originalMoney)} · matches ${context.matchedTitleSnapshot ?? "another Expense"} on ${context.matchedDateSnapshot ?? "the same day"}`;
    case "RATE_OUTLIER":
      return `Recorded rate ${context.rateValue ?? "unavailable"} · outside Review bounds`;
    case "EVIDENCE_MISMATCH":
      return `${value(context.originalMoney)} Expense · ${value(context.postedMoney)} posted payment`;
    case "PARTICIPANT_ANOMALY":
      return "Payer is not in the participant list";
    default:
      return "Review this Expense";
  }
}
