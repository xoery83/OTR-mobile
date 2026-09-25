import type { DataHealthFinding } from "./dataHealthCoordinator";
import { missingEconomicDateRule } from "@/domain/ledger/economicDateEvidence";
import { NORMAL_SYNC_BACKOFF_ATTEMPT_LIMIT } from "@/data/sync/syncEngine";
import {
  HISTORICAL_EXPENSE_RECOVERY_ACTION,
  HISTORICAL_EXPENSE_RECOVERY_RULE,
} from "./historicalExpenseRecovery";
import {
  STALE_EXPENSE_CONFLICT_ACTION,
  STALE_EXPENSE_CONFLICT_RULE,
} from "./staleExpenseConflict";

export type DataHealthRepairDisposition =
  "AUTO_SAFE" | "USER_ACTION_REQUIRED" | "REMOTE_RECONCILIATION_REQUIRED" | "PROTECTED";

export type DataHealthRepairActionId =
  | "RECOVER_EXPIRED_OPERATION_LEASE_V1"
  | "WAKE_COMPLETED_OPERATION_DEPENDENCY_V1"
  | "REACTIVATE_RETRYABLE_OPERATION_V1"
  | typeof HISTORICAL_EXPENSE_RECOVERY_ACTION
  | typeof STALE_EXPENSE_CONFLICT_ACTION;

export type DataHealthRepairVerifierId =
  | "VERIFY_OPERATION_LEFT_PROCESSING_V1"
  | "VERIFY_DEPENDENT_OPERATION_RUNNABLE_V1"
  | "VERIFY_RETRYABLE_OPERATION_RUNNABLE_V1"
  | "VERIFY_HISTORICAL_EXPENSE_CONVERGED_V1"
  | "VERIFY_STALE_CONFLICT_RECONCILED_V1"
  | "VERIFY_USER_RESOLUTION_V1"
  | "VERIFY_REMOTE_RECONCILIATION_V1"
  | "VERIFY_PROTECTED_STATE_UNCHANGED_V1";

export type DataHealthRepairEvidenceId =
  | "EXPIRED_PROCESSING_LEASE_V1"
  | "COMPLETED_CAUSAL_PARENT_V1"
  | "LONG_LIVED_RETRYABLE_FAILURE_V1"
  | "USER_PROVIDED_CANONICAL_INPUT_V1"
  | "AUTHORIZED_REMOTE_CANONICAL_STATE_V1"
  | "PROTECTED_LOCAL_INTENT_V1"
  | "COMPLETE_LOCAL_OPERATION_EVIDENCE_V1"
  | "AUTHORIZED_CANONICAL_EQUALITY_V1";

export type DataHealthRepairPlan = {
  accountId: string;
  generation: number;
  journeyId: string | null;
  ruleId: string;
  targetType: string;
  targetId: string;
  findingDigest: string;
  disposition: DataHealthRepairDisposition;
  eligibility: "ELIGIBLE" | "INELIGIBLE";
  evidenceRequirement: DataHealthRepairEvidenceId;
  actionId: DataHealthRepairActionId | null;
  verifierId: DataHealthRepairVerifierId;
};

export type DataHealthOperationEvidence = {
  accountId: string;
  journeyId: string | null;
  targetType: "sync_operation" | "asset_operation";
  targetId: string;
  entityId: string;
  status: string;
  attemptCount: number;
  failureCategory: string | null;
  nextAttemptAt: string | null;
  leaseExpiresAt: string | null;
  dependencyOperationId: string | null;
  dependencyStatus: string | null;
  dependencyJourneyId: string | null;
  dependencyEntityId: string | null;
  journeyAuthorized: boolean;
  serverIdentityAvailable: boolean;
};

type PlanIdentity = Pick<
  DataHealthRepairPlan,
  | "accountId"
  | "generation"
  | "journeyId"
  | "ruleId"
  | "targetType"
  | "targetId"
  | "findingDigest"
>;

const longLivedRetryableCategories = new Set([
  "UNKNOWN",
  "NETWORK",
  "TIMEOUT",
  "SERVER",
  "RATE_LIMIT",
  "RESPONSE_INVALID",
]);

export const dataHealthRepairActionContracts: Readonly<
  Record<
    DataHealthRepairActionId,
    {
      evidenceRequirement: DataHealthRepairEvidenceId;
      verifierId: DataHealthRepairVerifierId;
    }
  >
