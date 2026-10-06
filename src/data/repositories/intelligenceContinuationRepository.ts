import type { SQLiteDatabase } from "expo-sqlite";
import {
  signalIntelligenceWake,
  IntelligenceWakeValidationError,
  validateIntelligenceWake,
  type SyncOperation,
} from "../sync/syncOperationRepository";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  taskSchema,
  attemptSchema,
  taskJsonColumns,
  attemptJsonColumns,
  taskMutableColumns,
  attemptMutableColumns,
  type Task,
  type Attempt,
  type WakePayload,
  intelligenceWakeKind,
} from "@/domain/intelligence/persistence";
import {
  withAccountApplyGate,
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";

export type ContinuationDatabase = Pick<
  SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
type Dependencies = {
  getAccountId(): Promise<string>;
  now(): string;
  sha256(bytes: Uint8Array): Promise<string>;
  validateAdmission(task: Task): Promise<void>;
  // Local owning policy checks only: never external I/O under the apply gate.
  validateAttemptAdmission(
    task: Task,
    attempt: Attempt,
    predecessor: Attempt | null,
  ): Promise<void>;
  eligibleWait(task: Task, reasons: Task["wait_reasons"]): Promise<boolean>;
  verifyRecovery(attempt: Attempt, evidenceDigest: string): Promise<void>;
};
const json = (value: unknown) => canonicalEventJson(value as Json);
const fail = (code: string): never => {
  throw new Error(code);
};
const encode = (row: Task | Attempt, jsonColumns: readonly string[]) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      jsonColumns.includes(k) && v !== null
        ? json(v)
        : typeof v === "boolean"
          ? Number(v)
          : v,
    ]),
  );
