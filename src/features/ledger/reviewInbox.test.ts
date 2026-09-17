import { describe, expect, it } from "vitest";
import type { LedgerReviewFinding } from "@/hooks/useLedgerReview";
import { reviewInbox, reviewCategories } from "./reviewInbox";
import { reviewEvidence } from "./reviewEvidence";

const base = {
  id: "one",
  layer: "HEURISTIC",
  lifecycle: "ACTIVE",
  ruleId: "AMOUNT_OUTLIER",
  ruleCategory: "Amount",
  personalDecision: "NEEDS_REVIEW",
  status: "OPEN",
  observationContext: {
    originalMoney: { minor: 42900, currency: "ISK", scale: 0 },
    medianMinor: 8200,
    cohortSampleSize: 9,
    ratio: 42900 / 8200,
  },
} as unknown as LedgerReviewFinding;
const row = (id: string, changes: Partial<LedgerReviewFinding>) => ({
  ...base,
  id,
  ...changes,
});

describe("Review inbox personal projection", () => {
  it("keeps active pending and reviewed separate with personal category counts", () => {
    const findings = [
      base,
      row("two", {
        ruleCategory: "Duplicate",
        personalDecision: "ACKNOWLEDGED",
        status: "ACKNOWLEDGED",
      }),
      row("three", { ruleCategory: "Duplicate", personalDecision: "NEEDS_REVIEW" }),
      row("four", { lifecycle: "SUPERSEDED", personalDecision: "DISMISSED" }),
      row("five", { layer: "DETERMINISTIC" }),
    ];
    const all = reviewInbox(findings, "All");
    expect(all.pending.map((item) => item.id)).toEqual(["one", "three"]);
    expect(all.reviewed.map((item) => item.id)).toEqual(["two"]);
    expect(all.history.map((item) => item.id)).toEqual(["four"]);
    expect(all.counts).toMatchObject({ All: 2, Amount: 1, Duplicate: 1 });
    expect(all.visibleCategories).toEqual(["All", "Amount", "Duplicate"]);
    for (const category of reviewCategories.slice(1)) {
      const selected = reviewInbox(findings, category);
      expect(
        [...selected.pending, ...selected.reviewed].every(
          (item) => selected.selectedCategory === "All" || item.ruleCategory === category,
        ),
      ).toBe(true);
      expect(selected.counts.All).toBe(2);
    }
    expect(
      reviewInbox(
        [
          row("new", { personalDecision: "NEEDS_REVIEW" }),
          row("old", { lifecycle: "SUPERSEDED", personalDecision: "ACKNOWLEDGED" }),
        ],
        "All",
      ).pending,
    ).toHaveLength(1);
    expect(reviewInbox([], "All").counts.All).toBe(0);
    expect(reviewInbox([], "Duplicate")).toMatchObject({
      selectedCategory: "All",
      visibleCategories: ["All"],
      pending: [],
    });
  });

  it("renders immutable rule evidence without market-rate or OCR claims", () => {
    expect(reviewEvidence(base)).toEqual([
      ["Expense amount", expect.stringContaining("42,900")],
      ["Journey median (same currency)", expect.stringContaining("8,200")],
      ["Comparable Expenses", "9"],
      ["Difference", "5.2× the Journey median"],
    ]);
    const rate = reviewEvidence(
      row("rate", {
        ruleId: "RATE_OUTLIER",
        observationContext: { rateValue: "1245", direction: "HIGH" },
      }),
    );
    expect(rate.join(" ")).toContain("Above the Review bound");
    expect(rate.join(" ")).not.toMatch(/market|OCR/i);
    const duplicate = reviewEvidence(
      row("duplicate", {
        ruleId: "POSSIBLE_DUPLICATE",
        observationContext: {
          expenseTitleSnapshot: "Dinner",
          matchedTitleSnapshot: "Dinner 2",
        },
      }),
    );
    expect(duplicate[0][1]).toContain("Dinner");
    expect(duplicate[1][1]).toContain("Dinner 2");
    const evidence = reviewEvidence(
      row("payment", {
        ruleId: "EVIDENCE_MISMATCH",
        observationContext: {
          originalMoney: { minor: 8400, currency: "NZD", scale: 2 },
          postedMoney: { minor: 8650, currency: "NZD", scale: 2 },
          differenceMinor: 250,
          paymentRecordId: "payment-123",
        },
      }),
    );
    expect(evidence[2][1]).toContain("2.50");
    expect(evidence[3]).toEqual(["Payment record", "payment-123"]);
    const participants = reviewEvidence(
      row("payer", {
        ruleId: "PARTICIPANT_ANOMALY",
        observationContext: {
          payerMemberId: "payer",
          participantDisplaySnapshots: [["a", "Mary"]],
        },
      }),
      { payer: "Alex" },
    );
    expect(participants).toEqual(
      expect.arrayContaining([
        ["Payer", "Alex"],
        ["Participants", "Mary"],
      ]),
    );
  });
});