> = {
  RECOVER_EXPIRED_OPERATION_LEASE_V1: {
    evidenceRequirement: "EXPIRED_PROCESSING_LEASE_V1",
    verifierId: "VERIFY_OPERATION_LEFT_PROCESSING_V1",
  },
  WAKE_COMPLETED_OPERATION_DEPENDENCY_V1: {
    evidenceRequirement: "COMPLETED_CAUSAL_PARENT_V1",
    verifierId: "VERIFY_DEPENDENT_OPERATION_RUNNABLE_V1",
  },
  REACTIVATE_RETRYABLE_OPERATION_V1: {
    evidenceRequirement: "LONG_LIVED_RETRYABLE_FAILURE_V1",
    verifierId: "VERIFY_RETRYABLE_OPERATION_RUNNABLE_V1",
  },
  [HISTORICAL_EXPENSE_RECOVERY_ACTION]: {
    evidenceRequirement: "COMPLETE_LOCAL_OPERATION_EVIDENCE_V1",
    verifierId: "VERIFY_HISTORICAL_EXPENSE_CONVERGED_V1",
  },
  [STALE_EXPENSE_CONFLICT_ACTION]: {
    evidenceRequirement: "AUTHORIZED_CANONICAL_EQUALITY_V1",
    verifierId: "VERIFY_STALE_CONFLICT_RECONCILED_V1",
  },
};

export const dataHealthRepairVerifiers: Readonly<
  Record<DataHealthRepairVerifierId, { successEvidence: string }>
> = {
  VERIFY_OPERATION_LEFT_PROCESSING_V1: {
    successEvidence:
      "A rescan proves the operation is no longer PROCESSING on an expired lease",
  },
  VERIFY_DEPENDENT_OPERATION_RUNNABLE_V1: {
    successEvidence:
      "A rescan proves the child is runnable after its explicit parent completed",
  },
  VERIFY_RETRYABLE_OPERATION_RUNNABLE_V1: {
    successEvidence:
      "A rescan proves the same retryable operation is runnable without identity changes",
  },
  VERIFY_HISTORICAL_EXPENSE_CONVERGED_V1: {
    successEvidence:
      "Push, pull, and rescan prove one mapped Expense matches the compacted current intent",
  },
  VERIFY_STALE_CONFLICT_RECONCILED_V1: {
    successEvidence:
      "A rescan proves the stale operation and equal canonical Expense no longer conflict",
  },
  VERIFY_USER_RESOLUTION_V1: {
    successEvidence:
      "A rescan proves ordinary product input or conflict resolution removed the finding",
  },
  VERIFY_REMOTE_RECONCILIATION_V1: {
    successEvidence:
      "An authorized reconciliation and rescan prove the scoped canonical invariant",
  },
  VERIFY_PROTECTED_STATE_UNCHANGED_V1: {
    successEvidence:
      "A rescan proves protected local identity, digest, and causal state are unchanged",
  },
};

const knownRuleIds = new Set([
  missingEconomicDateRule,
  "DH_SYNC_OPERATION_STATE_V1",
  "DH_LOCAL_ENTITY_INTENT_V1",
  "DH_RECEIPT_ORIGINAL_V1",
  "DH_CURSOR_SCOPE_V1",
  "DH_DEFERRED_CHANGE_V1",
  "DH_EXPENSE_FX_BINDING_V1",
  "DH_PERSONAL_PAYMENT_FX_BINDING_V1",
  "DH_REVIEW_DERIVED_STATE_V1",
  "DH_ACCOUNT_JOURNEY_ISOLATION_V1",
  HISTORICAL_EXPENSE_RECOVERY_RULE,
  STALE_EXPENSE_CONFLICT_RULE,
]);

