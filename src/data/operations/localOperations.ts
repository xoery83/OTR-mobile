import { z } from "zod";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
} from "@/data/auth/accountRequestContext";
import { readIntelligenceOperationalMetadata } from "@/data/repositories/intelligenceContinuationRepository";
import { readSyncOperationDiagnostics } from "@/data/sync/syncOperationRepository";
import { readLatestDataHealthState } from "@/data/health/dataHealthCoordinator";
import type { Task, Attempt } from "@/domain/intelligence/persistence";

export type OperationsHealth =
  | "WAITING"
  | "ACTIVE"
  | "RECOVERABLE_FAILURE"
  | "UNKNOWN_OUTCOME"
  | "TERMINAL_FAILURE"
  | "SETTLED";
export type OperationsFailure =
  | "NETWORK_OR_RESPONSE_LOST"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "SCHEMA_INVALID"
  | "EVIDENCE_INVALID"
  | "POLICY_OR_AUTH"
  | "OTHER_OR_UNKNOWN";
export type OperationsCoverage = "AVAILABLE" | "LIMITED" | "DENIED" | "UNAVAILABLE";
type Quality = "UNKNOWN" | "ESTIMATED" | "ACTUAL_REPORTED";
export type LocalOperationsRow = {
  source: "CONTINUATION" | "SYNC";
  correlationId: string;
  health: OperationsHealth;
  failure: OperationsFailure | null;
  userActionRequired: boolean | null;
  operatorAttentionRequired: boolean;
  automaticRecovery: "DEFERRED" | "NONE";
  sourceUpdatedAt: string | null;
  clock: Task["update_clock"] | null;
  ageSeconds: number | null;
  passComplete: boolean | null;
  waitReason: Task["wait_reason"];
  execution: Attempt["execution_observation"] | null;
  installation: Attempt["result_install_disposition"] | null;
  metering: Attempt["metering_disposition"] | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    quality: Quality;
  };
  cost: { nanos: string | null; currency: string | null; quality: Quality };
};
export type LocalOperationsSnapshot = {
  generation: number;
  observedAt: string;
  coverage: {
    intake: "UNAVAILABLE";
    semanticReview: "UNAVAILABLE";
    server: "UNAVAILABLE";
    continuation: OperationsCoverage;
    sync: OperationsCoverage;
    dataHealth: OperationsCoverage;
  };
  dataHealth: {
    outcome: "HEALTHY" | "WAITING" | "NEEDS_ATTENTION" | null;
    findingCount: number;
    attentionCount: number;
    updatedAt: string;
  } | null;
  rows: LocalOperationsRow[];
};
const failureClasses: Readonly<Record<string, OperationsFailure>> = {
  NETWORK: "NETWORK_OR_RESPONSE_LOST",
  RESPONSE_LOST: "NETWORK_OR_RESPONSE_LOST",
  TIMEOUT: "TIMEOUT",
  RATE_LIMIT: "RATE_LIMITED",
  RATE_LIMITED: "RATE_LIMITED",
  SERVER: "PROVIDER_UNAVAILABLE",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  RESPONSE_INVALID: "SCHEMA_INVALID",
  MALFORMED_OUTPUT: "SCHEMA_INVALID",
  SEMANTIC_INVALID: "EVIDENCE_INVALID",
  VALIDATION: "EVIDENCE_INVALID",
  AUTH: "POLICY_OR_AUTH",
  AUTH_FAILED: "POLICY_OR_AUTH",
  PERMISSION: "POLICY_OR_AUTH",
  POLICY_BLOCKED: "POLICY_OR_AUTH",
  BALANCE_EXHAUSTED: "POLICY_OR_AUTH",
};
export function classifyOperationsFailure(code: string | null): OperationsFailure | null {
  return code === null
    ? null
    : Object.hasOwn(failureClasses, code)
      ? failureClasses[code]
      : "OTHER_OR_UNKNOWN";
}
export function operationsAgeSeconds(
  at: string | null,
  now: string,
  clock: Task["update_clock"] | null,
) {
  if (at === null || clock !== "DEVICE_WALL") return null;
  const age = Date.parse(now) - Date.parse(at);
  return Number.isFinite(age) && age >= 0 ? Math.floor(age / 1000) : null;
}
function baseRow(
  source: LocalOperationsRow["source"],
  id: string,
  at: string,
  now: string,
  clock: Task["update_clock"] | null,
): LocalOperationsRow {
  return {
    source,
    correlationId: id,
    health: "WAITING",
    failure: null,
    userActionRequired: null,
    operatorAttentionRequired: false,
    automaticRecovery: "NONE",
    sourceUpdatedAt: z.iso.datetime().safeParse(at).success ? at : null,
    clock,
    ageSeconds: operationsAgeSeconds(at, now, clock),
    passComplete: null,
    waitReason: null,
    execution: null,
    installation: null,
    metering: null,
    usage: {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      quality: "UNKNOWN",
    },
    // SQLite50 is not a billing journal; no server cost reader is composed here.
    cost: { nanos: null, currency: null, quality: "UNKNOWN" },
  };
}
const healthStateSchema = z.object({
  outcome: z.enum(["HEALTHY", "WAITING", "NEEDS_ATTENTION"]).nullable(),
  findingCount: z.number().int().nonnegative().safe(),
  attentionCount: z.number().int().nonnegative().safe(),
  updatedAt: z.string(),
});

