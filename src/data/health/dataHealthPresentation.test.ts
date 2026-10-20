import { describe, expect, it } from "vitest";

import type { DataHealthFinding, DataHealthReport } from "./dataHealthCoordinator";
import {
  formatDataHealthTiming,
  presentDataHealthReport,
  technicalDataHealthDetails,
  userAttentionItems,
} from "./dataHealthPresentation";

const finding = (
  category: DataHealthFinding["category"],
  overrides: Partial<DataHealthFinding> = {},
): DataHealthFinding => ({
  ruleId: "DH_SYNC_OPERATION_STATE_V1",
  category,
  journeyId: "journey-a",
  targetType: "sync_operation",
  targetId: `${category}-target`,
  inputDigest: "digest",
  ...overrides,
});

const report = (overrides: Partial<DataHealthReport> = {}): DataHealthReport => ({
  accountId: "user-a",
  generation: 1,
  trigger: "MANUAL",
  outcome: "HEALTHY",
  reportDigest: "digest",
  journeyCount: 1,
  protectedIntentCount: 0,
  findings: [],
  repairPlans: [],
  counts: {},
  ...overrides,
});

describe("Data Health user presentation", () => {
  it("shows a healthy run without technical detail", () => {
    expect(presentDataHealthReport(report())).toEqual({
      title: "Data check complete",
      messages: ["Everything is up to date"],
      attentionItems: [],
    });
  });

  it("reports only reliable current-run convergence counts", () => {
    expect(
      presentDataHealthReport(
        report({
          convergence: {
            state: "RECOVERED",
            recoveredChangeCount: 3,
            refreshedJourneyCount: 1,
            localRepairCount: 8,
            syncAttempted: true,
          },
        }),
      ).messages,
    ).toEqual([
      "3 saved changes synced",
      "Shared data refreshed",
      "8 local issues repaired",
    ]);
  });

  it.each(["PROTECTED_LOCAL", "RETRYABLE", "DEPENDENCY_BLOCKED"] as const)(
    "keeps %s out of user attention",
    (category) => {
      const result = presentDataHealthReport(
        report({ outcome: "WAITING", findings: [finding(category)] }),
      );
      expect(result.attentionItems).toEqual([]);
      expect(result.messages).toContain(
        "Some saved changes will continue syncing automatically",
      );
    },
  );

  it("uses offline wording for incomplete automatic work", () => {
    expect(
      presentDataHealthReport(
        report({ outcome: "WAITING", findings: [finding("RETRYABLE")] }),
        true,
      ).messages,
    ).toContain("Some changes will sync when you're online");
  });

  it.each([
    ["ACTIONABLE_INPUT", "Needs a correction"],
    ["CONFLICT", "Changed in two places"],
  ] as const)("maps %s to genuine user attention", (category, message) => {
    expect(
      userAttentionItems([finding(category, { targetType: "expense" })])[0],
    ).toMatchObject({
      title: "Expense",
      message,
    });
  });

  it("uses a neutral label when an operation does not expose a safe product identity", () => {
    expect(userAttentionItems([finding("CONFLICT")])[0]?.title).toBe("Saved item");
  });

  it("maps a missing irreplaceable receipt to user attention", () => {
    expect(
      userAttentionItems([
        finding("UNRECOVERABLE_INPUT", {
          ruleId: "DH_RECEIPT_ORIGINAL_V1",
          targetType: "receipt",
        }),
      ])[0],
    ).toMatchObject({
      title: "Receipt",
      message: "Original photo needs to be reattached",
    });
  });

  it("does not present isolation diagnostics as a user repair task", () => {
    const result = presentDataHealthReport(
      report({ outcome: "NEEDS_ATTENTION", findings: [finding("ISOLATION_VIOLATION")] }),
    );
    expect(result.attentionItems).toEqual([]);
    expect(result.messages).toEqual(["Some saved data remains protected"]);
  });

  it("hides technical details unless Debug Mode is enabled", () => {
    const current = report({ findings: [finding("RETRYABLE")] });
    expect(technicalDataHealthDetails(current, false)).toBeNull();
    expect(technicalDataHealthDetails(current, true)).toContain(
      "DH_SYNC_OPERATION_STATE_V1 · RETRYABLE",
    );
  });

  it("formats truthful run timing", () => {
    expect(
      formatDataHealthTiming(
        report({
          runTiming: {
            startedAt: "2026-09-25T00:00:00.000Z",
            completedAt: "2026-09-25T00:01:08.000Z",
          },
        }),
        new Date("2026-09-25T00:01:20.000Z"),
      ),
    ).toBe("Last checked just now · 1m 08s");
  });

  it("does not mutate health findings while aggregating presentation", () => {
    const current = report({ findings: [finding("PROTECTED_LOCAL")] });
    const before = JSON.stringify(current);
    presentDataHealthReport(current);
    technicalDataHealthDetails(current, true);
    expect(JSON.stringify(current)).toBe(before);
  });
});