export function planDataHealthRepairs(input: {
  accountId: string;
  generation: number;
  findings: DataHealthFinding[];
  operationEvidence: DataHealthOperationEvidence[];
  now: Date;
}): DataHealthRepairPlan[] {
  const evidence = new Map(
    input.operationEvidence.map((item) => [`${item.targetType}:${item.targetId}`, item]),
  );
  return input.findings.map((finding) => {
    const base = {
      accountId: input.accountId,
      generation: input.generation,
      journeyId: finding.journeyId,
      ruleId: finding.ruleId,
      targetType: finding.targetType,
      targetId: finding.targetId,
      findingDigest: finding.inputDigest,
    };
    if (!knownRuleIds.has(finding.ruleId)) return protectedPlan(base);
    if (
      finding.ruleId === HISTORICAL_EXPENSE_RECOVERY_RULE &&
      finding.category === "RETRYABLE"
    )
      return executablePlan(base, HISTORICAL_EXPENSE_RECOVERY_ACTION);
    if (
      finding.ruleId === STALE_EXPENSE_CONFLICT_RULE &&
      finding.category === "MIRROR_STALE"
    )
      return executablePlan(base, STALE_EXPENSE_CONFLICT_ACTION);
    if (
      finding.category === "PROTECTED_LOCAL" ||
      finding.category === "ISOLATION_VIOLATION"
    )
      return protectedPlan(base);
    if (
      finding.category === "ACTIONABLE_INPUT" ||
      finding.category === "CONFLICT" ||
      finding.category === "UNRECOVERABLE_INPUT"
    )
      return {
        ...base,
        disposition: "USER_ACTION_REQUIRED",
        eligibility: "INELIGIBLE",
        evidenceRequirement: "USER_PROVIDED_CANONICAL_INPUT_V1",
        actionId: null,
        verifierId: "VERIFY_USER_RESOLUTION_V1",
      } satisfies DataHealthRepairPlan;
    if (finding.ruleId !== "DH_SYNC_OPERATION_STATE_V1") return remotePlan(base);
    if (finding.category === "AUTH_PAUSED") return remotePlan(base);

    const operation = evidence.get(`${finding.targetType}:${finding.targetId}`);
    if (!operation) return protectedPlan(base, "COMPLETE_LOCAL_OPERATION_EVIDENCE_V1");
    if (
      operation.accountId !== input.accountId ||
      operation.journeyId !== finding.journeyId ||
      !operation.journeyAuthorized
    )
      return protectedPlan(base, "COMPLETE_LOCAL_OPERATION_EVIDENCE_V1");
    if (
      finding.category === "DEPENDENCY_BLOCKED" &&
      operation.status === "DEPENDENCY_BLOCKED" &&
      operation.dependencyOperationId &&
      operation.dependencyStatus === "COMPLETED" &&
      operation.dependencyJourneyId === finding.journeyId &&
      operation.dependencyEntityId === operation.entityId &&
      operation.serverIdentityAvailable
    )
      return executablePlan(base, "WAKE_COMPLETED_OPERATION_DEPENDENCY_V1");
    if (
      finding.category === "RETRYABLE" &&
      operation.status === "PROCESSING" &&
      operation.leaseExpiresAt &&
      Date.parse(operation.leaseExpiresAt) <= input.now.getTime()
    )
      return executablePlan(base, "RECOVER_EXPIRED_OPERATION_LEASE_V1");
    if (
      finding.category === "RETRYABLE" &&
      operation.status === "RETRYABLE" &&
      operation.attemptCount > NORMAL_SYNC_BACKOFF_ATTEMPT_LIMIT &&
      operation.nextAttemptAt &&
      Number.isFinite(Date.parse(operation.nextAttemptAt)) &&
      Date.parse(operation.nextAttemptAt) > input.now.getTime() &&
      longLivedRetryableCategories.has(operation.failureCategory ?? "")
    )
      return executablePlan(base, "REACTIVATE_RETRYABLE_OPERATION_V1");
    return protectedPlan(base, "COMPLETE_LOCAL_OPERATION_EVIDENCE_V1");
  });
}

export function isDataHealthRepairPlanCurrent(
  plan: DataHealthRepairPlan,
  accountId: string,
  generation: number,
) {
  return plan.accountId === accountId && plan.generation === generation;
}

function executablePlan(
  base: PlanIdentity,
  actionId: DataHealthRepairActionId,
): DataHealthRepairPlan {
  return {
    ...base,
    disposition: "AUTO_SAFE",
    eligibility: "ELIGIBLE",
    actionId,
    ...dataHealthRepairActionContracts[actionId],
  };
}

function protectedPlan(
  base: PlanIdentity,
  evidenceRequirement: DataHealthRepairEvidenceId = "PROTECTED_LOCAL_INTENT_V1",
): DataHealthRepairPlan {
  return {
    ...base,
    disposition: "PROTECTED",
    eligibility: "INELIGIBLE",
    evidenceRequirement,
    actionId: null,
    verifierId: "VERIFY_PROTECTED_STATE_UNCHANGED_V1",
  };
}

function remotePlan(base: PlanIdentity): DataHealthRepairPlan {
  return {
    ...base,
    disposition: "REMOTE_RECONCILIATION_REQUIRED",
    eligibility: "INELIGIBLE",
    evidenceRequirement: "AUTHORIZED_REMOTE_CANONICAL_STATE_V1",
    actionId: null,
    verifierId: "VERIFY_REMOTE_RECONCILIATION_V1",
  };
}
