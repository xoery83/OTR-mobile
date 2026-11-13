import { z } from "zod";
import { uuid } from "./contract";
import { contentDigest } from "./mutation";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const confirmedReviewSchema = z.strictObject({
  account_id: uuid,
  trip_id: uuid,
  operations: z
    .array(
      z.strictObject({
        operation_id: uuid,
        target_id: uuid.nullable(),
        domain: z.enum(["ITEM", "PERSON", "EXPENSE", "LINK"]),
        request_digest: digest,
        capability: z.enum(["AVAILABLE", "BLOCKED"]),
        requires_operation_ids: z.array(uuid).max(20).optional(),
      }),
    )
    .max(100),
});
export const domainOutcomeSchema = z
  .strictObject({
    account_id: uuid,
    trip_id: uuid,
    operation_id: uuid,
    target_id: uuid,
    domain: z.enum(["ITEM", "PERSON", "EXPENSE", "LINK"]),
    request_digest: digest,
    outcome: z.enum([
      "APPLIED",
      "NO_CHANGE",
      "CONFLICT",
      "REJECTED",
      "UNKNOWN",
      "NOT_SUBMITTED",
    ]),
    no_dispatch_evidence: z.literal("NOT_SUBMITTED_AFTER_STOP").optional(),
    current_revision: z.number().int().positive().nullable(),
  })
  .refine(
    (r) =>
      r.outcome !== "NOT_SUBMITTED" ||
      r.no_dispatch_evidence === "NOT_SUBMITTED_AFTER_STOP",
    "EXPLICIT_NO_DISPATCH_EVIDENCE_REQUIRED",
  );

// Reporting only: existing batch/owning adapters dispatch and verify actual receipts.
export function recoveryReview(
  rawPlan: unknown,
  confirmedDigest: string,
  rawOutcomes: unknown[],
) {
  const plan = confirmedReviewSchema.parse(rawPlan);
  if (contentDigest(plan) !== confirmedDigest) throw Error("CONFIRMED_PLAN_MISMATCH");
  if (new Set(plan.operations.map((o) => o.operation_id)).size !== plan.operations.length)
    throw Error("DUPLICATE_OPERATION_ID");
  for (const [index, op] of plan.operations.entries()) {
    if (op.target_id === null && op.domain !== "EXPENSE")
      throw Error("UNKNOWN_TARGET_ONLY_FOR_NEW_EXPENSE");
    if (
      (op.requires_operation_ids ?? []).some(
        (id) =>
          !plan.operations.slice(0, index).some((prior) => prior.operation_id === id),
      )
    )
      throw Error("DEPENDENCY_MUST_PRECEDE_OPERATION");
  }
  const outcomes = rawOutcomes.map((r) => domainOutcomeSchema.parse(r));
  if (new Set(outcomes.map((o) => o.operation_id)).size !== outcomes.length)
    throw Error("DUPLICATE_OUTCOME");
  for (const r of outcomes) {
    const op = plan.operations.find((o) => o.operation_id === r.operation_id);
    if (
      !op ||
      op.capability !== "AVAILABLE" ||
      r.account_id !== plan.account_id ||
      r.trip_id !== plan.trip_id ||
      (op.target_id !== null && r.target_id !== op.target_id) ||
      r.domain !== op.domain ||
      r.request_digest !== op.request_digest
    )
      throw Error("OUTCOME_SCOPE_OR_INTENT_MISMATCH");
  }
  const rows = plan.operations.map((op, index) => {
    const r = outcomes.find((r) => r.operation_id === op.operation_id);
    const status = op.capability === "BLOCKED" ? "BLOCKED" : (r?.outcome ?? "UNKNOWN");
    return {
      ...op,
      target_id: r?.target_id ?? op.target_id,
      status,
      current_revision: r?.current_revision ?? null,
      next_action:
        status === "UNKNOWN"
          ? "QUERY_SAME_OWNING_OPERATION_NO_NEW_ID"
          : status === "CONFLICT"
            ? "READ_CURRENT_DIFF_AND_NEW_CONFIRMATION"
            : status === "BLOCKED"
              ? "WAIT_FOR_OWNING_CAPABILITY"
              : status === "NOT_SUBMITTED" &&
                  (op.requires_operation_ids ?? []).some(
                    (id) =>
                      !outcomes.some(
                        (outcome) =>
                          outcome.operation_id === id &&
                          ["APPLIED", "NO_CHANGE"].includes(outcome.outcome),
                      ),
                  )
                ? "WAIT_FOR_DEPENDENCY_RECEIPT"
                : status === "NOT_SUBMITTED"
                  ? plan.operations.slice(0, index).some((prior) => {
                      const outcome = outcomes.find(
                        (r) => r.operation_id === prior.operation_id,
                      )?.outcome;
                      return (
                        prior.capability === "AVAILABLE" &&
                        outcome !== "APPLIED" &&
                        outcome !== "NO_CHANGE"
                      );
                    })
                    ? "WAIT_FOR_PRIOR_UNRESOLVED_OPERATION"
                    : "SUBMIT_ONLY_ORIGINAL_CONFIRMED_OPERATION"
                  : status === "REJECTED"
                    ? "REVIEW_REJECTION_NO_BLIND_RETRY"
                    : "READBACK_NO_RECREATE",
    };
  });
  return {
    plan_digest: confirmedDigest,
    rows,
    complete: rows.every((r) => r.status === "APPLIED" || r.status === "NO_CHANGE"),
    atomic: false,
    dispatched: 0,
  };
}

export function reviewPlanChange(
  previous: unknown,
  previousDigest: string,
  outcomes: unknown[],
  proposed: unknown,
  proposedDigest: string,
) {
  const old = confirmedReviewSchema.parse(previous),
    next = confirmedReviewSchema.parse(proposed);
  if (old.account_id !== next.account_id || old.trip_id !== next.trip_id)
    throw Error("PLAN_SCOPE_MISMATCH");
  const prior = recoveryReview(old, previousDigest, outcomes);
  recoveryReview(next, proposedDigest, []);
  return next.operations.map((operation) => {
    const sameId = old.operations.find(
      (op) => op.operation_id === operation.operation_id,
    );
    if (
      sameId &&
      (sameId.request_digest !== operation.request_digest ||
        sameId.domain !== operation.domain ||
        sameId.target_id !== operation.target_id)
    )
      throw Error("OPERATION_ID_IMMUTABLE_NEW_INTENT_NEEDS_NEW_CONFIRMATION");
    const unresolved = prior.rows.find(
      (op) =>
        op.domain === operation.domain &&
        op.status === "UNKNOWN" &&
        (op.target_id === operation.target_id || op.target_id === null),
    );
    const saved = prior.rows.find(
      (op) =>
        op.operation_id === operation.operation_id &&
        ["APPLIED", "NO_CHANGE"].includes(op.status),
    );
    return {
      operation_id: operation.operation_id,
      decision: saved
        ? "REUSE_ACCEPTED_RECEIPT_NO_RECREATE"
        : unresolved
          ? "BLOCKED_RESOLVE_ORIGINAL_OPERATION_FIRST"
          : "REQUIRES_FRESH_CONFIRMATION_AND_CURRENT_BASE",
      original_operation_id: unresolved?.operation_id ?? saved?.operation_id ?? null,
    };
  });
}