function decode(row: Record<string, unknown>, columns: readonly string[]) {
  const copy = { ...row };
  for (const k of columns)
    if (typeof copy[k] === "string") copy[k] = JSON.parse(copy[k] as string);
  for (const k of ["shadow", "current_pass_complete"])
    if (k in copy) {
      if (copy[k] !== 0 && copy[k] !== 1) fail("INTELLIGENCE_CORRUPT");
      copy[k] = copy[k] === 1;
    }
  return copy;
}
export function createIntelligenceContinuationRepository(
  db: ContinuationDatabase,
  deps: Dependencies,
) {
  async function transaction<T>(
    context: AccountRequestContext,
    work: () => Promise<T>,
    committed?: () => void,
  ) {
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(context, deps.getAccountId);
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await work();
        await assertAccountRequestContext(context, deps.getAccountId);
      });
      if (committed) {
        await assertAccountRequestContext(context, deps.getAccountId);
        committed();
      }
      return result;
    });
  }
  async function task(account: string, id: string) {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      "SELECT * FROM intelligence_continuations WHERE account_id=? AND task_id=?",
      account,
      id,
    );
    return row
      ? taskSchema.parse(decode(row, taskJsonColumns))
      : fail("INTELLIGENCE_TASK_NOT_FOUND");
  }
  async function attempt(account: string, id: string) {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      "SELECT * FROM intelligence_continuation_attempts WHERE account_id=? AND attempt_id=?",
      account,
      id,
    );
    return row
      ? attemptSchema.parse(decode(row, attemptJsonColumns))
      : fail("INTELLIGENCE_ATTEMPT_NOT_FOUND");
  }
  async function insert(
    table: "intelligence_continuations" | "intelligence_continuation_attempts",
    row: Task | Attempt,
    columns: readonly string[],
  ) {
    const data = encode(row, columns);
    await db.runAsync(
      `INSERT INTO ${table} (${Object.keys(data).join(",")}) VALUES (${Object.values(data)
        .map((v) => (typeof v === "number" ? "CAST(? AS INTEGER)" : "?"))
        .join(",")})`,
      ...(Object.values(data) as never[]),
    );
  }
  async function saveTask(row: Task, expected: number) {
    const next = taskSchema.parse({
      ...row,
      row_revision: expected + 1,
      updated_at: deps.now(),
      update_clock: "DEVICE_WALL",
    });
    const data = encode(next, taskJsonColumns);
    const changed = await db.runAsync(
      `UPDATE intelligence_continuations SET ${taskMutableColumns.map((k) => `${k}=${typeof data[k] === "number" ? "CAST(? AS INTEGER)" : "?"}`).join(",")} WHERE account_id=? AND task_id=? AND row_revision=?`,
      ...(taskMutableColumns.map((k) => data[k]) as never[]),
      next.account_id,
      next.task_id,
      expected,
    );
    if (changed.changes !== 1) fail("INTELLIGENCE_CAS");
    return next;
  }
  async function saveAttempt(row: Attempt, expected: number) {
    const next = attemptSchema.parse({
      ...row,
      row_revision: expected + 1,
      updated_at: deps.now(),
      update_clock: "DEVICE_WALL",
    });
    const data = encode(next, attemptJsonColumns);
    const changed = await db.runAsync(
      `UPDATE intelligence_continuation_attempts SET ${attemptMutableColumns.map((k) => `${k}=${typeof data[k] === "number" ? "CAST(? AS INTEGER)" : "?"}`).join(",")} WHERE account_id=? AND attempt_id=? AND row_revision=?`,
      ...(attemptMutableColumns.map((k) => data[k]) as never[]),
      next.account_id,
      next.attempt_id,
      expected,
    );
    if (changed.changes !== 1) fail("INTELLIGENCE_CAS");
    return next;
  }
  const digest = async (value: unknown) =>
    deps.sha256(new TextEncoder().encode(json(value)));
  async function pins(t: Task, context: AccountRequestContext) {
    if (
      t.account_id !== context.accountId ||
      (t.trip_id !== null && t.trip_id !== context.tripId)
    )
      fail("INTELLIGENCE_SCOPE");
    if (
      (await digest(t.input_pins)) !== t.input_sha256 ||
      (await digest(t.policy_snapshot)) !== t.policy_sha256
    )
      fail("INTELLIGENCE_DIGEST");
    await deps.validateAdmission(t); // Owning Import manifest/Trip admission, local only; never external I/O.
    for (const pin of t.input_pins) {
      if (pin.kind === "CAPTURE") {
        const r = await db.getFirstAsync<{
          revision: number;
          payload_id: string;
          sha256: string;
          byte_count: number;
          bytes: Uint8Array;
        }>(
          "SELECT c.revision,c.payload_id,p.sha256,p.byte_count,p.bytes FROM local_capture_inbox c JOIN local_capture_payloads p ON p.account_id=c.account_id AND p.id=c.payload_id WHERE c.account_id=? AND c.id=?",
          t.account_id,
          pin.capture_id,
        );
        if (
          !r ||
          r.revision !== pin.revision ||
          r.payload_id !== pin.payload_id ||
          r.sha256 !== pin.payload_sha256 ||
          r.byte_count !== pin.byte_count ||
          (await deps.sha256(r.bytes)) !== pin.payload_sha256
        )
          fail("INTELLIGENCE_STALE_CAPTURE");
      } else {
        const r = await db.getFirstAsync<{
          current_material_revision: number;
          payload_sha256: string;
          byte_count: number;
          transform_options_sha256: string | null;
        }>(
          "SELECT s.current_material_revision,r.payload_sha256,r.byte_count,r.transform_options_sha256 FROM trip_sources s JOIN trip_source_representations r ON r.cache_account_id=s.cache_account_id AND r.source_id=s.id WHERE s.cache_account_id=? AND s.id=? AND r.id=? AND s.lifecycle='ACTIVE' AND r.retention_state='RETAINED'",
          t.account_id,
          pin.source_id,
          pin.representation_id,
        );
        if (
          !r ||
          r.current_material_revision !== pin.material_revision ||
          r.payload_sha256 !== pin.payload_sha256 ||
          r.byte_count !== pin.byte_count ||
          r.transform_options_sha256 !== pin.transform_sha256
        )
          fail("INTELLIGENCE_STALE_SOURCE");
        if (
          pin.input_id &&
          !(await db.getFirstAsync(
            "SELECT id FROM trip_source_inputs WHERE cache_account_id=? AND id=? AND source_id=? AND representation_id=? AND material_revision=? AND payload_sha256=? AND byte_count=?",
            t.account_id,
            pin.input_id,
            pin.source_id,
            pin.representation_id,
            pin.material_revision,
            pin.payload_sha256,
            pin.byte_count,
          ))
        )
          fail("INTELLIGENCE_STALE_INPUT");
      }
    }
    if (
      t.run_id &&
      !(await db.getFirstAsync(
        "SELECT id FROM trip_source_runs WHERE cache_account_id=? AND id=? AND generation=? AND superseded_by IS NULL",
        t.account_id,
        t.run_id,
        t.expected_run_generation,
      ))
    )
      fail("INTELLIGENCE_STALE_RUN");
    if (
      t.candidate_id &&
      !(await db.getFirstAsync(
        "SELECT id FROM trip_source_candidates WHERE cache_account_id=? AND id=? AND run_id=? AND proposal_sha256=?",
        t.account_id,
        t.candidate_id,
        t.run_id,
        t.expected_candidate_sha256,
      ))
    )
      fail("INTELLIGENCE_STALE_CANDIDATE");
    if (
      t.event_id &&
      !(await db.getFirstAsync(
        "SELECT event_id FROM trip_canonical_events WHERE account_id=? AND trip_id=? AND event_id=? AND semantic_revision=?",
        t.account_id,
        t.trip_id,
        t.event_id,
        t.expected_event_revision,
      ))
    )
      fail("INTELLIGENCE_STALE_EVENT");
  }
  async function dependencies(t: Task) {
    const visiting = new Set<string>(),
      visited = new Set<string>();
    let count = 0;
    async function visit(id: string): Promise<void> {
      if (visiting.has(id)) fail("INTELLIGENCE_DEPENDENCY_CYCLE");
      if (visited.has(id)) return;
      if (++count > 64) fail("INTELLIGENCE_DEPENDENCY_BOUND");
      visiting.add(id);
      const row = id === t.task_id ? t : await task(t.account_id, id);
      for (const d of row.dependencies) {
        if (d.kind === "TASK") await visit(d.id);
        else if (
          !(await db.getFirstAsync(
            "SELECT id FROM sync_operations WHERE owner_user_id=? AND id=? AND operation_type<>?",
            t.account_id,
            d.id,
            intelligenceWakeKind,
          ))
        )
          fail("INTELLIGENCE_DEPENDENCY_SCOPE");
      }
      visiting.delete(id);
      visited.add(id);
    }
    await visit(t.task_id);
  }
  async function activeAttemptCount(t: Task) {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT count(*) AS count FROM intelligence_continuation_attempts WHERE account_id=? AND task_id=? AND shadow=0",
      t.account_id,
      t.task_id,
    );
    return row?.count ?? 0;
  }
  async function queue(
    t: Task,
    id: string,
    claimed = false,
    owner?: string | null,
    signal?: number | null,
  ) {
    const q = await db.getFirstAsync<{
      owner_user_id: string;
      entity_id: string;
      entity_type: string;
      trip_id: string | null;
      status: string;
      claim_owner: string | null;
      base_version: number | null;
    }>(
      "SELECT owner_user_id,entity_id,entity_type,trip_id,status,claim_owner,base_version FROM sync_operations WHERE id=?",
      id,
    );
    if (
      !q ||
      q.owner_user_id !== t.account_id ||
      q.entity_id !== t.task_id ||
      q.entity_type !== "INTELLIGENCE_CONTINUATION" ||
      (t.trip_id !== null && q.trip_id !== t.trip_id) ||
      (claimed && q.status !== "PROCESSING") ||
      (owner !== undefined &&
        (!owner || q.claim_owner !== owner || q.base_version !== signal))
    )
      fail("INTELLIGENCE_QUEUE_SCOPE");
  }
  return {
    attempts(context: AccountRequestContext, id: string) {
      return transaction(context, async () => {
        await task(context.accountId, id);
        const rows = await db.getAllAsync<Record<string, unknown>>(
          "SELECT * FROM intelligence_continuation_attempts WHERE account_id=? AND task_id=? ORDER BY attempt_sequence",
          context.accountId,
          id,
        );
        return rows.map((row) => attemptSchema.parse(decode(row, attemptJsonColumns)));
      });
    },
    publishLocal(
      context: AccountRequestContext,
      id: string,
      revision: number,
      publicationId: string,
      resultDigest: string,
      install: (task: Task) => Promise<void>,
    ) {
      return transaction(context, async () => {
        const t = await task(context.accountId, id);
        if (
          t.row_revision !== revision ||
          t.current_attempt_id ||
          !["PENDING", "WAITING", "PUBLISHED"].includes(t.work_disposition)
        )
          fail("INTELLIGENCE_INSTALL_FENCE");
        await pins(t, context);
        if (t.publication_id) {
          if (t.publication_id !== publicationId || t.result_sha256 !== resultDigest)
            fail("INTELLIGENCE_CHANGED_PUBLICATION");
          return t;
        }
        await install(t); // Local installation only, under this transaction; never external I/O.
        return saveTask(
          {
            ...t,
            work_disposition: "PUBLISHED",
            current_pass_complete: true,
            wait_reason: null,
            wait_reasons: [],
            publication_id: publicationId,
            publication_sha256: resultDigest,
            result_sha256: resultDigest,
            completed_at: deps.now(),
          },
          revision,
        );
      });
    },
    readAttempt(context: AccountRequestContext, id: string) {
      return transaction(context, () => attempt(context.accountId, id));
    },
    list(context: AccountRequestContext) {
      return transaction(context, async () => {
        const rows = await db.getAllAsync<Record<string, unknown>>(
          "SELECT * FROM intelligence_continuations WHERE account_id=? ORDER BY created_at,task_id",
          context.accountId,
        );
        return rows.map((row) => taskSchema.parse(decode(row, taskJsonColumns)));
      });
    },
    scheduleWake(context: AccountRequestContext, id: string, requested?: WakePayload) {
      return transaction(
        context,
        async () => {
          const t = await task(context.accountId, id);
          if (t.trip_id !== (context.tripId || null)) fail("INTELLIGENCE_SCOPE");
          const operationId = await signalIntelligenceWake(
            db,
            t,
            deps.sha256,
            deps.now(),
            requested,
          );
          if (!t.sync_operation_id)
            await saveTask({ ...t, sync_operation_id: operationId }, t.row_revision);
          return operationId;
        },
        announceLedgerQueueWorkAvailable,
      );
    },
    inspectWake(context: AccountRequestContext, operation: SyncOperation) {
      return transaction(context, async () => {
        const payload = await validateIntelligenceWake(operation, deps.sha256);
        let t: Task;
        try {
          t = await task(context.accountId, payload.task_id);
        } catch (error) {
          if (error instanceof Error && error.message === "INTELLIGENCE_TASK_NOT_FOUND")
            throw new IntelligenceWakeValidationError("INTELLIGENCE_WAKE_BINDING");
          throw error;
        }
        if (
          t.sync_operation_id !== operation.id ||
          t.account_id !== payload.account_id ||
          t.trip_id !== operation.tripId
        )
          throw new IntelligenceWakeValidationError("INTELLIGENCE_WAKE_BINDING");
        await queue(t, operation.id, true, operation.claimOwner, operation.baseVersion);
        const retained = await db.getFirstAsync<SyncOperation>(
          `SELECT id, owner_user_id AS ownerUserId, entity_type AS entityType,
            entity_id AS entityId, operation_type AS operationType,
            idempotency_key AS idempotencyKey, payload_json AS payloadJson,
            base_version AS baseVersion FROM sync_operations WHERE id=? AND owner_user_id=?`,
          operation.id,
          context.accountId,
        );
        if (!retained) throw new Error("INTELLIGENCE_WAKE_MISSING");
        await validateIntelligenceWake(retained, deps.sha256);
        if (retained.payloadJson !== operation.payloadJson)
          fail("INTELLIGENCE_CHANGED_WAKE");
        const a = t.current_attempt_id
          ? await attempt(t.account_id, t.current_attempt_id)
          : null;
        if (
          payload.expected_publication_fence !== t.publication_fence ||
          ["CANCELED", "STALE", "FAILED", "PUBLISHED"].includes(t.work_disposition)
        )
          return { task: t, attempt: a, disposition: "TERMINATE" as const };
        await pins(t, context);
        await dependencies(t);
        let ready = true;
        for (const d of t.dependencies) {
          if (d.kind === "TASK")
            ready &&= (await task(t.account_id, d.id)).work_disposition === "PUBLISHED";
          else
            ready &&= !!(await db.getFirstAsync(
              "SELECT id FROM sync_operations WHERE owner_user_id=? AND id=? AND status='COMPLETED' AND operation_type<>?",
              t.account_id,
              d.id,
              intelligenceWakeKind,
            ));
        }
        return {
          task: t,
          attempt: a,
          disposition: ready ? ("EVALUATE" as const) : ("WAIT" as const),
        };
      });
    },
    terminate(
      context: AccountRequestContext,
      id: string,
      revision: number,
      reason: "UNSUPPORTED" | "EXHAUSTED",
      wake?: SyncOperation,
    ) {
      return transaction(context, async () => {
        const t = await task(context.accountId, id);
        if (t.row_revision !== revision) fail("INTELLIGENCE_CAS");
        if (wake) await queue(t, wake.id, true, wake.claimOwner, wake.baseVersion);
        if (t.current_attempt_id) {
          const a = await attempt(t.account_id, t.current_attempt_id);
          if (
            a.execution_observation !== "TERMINAL" ||
            a.response_sha256 ||
            !["NOT_REQUIRED", "COMPLETE"].includes(a.metering_disposition)
          )
            fail("INTELLIGENCE_UNRESOLVED_RESPONSIBILITY");
        }
        return saveTask(
          {
            ...t,
            work_disposition: "FAILED",
            safe_reason: reason,
            wait_reason: null,
            wait_reasons: [],
          },
          revision,
        );
      });
    },
    beginExecution(
      context: AccountRequestContext,
      id: string,
      revision: number,
      metering: "NOT_REQUIRED" | "START_DURABLE",
    ) {
      return transaction(context, async () => {
        const a = await attempt(context.accountId, id),
          t = await task(context.accountId, a.task_id);
        if (
          a.row_revision !== revision ||
          a.execution_observation !== "NOT_STARTED" ||
          (!a.shadow && t.current_attempt_id !== a.attempt_id) ||
          t.publication_fence !== a.task_publication_fence ||
          t.cancellation_disposition !== "NONE" ||
          t.work_disposition !== "RUNNING" ||
          (a.integration_id && metering !== "START_DURABLE")
        )
          fail("INTELLIGENCE_EXECUTION_FENCE");
        await pins(t, context);
        await deps.validateAttemptAdmission(
          t,
          a,
          a.predecessor_attempt_id
            ? await attempt(t.account_id, a.predecessor_attempt_id)
            : null,
        );
        return saveAttempt(
          {
            ...a,
            execution_observation: "RUNNING",
            metering_disposition: metering,
            started_at: deps.now(),
          },
          revision,
        );
      });
    },
    // TEST harness handoff only: no production construction or dispatch authority.
    admitSyntheticExecution(
      context: AccountRequestContext,
      expected: Readonly<Attempt>,
      execute: () => void,
    ) {
      return withAccountApplyGate(
        async () => {
          await assertAccountRequestContext(context, deps.getAccountId);
          await db.withTransactionAsync(async () => {
            const a = await attempt(context.accountId, expected.attempt_id),
              t = await task(context.accountId, expected.task_id);
            if (
              json(a) !== json(expected) ||
              a.execution_observation !== "RUNNING" ||
              a.metering_disposition !== "START_DURABLE" ||
              (!a.shadow && t.current_attempt_id !== a.attempt_id) ||
              t.publication_fence !== a.task_publication_fence ||
              t.cancellation_disposition !== "NONE" ||
              t.work_disposition !== "RUNNING"
            )
              fail("INTELLIGENCE_EXECUTION_FENCE");
            await pins(t, context);
            await deps.validateAttemptAdmission(
              t,
              a,
              a.predecessor_attempt_id
                ? await attempt(t.account_id, a.predecessor_attempt_id)
                : null,
            );
            await assertAccountRequestContext(context, deps.getAccountId);
            // Revision CAS consumes this exact local start responsibility once.
            const changed = await db.runAsync(
              "UPDATE intelligence_continuation_attempts SET row_revision=row_revision+1 WHERE account_id=? AND attempt_id=? AND row_revision=? AND execution_observation='RUNNING' AND metering_disposition='START_DURABLE' AND EXISTS (SELECT 1 FROM intelligence_continuations t WHERE t.account_id=? AND t.task_id=? AND t.row_revision=? AND t.publication_fence=? AND t.cancellation_disposition='NONE' AND t.work_disposition='RUNNING' AND (?=1 OR t.current_attempt_id=?))",
              a.account_id,
              a.attempt_id,
              a.row_revision,
              t.account_id,
              t.task_id,
              t.row_revision,
              a.task_publication_fence,
              Number(a.shadow),
              a.attempt_id,
            );
            if (changed.changes !== 1) fail("INTELLIGENCE_EXECUTION_FENCE");
          });
        },
        () => {
          // COMMIT and gate release precede I/O, with no intervening await.
          assertAccountRequestGeneration(context);
          execute();
        },
      );
    },
    snapshot(context: AccountRequestContext, id: string) {
      return transaction(context, async () => {
        const t = await task(context.accountId, id);
        await pins(t, context);
        const rows = await db.getAllAsync<Record<string, unknown>>(
          "SELECT * FROM intelligence_continuation_attempts WHERE account_id=? AND task_id=? ORDER BY attempt_sequence",
          context.accountId,
          id,
        );
        return {
          task: t,
          attempts: rows.map((row) =>
            attemptSchema.parse(decode(row, attemptJsonColumns)),
          ),
        };
      });
    },
    read(context: AccountRequestContext, id: string) {
      return transaction(context, () => task(context.accountId, id));
    },
    create(context: AccountRequestContext, raw: Task) {
      return transaction(context, async () => {
        const t = taskSchema.parse(raw);
        if (
          t.row_revision !== 1 ||
          t.publication_fence !== 1 ||
          t.current_attempt_id !== null ||
          t.work_disposition !== "PENDING" ||
          t.publication_id !== null
        )
          fail("INTELLIGENCE_INITIAL");
        await pins(t, context);
        await dependencies(t);
        if (t.sync_operation_id) await queue(t, t.sync_operation_id);
        const old = await db.getFirstAsync<{ task_id: string }>(
          "SELECT task_id FROM intelligence_continuations WHERE account_id=? AND (task_id=? OR logical_request_id=? OR logical_idempotency_key=?)",
          t.account_id,
          t.task_id,
          t.logical_request_id,
          t.logical_idempotency_key,
        );
        if (old) {
          const prior = await task(t.account_id, old.task_id);
          const mutable = new Set<string>(taskMutableColumns);
          if (
            json(
              Object.fromEntries(Object.entries(prior).filter(([k]) => !mutable.has(k))),
            ) !==
            json(Object.fromEntries(Object.entries(t).filter(([k]) => !mutable.has(k))))
          )
            fail("INTELLIGENCE_CHANGED_TASK");
          return prior;
        }
        await insert("intelligence_continuations", t, taskJsonColumns);
        return t;
      });
    },
    bindQueue(
      context: AccountRequestContext,
      id: string,
      revision: number,
      operationId: string,
    ) {
      return transaction(context, async () => {
        const t = await task(context.accountId, id);
        if (
          t.row_revision !== revision ||
          (t.sync_operation_id !== null && t.sync_operation_id !== operationId)
        )
          fail("INTELLIGENCE_CAS");
        await queue(t, operationId);
        return saveTask({ ...t, sync_operation_id: operationId }, revision);
      });
    },
    wait(
      context: AccountRequestContext,
      id: string,
      revision: number,
      reasons: Task["wait_reasons"],
      passComplete: boolean,
      dependencyList?: Task["dependencies"],
      wake?: SyncOperation,
    ) {
      return transaction(context, async () => {
        const t = await task(context.accountId, id);
        const previous = t.current_attempt_id
          ? await attempt(t.account_id, t.current_attempt_id)
          : null;
        const terminalWithoutResult =
          previous?.execution_observation === "TERMINAL" &&
          !previous.response_sha256 &&
          ["COMPLETE", "NOT_REQUIRED"].includes(previous.metering_disposition);
        if (
          t.row_revision !== revision ||
          (t.work_disposition === "RUNNING" && !terminalWithoutResult) ||
          ["UNKNOWN", "PUBLISHED", "CANCELED", "STALE"].includes(t.work_disposition) ||
          !reasons.length
        )
          fail("INTELLIGENCE_CAS");
        if (wake) await queue(t, wake.id, true, wake.claimOwner, wake.baseVersion);
        const n = taskSchema.parse({
          ...t,
          work_disposition: "WAITING",
          wait_reasons: reasons,
          wait_reason: reasons[0].reason,
          current_pass_complete: passComplete,
          dependencies: dependencyList ?? t.dependencies,
        });
        await dependencies(n);
        const expired =
          t.policy_snapshot.deadline !== null &&
          Date.parse(t.policy_snapshot.deadline) <= Date.parse(deps.now());
        const exhausted =
          t.current_attempt_id !== null &&
          (await activeAttemptCount(t)) >= t.policy_snapshot.max_attempts;
        if (
          reasons.some(
            (r) =>
              r.policy_sha256 !== t.policy_sha256 ||
              (r.capability !== null &&
                !t.capability_requirements.includes(r.capability)),
          )
        )
          fail("INTELLIGENCE_WAIT_PINS");
        if (expired || exhausted || !(await deps.eligibleWait(t, reasons)))
          return saveTask(
            {
              ...n,
              work_disposition: "FAILED",
              wait_reason: null,
              wait_reasons: [],
              safe_reason: expired
                ? "DEADLINE_EXHAUSTED"
                : exhausted
                  ? "ATTEMPTS_EXHAUSTED"
                  : "UNSUPPORTED_WAIT",
            },
            revision,
          );
        if (json(n) === json(t)) return t;
        return saveTask(n, revision);
      });
    },
    finishPass(context: AccountRequestContext, id: string, revision: number) {
      return transaction(context, async () => {
        const t = await task(context.accountId, id);
        if (t.row_revision !== revision) fail("INTELLIGENCE_CAS");
        return saveTask({ ...t, current_pass_complete: true }, revision);
      });
    },
    fence(
      context: AccountRequestContext,
      id: string,
      revision: number,
      disposition: "CANCELED" | "STALE",
    ) {
      return transaction(context, async () => {
        const t = await task(context.accountId, id);
        if (t.row_revision !== revision || t.work_disposition === "PUBLISHED")
          fail("INTELLIGENCE_CAS");
        return saveTask(
          {
            ...t,
            work_disposition: disposition,
            publication_fence: t.publication_fence + 1,
            cancellation_disposition:
              disposition === "CANCELED" ? "FENCED" : t.cancellation_disposition,
          },
          revision,
        );
      });
    },
    reserveAttempt(
      context: AccountRequestContext,
      raw: Attempt,
      expectedTaskRevision?: number,
      wake?: SyncOperation,
    ) {
      return transaction(context, async () => {
        const a = attemptSchema.parse(raw),
          t = await task(context.accountId, a.task_id);
        if (
          expectedTaskRevision !== undefined &&
          (t.row_revision !== expectedTaskRevision ||
            t.sync_operation_id !== a.sync_operation_id)
        )
          fail("INTELLIGENCE_CAS");
        await pins(t, context);
        await dependencies(t);
        if (
          a.account_id !== t.account_id ||
          a.task_publication_fence !== t.publication_fence ||
          a.row_revision !== 1 ||
          a.execution_observation !== "NOT_STARTED" ||
          a.execution_outcome !== null ||
          a.response_sha256 !== null ||
          !a.policy_admission.allowed ||
          a.policy_admission.policy_sha256 !== t.policy_sha256 ||
          (await digest(a.policy_admission)) !== a.policy_admission_sha256 ||
          ["CANCELED", "STALE", "UNKNOWN", "PUBLISHED"].includes(t.work_disposition)
        )
          fail("INTELLIGENCE_ATTEMPT_FENCE");
        if (
          a.descriptor_snapshot.network_required &&
          t.policy_snapshot.privacy === "LOCAL_ONLY"
        )
          fail("INTELLIGENCE_PRIVACY");
        if (
          ["COMMERCIAL_REMOTE", "OTR_SELF_HOSTED"].includes(
            a.descriptor_snapshot.provider_class,
          ) &&
          (!a.integration_id ||
            !a.provider_config_id ||
            !a.configuration_sha256 ||
            !a.config_version ||
            !a.usage_correlation_id ||
            a.metering_disposition === "NOT_REQUIRED")
        )
          fail("INTELLIGENCE_REMOTE_BINDING");
        if (
          t.policy_snapshot.deadline &&
          Date.parse(t.policy_snapshot.deadline) <= Date.parse(deps.now())
        )
          fail("INTELLIGENCE_DEADLINE");
        const existing = await db.getFirstAsync(
          "SELECT attempt_id FROM intelligence_continuation_attempts WHERE account_id=? AND attempt_id=?",
          a.account_id,
          a.attempt_id,
        );
        if (existing) {
          const prior = await attempt(a.account_id, a.attempt_id);
          const mutable = new Set<string>(attemptMutableColumns);
          if (
            json(
              Object.fromEntries(Object.entries(prior).filter(([k]) => !mutable.has(k))),
            ) !==
            json(Object.fromEntries(Object.entries(a).filter(([k]) => !mutable.has(k))))
          )
            fail("INTELLIGENCE_CHANGED_ATTEMPT");
          return prior;
        }
        await queue(t, a.sync_operation_id, true, wake?.claimOwner, wake?.baseVersion);
        if (wake) await validateIntelligenceWake(wake, deps.sha256);
        if (
          (!a.shadow &&
            (await activeAttemptCount(t)) >= t.policy_snapshot.max_attempts) ||
          a.attempt_sequence > 64
        )
          fail("INTELLIGENCE_ATTEMPT_BOUND");
        if (t.current_attempt_id && !a.shadow) {
          const previous = await attempt(t.account_id, t.current_attempt_id);
          if (
            previous.execution_observation !== "TERMINAL" ||
            previous.result_install_disposition === "PENDING" ||
            !["COMPLETE", "NOT_REQUIRED"].includes(previous.metering_disposition) ||
            a.predecessor_attempt_id !== previous.attempt_id ||
            a.predecessor_request_id !== previous.request_id
          )
            fail("INTELLIGENCE_UNSAFE_RETRY");
        }
        if (
          t.capability_requirements.some(
            (c) => !a.descriptor_snapshot.capabilities.includes(c),
          )
        )
          fail("INTELLIGENCE_CAPABILITY");
        if (
          t.policy_snapshot.privacy === "OTR_ONLY" &&
          a.descriptor_snapshot.provider_class === "COMMERCIAL_REMOTE"
        )
          fail("INTELLIGENCE_PRIVACY");
        if (
          await db.getFirstAsync(
            "SELECT attempt_id FROM intelligence_continuation_attempts WHERE account_id=? AND (request_id=? OR idempotency_key=?)",
            a.account_id,
            a.request_id,
            a.idempotency_key,
          )
        )
          fail("INTELLIGENCE_CHANGED_ATTEMPT");
        await deps.validateAttemptAdmission(
          t,
          a,
          t.current_attempt_id ? await attempt(t.account_id, t.current_attempt_id) : null,
        );
        if (a.shadow) {
          if (!a.shadow_of_attempt_id) fail("INTELLIGENCE_SHADOW");
        }
        await insert("intelligence_continuation_attempts", a, attemptJsonColumns);
        if (!a.shadow)
          await saveTask(
            {
              ...t,
              current_attempt_id: a.attempt_id,
              sync_operation_id: a.sync_operation_id,
              work_disposition: "RUNNING",
              wait_reason: null,
              wait_reasons: [],
            },
            t.row_revision,
          );
        return a;
      });
    },
    observeAttempt(
      context: AccountRequestContext,
      id: string,
      revision: number,
      observation: Pick<
        Attempt,
        | "execution_observation"
        | "execution_outcome"
        | "metering_disposition"
        | "response_material_reference"
        | "response_material_sha256"
        | "response_sha256"
        | "reported_usage_summary"
      >,
      recoveryDigest?: string,
    ) {
      return transaction(context, async () => {
        const a = await attempt(context.accountId, id),
          t = await task(context.accountId, a.task_id);
        if (
          a.row_revision !== revision ||
          (a.execution_observation === "TERMINAL" &&
            (observation.execution_observation !== "TERMINAL" ||
              observation.execution_outcome !== a.execution_outcome)) ||
          (a.execution_observation === "UNKNOWN" &&
            observation.execution_observation !== "UNKNOWN" &&
            (observation.execution_observation !== "TERMINAL" ||
              !recoveryDigest ||
              !/^[a-f0-9]{64}$/.test(recoveryDigest))) ||
          (a.execution_observation === "NOT_STARTED" &&
            observation.execution_observation === "TERMINAL") ||
          (a.execution_observation === "RUNNING" &&
            observation.execution_observation === "NOT_STARTED")
        )
          fail("INTELLIGENCE_EXECUTION_TRANSITION");
        if (
          a.execution_observation === "UNKNOWN" &&
          observation.execution_observation === "TERMINAL"
        )
          await deps.verifyRecovery(a, recoveryDigest!);
        if (
          observation.execution_observation === "RUNNING" &&
          (t.publication_fence !== a.task_publication_fence ||
            t.cancellation_disposition !== "NONE")
        )
          fail("INTELLIGENCE_EXECUTION_FENCE");
        if (
          observation.execution_observation === "RUNNING" &&
          a.integration_id &&
          observation.metering_disposition !== "START_DURABLE"
        )
          fail("INTELLIGENCE_START_NOT_DURABLE");
        if (
          (a.response_sha256 !== null &&
            a.response_sha256 !== observation.response_sha256) ||
          (a.response_material_reference !== null &&
            (a.response_material_reference !== observation.response_material_reference ||
              a.response_material_sha256 !== observation.response_material_sha256))
        )
          fail("INTELLIGENCE_RESULT_IMMUTABLE");
        const n = await saveAttempt(
          {
            ...a,
            ...observation,
            result_install_disposition: a.shadow
              ? "SHADOW_ONLY"
              : observation.response_sha256 && a.result_install_disposition === "NONE"
                ? "PENDING"
                : a.result_install_disposition,
          },
          revision,
        );
        if (
          !a.shadow &&
          t.current_attempt_id === a.attempt_id &&
          !["CANCELED", "STALE", "PUBLISHED"].includes(t.work_disposition)
        )
          await saveTask(
            {
              ...t,
              work_disposition: observation.response_sha256
                ? "RESULT_PENDING"
                : observation.execution_observation === "UNKNOWN"
                  ? "UNKNOWN"
                  : t.work_disposition,
            },
            t.row_revision,
          );
        return n;
      });
    },
    installResult(
      context: AccountRequestContext,
      id: string,
      revision: number,
      publicationId: string,
      publicationDigest: string,
      install: (task: Task, attempt: Attempt) => Promise<void>,
    ) {
      return transaction(context, async () => {
        const a = await attempt(context.accountId, id),
          t = await task(context.accountId, a.task_id);
        if (a.shadow) fail("INTELLIGENCE_SHADOW_NO_INSTALL");
        if (
          a.row_revision !== revision ||
          t.current_attempt_id !== a.attempt_id ||
          a.execution_observation !== "TERMINAL" ||
          !["SUCCEEDED", "PARTIAL"].includes(a.execution_outcome ?? "") ||
          !a.response_sha256
        )
          fail("INTELLIGENCE_INSTALL_FENCE");
        if (
          a.task_publication_fence !== t.publication_fence ||
          ["CANCELED", "STALE"].includes(t.work_disposition)
        ) {
          return saveAttempt(
            {
              ...a,
              result_install_disposition:
                t.work_disposition === "CANCELED"
                  ? "REJECTED_CANCELED"
                  : "REJECTED_STALE",
            },
            revision,
          );
        }
        await pins(t, context);
        if (t.publication_id) {
          if (
            t.publication_id !== publicationId ||
            t.publication_sha256 !== publicationDigest ||
            t.result_sha256 !== a.response_sha256
          )
            fail("INTELLIGENCE_CHANGED_PUBLICATION");
          return a;
        }
        await install(t, a);
        await saveTask(
          {
            ...t,
            work_disposition: "PUBLISHED",
            current_pass_complete: true,
            publication_id: publicationId,
            publication_sha256: publicationDigest,
            result_sha256: a.response_sha256,
            completed_at: deps.now(),
          },
          t.row_revision,
        );
        return saveAttempt(
          {
            ...a,
            result_install_disposition: "INSTALLED",
            publication_sha256: publicationDigest,
          },
          revision,
        );
      });
    },
    recoveryDisposition(context: AccountRequestContext, id: string) {
      return transaction(context, async () => {
        const t = await task(context.accountId, id);
        if (!t.current_attempt_id) return "NO_ATTEMPT" as const;
        const a = await attempt(context.accountId, t.current_attempt_id);
        if (
          a.execution_observation === "RUNNING" ||
          a.execution_observation === "UNKNOWN"
        )
          return "EXACT_RECOVERY_REQUIRED" as const;
        if (a.response_sha256 && a.result_install_disposition !== "INSTALLED")
          return "INSTALL_ONLY" as const;
        return a.execution_observation === "NOT_STARTED"
          ? ("UNDISPATCHED" as const)
          : ("TERMINAL" as const);
      });
    },
  };
}
