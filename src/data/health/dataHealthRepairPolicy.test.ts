import { describe, expect, it } from "vitest";

import type { DataHealthCategory, DataHealthFinding } from "./dataHealthCoordinator";
import {
  dataHealthRepairActionContracts,
  dataHealthRepairVerifiers,
  isDataHealthRepairPlanCurrent,
  planDataHealthRepairs,
  type DataHealthOperationEvidence,
} from "./dataHealthRepairPolicy";

const NOW = new Date("2026-09-24T01:00:00Z");

describe("Data Health Phase C0 repair policy", () => {
  it("maps all nine Phase B rules through one disposition policy", () => {
    const findings = [
      finding("DH_SYNC_OPERATION_STATE_V1", "RETRYABLE", "sync_operation", "sync"),
      finding("DH_LOCAL_ENTITY_INTENT_V1", "PROTECTED_LOCAL", "expense", "expense"),
      finding("DH_RECEIPT_ORIGINAL_V1", "UNRECOVERABLE_INPUT", "receipt", "receipt"),
      finding("DH_CURSOR_SCOPE_V1", "MIRROR_STALE", "cursor", "cursor"),
      finding("DH_DEFERRED_CHANGE_V1", "MIRROR_STALE", "deferred_change", "deferred"),
      finding(
        "DH_EXPENSE_FX_BINDING_V1",
        "ORPHAN_REBUILDABLE",
        "expense_valuation",
        "fx",
      ),
      finding(
        "DH_PERSONAL_PAYMENT_FX_BINDING_V1",
        "ORPHAN_REBUILDABLE",
        "personal_payment_projection",
        "payment-fx",
      ),
      finding("DH_REVIEW_DERIVED_STATE_V1", "CONFLICT", "review_state", "review"),
      finding(
        "DH_ACCOUNT_JOURNEY_ISOLATION_V1",
        "ISOLATION_VIOLATION",
        "sync_operation",
        "isolated",
      ),
    ];

    const plans = plan(findings, [
      operation("sync", {
        status: "RETRYABLE",
        failureCategory: "NETWORK",
        nextAttemptAt: "2026-10-24T01:00:00Z",
      }),
    ]);

    expect(plans.map(({ ruleId, disposition }) => [ruleId, disposition])).toEqual([
      ["DH_SYNC_OPERATION_STATE_V1", "AUTO_SAFE"],
      ["DH_LOCAL_ENTITY_INTENT_V1", "PROTECTED"],
      ["DH_RECEIPT_ORIGINAL_V1", "USER_ACTION_REQUIRED"],
      ["DH_CURSOR_SCOPE_V1", "REMOTE_RECONCILIATION_REQUIRED"],
      ["DH_DEFERRED_CHANGE_V1", "REMOTE_RECONCILIATION_REQUIRED"],
      ["DH_EXPENSE_FX_BINDING_V1", "REMOTE_RECONCILIATION_REQUIRED"],
      ["DH_PERSONAL_PAYMENT_FX_BINDING_V1", "REMOTE_RECONCILIATION_REQUIRED"],
      ["DH_REVIEW_DERIVED_STATE_V1", "USER_ACTION_REQUIRED"],
      ["DH_ACCOUNT_JOURNEY_ISOLATION_V1", "PROTECTED"],
    ]);
  });

  it("binds each executable candidate to versioned evidence, action, and verifier", () => {
    const findings = [
      finding("DH_SYNC_OPERATION_STATE_V1", "RETRYABLE", "sync_operation", "lease"),
      finding(
        "DH_SYNC_OPERATION_STATE_V1",
        "DEPENDENCY_BLOCKED",
        "sync_operation",
        "dependency",
      ),
      finding("DH_SYNC_OPERATION_STATE_V1", "RETRYABLE", "sync_operation", "retry"),
    ];
    const plans = plan(findings, [
      operation("lease", {
        status: "PROCESSING",
        failureCategory: "NETWORK",
        leaseExpiresAt: "2026-09-24T00:59:00Z",
      }),
      operation("dependency", {
        status: "DEPENDENCY_BLOCKED",
        failureCategory: "DEPENDENCY",
        dependencyOperationId: "parent",
        dependencyStatus: "COMPLETED",
        dependencyJourneyId: "journey-a",
      }),
      operation("retry", {
        status: "RETRYABLE",
        failureCategory: "UNKNOWN",
        nextAttemptAt: "2026-10-24T01:00:00Z",
      }),
    ]);

    expect(plans.map((item) => item.actionId)).toEqual([
      "RECOVER_EXPIRED_OPERATION_LEASE_V1",
      "WAKE_COMPLETED_OPERATION_DEPENDENCY_V1",
      "REACTIVATE_RETRYABLE_OPERATION_V1",
    ]);
    for (const item of plans) {
      expect(item).toMatchObject({ disposition: "AUTO_SAFE", eligibility: "ELIGIBLE" });
      expect(item.actionId).toMatch(/_V1$/);
      expect(item.evidenceRequirement).toMatch(/_V1$/);
      expect(item.verifierId).toMatch(/_V1$/);
      expect(dataHealthRepairActionContracts[item.actionId!]).toMatchObject({
        evidenceRequirement: item.evidenceRequirement,
        verifierId: item.verifierId,
      });
      expect(dataHealthRepairVerifiers[item.verifierId]).toBeDefined();
    }
  });

  it("fails closed for protected, historical FAILED, incomplete, ambiguous, and auth state", () => {
    const findings = [
      finding(
        "DH_SYNC_OPERATION_STATE_V1",
        "PROTECTED_LOCAL",
        "sync_operation",
        "failed",
      ),
      finding("DH_SYNC_OPERATION_STATE_V1", "RETRYABLE", "sync_operation", "missing"),
      finding(
        "DH_SYNC_OPERATION_STATE_V1",
        "RETRYABLE",
        "sync_operation",
        "bad-category",
      ),
      finding("DH_SYNC_OPERATION_STATE_V1", "AUTH_PAUSED", "sync_operation", "auth"),
      finding(
        "DH_SYNC_OPERATION_STATE_V1",
        "ACTIONABLE_INPUT",
        "sync_operation",
        "input",
      ),
      finding("DH_SYNC_OPERATION_STATE_V1", "CONFLICT", "sync_operation", "conflict"),
    ];
    const plans = plan(findings, [
      operation("failed", { status: "FAILED", failureCategory: "UNKNOWN" }),
      operation("bad-category", {
        status: "RETRYABLE",
        failureCategory: "PERMISSION",
        nextAttemptAt: "2026-10-24T01:00:00Z",
      }),
      operation("auth", { status: "PENDING", failureCategory: "AUTH" }),
      operation("input", { status: "FAILED", failureCategory: "VALIDATION" }),
      operation("conflict", { status: "CONFLICT", failureCategory: "CONFLICT" }),
    ]);

    expect(plans.map((item) => item.disposition)).toEqual([
      "PROTECTED",
      "PROTECTED",
      "PROTECTED",
      "REMOTE_RECONCILIATION_REQUIRED",
      "USER_ACTION_REQUIRED",
      "USER_ACTION_REQUIRED",
    ]);
    expect(plans.every((item) => item.eligibility === "INELIGIBLE")).toBe(true);
    expect(plans.every((item) => item.actionId === null)).toBe(true);
  });

  it("rejects executable evidence from another account or Journey", () => {
    const findings = [
      finding("DH_SYNC_OPERATION_STATE_V1", "RETRYABLE", "sync_operation", "account"),
      finding("DH_SYNC_OPERATION_STATE_V1", "RETRYABLE", "sync_operation", "journey"),
    ];
    const plans = plan(findings, [
      operation("account", {
        accountId: "user-b",
        status: "RETRYABLE",
        failureCategory: "NETWORK",
        nextAttemptAt: "2026-10-24T01:00:00Z",
      }),
      operation("journey", {
        journeyId: "journey-b",
        status: "RETRYABLE",
        failureCategory: "NETWORK",
        nextAttemptAt: "2026-10-24T01:00:00Z",
      }),
    ]);

    expect(plans.every((item) => item.disposition === "PROTECTED")).toBe(true);
    expect(plans.every((item) => item.eligibility === "INELIGIBLE")).toBe(true);
  });

  it("is deterministic and invalidates an old plan after A to B to A", () => {
    const findings = [
      finding("DH_SYNC_OPERATION_STATE_V1", "RETRYABLE", "sync_operation", "retry"),
    ];
    const evidence = [
      operation("retry", {
        status: "RETRYABLE",
        failureCategory: "TIMEOUT",
        nextAttemptAt: "2026-10-24T01:00:00Z",
      }),
    ];
    const first = plan(findings, evidence);
    const second = plan(findings, evidence);

    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({
      accountId: "user-a",
      generation: 1,
      journeyId: "journey-a",
    });
    expect(isDataHealthRepairPlanCurrent(first[0], "user-b", 2)).toBe(false);
    expect(isDataHealthRepairPlanCurrent(first[0], "user-a", 3)).toBe(false);
  });
});

function plan(findings: DataHealthFinding[], evidence: DataHealthOperationEvidence[]) {
  return planDataHealthRepairs({
    accountId: "user-a",
    generation: 1,
    findings,
    operationEvidence: evidence,
    now: NOW,
  });
}

function finding(
  ruleId: string,
  category: Exclude<DataHealthCategory, "HEALTHY">,
  targetType: string,
  targetId: string,
): DataHealthFinding {
  return {
    ruleId,
    category,
    journeyId: "journey-a",
    targetType,
    targetId,
    inputDigest: `digest-${targetId}`,
  };
}

function operation(
  targetId: string,
  overrides: Partial<DataHealthOperationEvidence>,
): DataHealthOperationEvidence {
  return {
    accountId: "user-a",
    journeyId: "journey-a",
    targetType: "sync_operation",
    targetId,
    status: "PENDING",
    failureCategory: null,
    nextAttemptAt: null,
    leaseExpiresAt: null,
    dependencyOperationId: null,
    dependencyStatus: null,
    dependencyJourneyId: null,
    ...overrides,
  };
}
