import type { LedgerReviewFinding } from "@/hooks/useLedgerReview";

export const reviewCategories = [
  "All",
  "Amount",
  "Duplicate",
  "Exchange rate",
  "Participants",
  "Evidence",
  "Raised by a person",
] as const;
export type ReviewCategory = (typeof reviewCategories)[number];

export function reviewInbox(findings: LedgerReviewFinding[], category: ReviewCategory) {
  const active = findings.filter(
    (item) =>
      item.layer === "HEURISTIC" &&
      (item.origin === "HUMAN" || item.ruleId) &&
      item.lifecycle === "ACTIVE",
  );
  const pending = active.filter((item) => item.personalDecision === "NEEDS_REVIEW");
  const reviewed = active.filter(
    (item) =>
      item.personalDecision === "ACKNOWLEDGED" || item.personalDecision === "DISMISSED",
  );
  const history = findings.filter(
    (item) =>
      item.layer === "HEURISTIC" &&
      (item.origin === "HUMAN" || item.ruleId) &&
      item.lifecycle &&
      item.lifecycle !== "ACTIVE",
  );
  const matchesCategory = (item: LedgerReviewFinding, name: ReviewCategory) =>
    name === "All" ||
    (name === "Raised by a person"
      ? item.origin === "HUMAN"
      : item.ruleCategory === name);
  const counts = Object.fromEntries(
    reviewCategories.map((name) => [
      name,
      pending.filter((item) => matchesCategory(item, name)).length,
    ]),
  ) as Record<ReviewCategory, number>;
  const selectedCategory = category !== "All" && !counts[category] ? "All" : category;
  const matches = (item: LedgerReviewFinding) => matchesCategory(item, selectedCategory);
  return {
    selectedCategory,
    visibleCategories: reviewCategories.filter(
      (name) => name === "All" || counts[name] > 0,
    ),
    pending: pending.filter(matches),
    reviewed: reviewed.filter(matches),
    reviewedTotal: reviewed.length,
    history,
    counts,
  };
}