// Only SELECT readers and a coherent local transaction. No source/content recovery.
export async function readLocalOperations(
  database: Pick<
    SQLiteDatabase,
    "getAllAsync" | "getFirstAsync" | "withTransactionAsync"
  >,
  getAccountId: () => Promise<string>,
  now = () => new Date().toISOString(),
): Promise<LocalOperationsSnapshot> {
  const context = await captureAccountRequestContext("", getAccountId);
  return withAccountApplyGate(async () => {
    await assertAccountRequestContext(context, getAccountId);
    const result: LocalOperationsSnapshot = {
      generation: context.generation,
      observedAt: z.iso.datetime().parse(now()),
      coverage: {
        intake: "UNAVAILABLE",
        semanticReview: "UNAVAILABLE",
        server: "UNAVAILABLE",
        continuation: "UNAVAILABLE",
        sync: "UNAVAILABLE",
        dataHealth: "UNAVAILABLE",
      },
      dataHealth: null,
      rows: [],
    };
    await database.withTransactionAsync(async () => {
      // A corrupt/unavailable source must not suppress independently readable sources.
      try {
        const data = await readIntelligenceOperationalMetadata(
          database,
          context.accountId,
        );
        result.coverage.continuation =
          data === null ? "DENIED" : data.limited ? "LIMITED" : "AVAILABLE";
        for (const { task, attempt, unresolved } of data?.summaries ?? []) {
          const row = baseRow(
            "CONTINUATION",
            task.task_id,
            task.updated_at,
            result.observedAt,
            task.update_clock,
          );
          row.passComplete = task.current_pass_complete;
          row.waitReason = task.wait_reason;
          row.execution = attempt?.execution_observation ?? null;
          row.installation = attempt?.result_install_disposition ?? null;
          row.metering = attempt?.metering_disposition ?? null;
          row.failure = classifyOperationsFailure(attempt?.safe_failure_code ?? null);
          const currentFailed =
            attempt?.execution_observation === "TERMINAL" &&
            attempt.execution_outcome === "FAILED";
          if (task.work_disposition === "UNKNOWN" || unresolved?.unknown)
            row.health = "UNKNOWN_OUTCOME";
          else if (currentFailed) row.health = "TERMINAL_FAILURE";
          else if (unresolved?.running) row.health = "ACTIVE";
          else if (unresolved?.meter || unresolved?.install)
            row.health = "RECOVERABLE_FAILURE";
          else if (["FAILED", "CANCELED", "STALE"].includes(task.work_disposition))
            row.health = "TERMINAL_FAILURE";
          else if (task.work_disposition === "PUBLISHED") row.health = "SETTLED";
          else if (["RUNNING", "RESULT_PENDING"].includes(task.work_disposition))
            row.health = "ACTIVE";
          row.operatorAttentionRequired = [
            "UNKNOWN_OUTCOME",
            "RECOVERABLE_FAILURE",
            "TERMINAL_FAILURE",
          ].includes(row.health);
          row.automaticRecovery =
            currentFailed && row.health !== "UNKNOWN_OUTCOME"
              ? "DEFERRED"
              : ["WAITING", "RECOVERABLE_FAILURE"].includes(row.health)
                ? "DEFERRED"
                : "NONE";
          const u = attempt?.reported_usage_summary;
          if (u)
            row.usage = {
              inputTokens: u.input_tokens,
              outputTokens: u.output_tokens,
              totalTokens: u.total_tokens,
              quality: u.usage_quality,
            };
          result.rows.push(row);
        }
      } catch {
        result.coverage.continuation = "UNAVAILABLE";
      }
      try {
        const operations = await readSyncOperationDiagnostics(
          database,
          context.accountId,
        );
        result.coverage.sync = operations.length > 50 ? "LIMITED" : "AVAILABLE";
        for (const op of operations.slice(0, 50)) {
          const row = baseRow("SYNC", op.id, op.updatedAt, result.observedAt, null);
          row.failure =
            op.status === "COMPLETED"
              ? null
              : classifyOperationsFailure(op.failureCategory);
          // Generic UNKNOWN sync error is not proof of an uncertain provider execution.
          row.health =
            op.status === "COMPLETED"
              ? "SETTLED"
              : op.status === "PROCESSING"
                ? "ACTIVE"
                : ["FAILED", "CONFLICT"].includes(op.status)
                  ? "TERMINAL_FAILURE"
                  : op.status === "RETRYABLE"
                    ? "RECOVERABLE_FAILURE"
                    : "WAITING";
          row.userActionRequired =
            op.status !== "COMPLETED" &&
            (op.status === "CONFLICT" || op.failureCategory === "VALIDATION")
              ? true
              : null;
          row.operatorAttentionRequired =
            row.health === "RECOVERABLE_FAILURE" ||
            (row.health === "TERMINAL_FAILURE" && row.userActionRequired !== true);
          // Diagnostics does not establish admission or invoke existing retry policies.
          row.automaticRecovery = ["WAITING", "RECOVERABLE_FAILURE"].includes(row.health)
            ? "DEFERRED"
            : "NONE";
          result.rows.push(row);
        }
      } catch {
        result.coverage.sync = "UNAVAILABLE";
      }
      try {
        const state = await readLatestDataHealthState(database, context.accountId);
        result.dataHealth = state === null ? null : healthStateSchema.parse(state);
        result.coverage.dataHealth = "AVAILABLE";
      } catch {
        result.coverage.dataHealth = "UNAVAILABLE";
      }
      await assertAccountRequestContext(context, getAccountId);
    });
    await assertAccountRequestContext(context, getAccountId);
    assertAccountRequestGeneration(context);
    return result;
  });
}

export async function readDefaultLocalOperations() {
  const { getSyncTransportMode } = await import("@/data/sync/transportSelection");
  if (!__DEV__ || getSyncTransportMode() !== "dev")
    throw new Error("OPERATIONS_DEV_ONLY");
  const [{ readInitializedDatabase }, { requireAdoptedUserId }] = await Promise.all([
    import("@/data/db/database"),
    import("@/data/auth/authRepository"),
  ]);
  return readLocalOperations(await readInitializedDatabase(), requireAdoptedUserId);
}
