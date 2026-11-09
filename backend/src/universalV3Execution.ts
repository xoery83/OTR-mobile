import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import {
  createIntelligenceWakeQueue,
  createSyncOperationRepository,
} from "../../src/data/sync/syncOperationRepository";
import {
  universalV3Candidate,
  type UniversalV3ExecutionStatus,
} from "../../src/data/api/universalV3Contracts";
import { createUniversalPersistenceHost } from "./universalPersistenceHost";
import { prepareUniversalV3Materials } from "./universalV3Materials";
import { buildUniversalV3TaskDraft } from "./universalV3TaskDraft";
import { universalV3TaskId } from "./universalV3Intake";
import { runUniversalV3Wake } from "./universalV3Wake";
import { readExactTaskWake } from "./universalMixedBTaskReservation";
import { createFlightHttpsSend } from "./flightHttpsTransport";
import type { createFlightPrivateCustody } from "./flightPrivateCustody";
import type { UniversalV3Intake } from "./universalV3Intake";
import type { universalTaskDatabase } from "./universalTaskBootstrap";
import type { universalContinuousSelectionSchema } from "./universalRegisteredTaskDraft";
import type { Task } from "../../src/domain/intelligence/persistence";

type Scope = { accountId: string; tripId: string; analysisId: string };
type Persistence = Parameters<typeof createUniversalPersistenceHost>[0];
const now = () => new Date().toISOString();
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function createUniversalV3Execution(deps: {
  intake: UniversalV3Intake;
  db: ReturnType<typeof universalTaskDatabase>;
  stores: Awaited<ReturnType<typeof createFlightPrivateCustody>>;
  validateImage: Parameters<typeof prepareUniversalV3Materials>[2];
  extractPdf?: Parameters<typeof prepareUniversalV3Materials>[3];
  provision(
    scope: Scope,
    request: Request,
  ): Promise<{
    assertCurrent(): Promise<void>;
    selectProvider(): Promise<z.infer<typeof universalContinuousSelectionSchema>>;
    persistence: Pick<
      Persistence,
      "gateway" | "connection" | "environment" | "costGuardEnabled"
    >;
  }>;
  send?: ReturnType<typeof createFlightHttpsSend>;
}) {
  // Backpressure only. Durable claim and once-only authority stay with Task/Wake.
  const active = new Set<string>();
  const accountWork = new Set<string>();

  async function current(scope: Scope, request: Request) {
    const ownership = await deps.provision(scope, request);
    await ownership.assertCurrent();
    const getAccountId = async () => scope.accountId;
    const context = await captureAccountRequestContext(scope.tripId, getAccountId);
    const taskId = universalV3TaskId(scope);
    const repository = createIntelligenceContinuationRepository(deps.db, {
      getAccountId,
      now,
      sha256: async (bytes) => sha(bytes),
      async validateAdmission(task: Task) {
        if (
          task.task_id !== taskId ||
          task.account_id !== scope.accountId ||
          task.trip_id !== scope.tripId ||
          task.import_id !== scope.analysisId
        )
          throw Error("UNIVERSAL_V3_TASK_SCOPE");
      },
      validateImportIntakePins: deps.intake.validateImportIntakePins,
      async validateAttemptAdmission(task, attempt, previous) {
        if (
          previous ||
          task.task_id !== attempt.task_id ||
          attempt.attempt_sequence !== 1 ||
          !attempt.usage_correlation_id ||
          attempt.shadow
        )
          throw Error("UNIVERSAL_V3_ATTEMPT_SCOPE");
      },
      async eligibleWait() {
        return false;
      },
      async verifyRecovery() {
        throw Error("UNIVERSAL_V3_RECONCILE_ONLY");
      },
    });
    return { ownership, context, taskId, repository, getAccountId };
  }
  async function snapshot(owner: Awaited<ReturnType<typeof current>>) {
    try {
      return await owner.repository.snapshot(owner.context, owner.taskId);
    } catch (error) {
      if (error instanceof Error && error.message === "INTELLIGENCE_TASK_NOT_FOUND")
        return null;
      throw error;
    }
  }
  async function read(
    scope: Scope,
    request: Request,
  ): Promise<UniversalV3ExecutionStatus | null> {
    const owner = await current(scope, request);
    const value = await snapshot(owner);
    if (!value) {
      const intake = await deps.intake.read(scope);
      if (!intake) return null;
      return intake.missingFiles.length
        ? { state: "WAITING_INPUT", missingFiles: intake.missingFiles }
        : { state: "NEEDS_ACTION" };
    }
    const { task, attempts } = value;
    const attempt = attempts[0];
    const taskId = owner.taskId;
    if (task.work_disposition === "PUBLISHED") {
      if (
        !attempt ||
        attempt.result_install_disposition !== "INSTALLED" ||
        task.result_sha256 !== attempt.response_material_sha256
      )
        throw Error("UNIVERSAL_V3_PUBLICATION_INTEGRITY");
      const pin = await deps.stores.retained.read(attempt);
      if (
        !pin ||
        pin.reference !== attempt.response_material_reference ||
        pin.sha256 !== task.result_sha256
      )
        throw Error("UNIVERSAL_V3_PUBLICATION_INTEGRITY");
      const bytes = await deps.stores.custody.read({
        ...pin,
        accountId: scope.accountId,
      });
      if (sha(bytes) !== pin.sha256) throw Error("UNIVERSAL_V3_PUBLICATION_INTEGRITY");
      const candidates = z
        .object({ candidates: z.array(universalV3Candidate).max(32) })
        .parse(JSON.parse(Buffer.from(bytes).toString("utf8"))).candidates;
      await owner.ownership.assertCurrent();
      return { state: "REVIEW_READY", taskId, candidates };
    }
    if (active.has(taskId)) return { state: "PROCESSING", taskId };
    if (attempt || task.work_disposition === "UNKNOWN")
      return { state: "OUTCOME_UNKNOWN", taskId };
    const intake = await deps.intake.read(scope);
    return intake?.missingFiles.length
      ? { state: "WAITING_INPUT", missingFiles: intake.missingFiles }
      : { state: "NEEDS_ACTION" };
  }
  return {
    read,
    async available(scope: Scope, request: Request) {
      const owner = await current(scope, request);
      await owner.ownership.selectProvider();
      return true;
    },
    async start(scope: Scope, request: Request) {
      const owner = await current(scope, request);
      if (
        active.has(owner.taskId) ||
        accountWork.has(scope.accountId) ||
        active.size >= 2
      )
        return;
      const previous = await snapshot(owner);
      if (previous?.attempts.length || previous?.task.work_disposition === "PUBLISHED")
        return;
      const retained = await deps.intake.load(scope);
      if (!retained) return;
      const status = await deps.intake.read(scope);
      if (!status || status.missingFiles.length) return;
      if (
        active.has(owner.taskId) ||
        accountWork.has(scope.accountId) ||
        active.size >= 2
      )
        return;
      active.add(owner.taskId);
      accountWork.add(scope.accountId);
      let launched = false;
      const release = () => {
        active.delete(owner.taskId);
        accountWork.delete(scope.accountId);
      };
      try {
        const selection = await owner.ownership.selectProvider();
        const sources = await prepareUniversalV3Materials(
          retained.manifest,
          retained.readFile,
          deps.validateImage,
          deps.extractPdf,
        );
        const draft = await buildUniversalV3TaskDraft(
          scope,
          retained.manifest,
          sources,
          selection,
          retained.acceptedAt,
        );
        await owner.ownership.assertCurrent();
        if (Date.parse(draft.task.policy_snapshot.deadline!) <= Date.now()) return;
        await owner.repository.create(owner.context, draft.task);
        let wake = await readExactTaskWake(deps.db, draft.wakeId);
        if (!wake) {
          await owner.repository.scheduleWake(owner.context, owner.taskId);
          wake = await readExactTaskWake(deps.db, draft.wakeId);
        }
        if (!wake) throw Error("UNIVERSAL_V3_WAKE_MISSING");
        if (
          wake.status === "PROCESSING" &&
          wake.leaseExpiresAt &&
          Date.parse(wake.leaseExpiresAt) <= Date.now()
        ) {
          await createSyncOperationRepository(deps.db, owner.getAccountId, now, {
            accountId: scope.accountId,
            tripId: scope.tripId,
            operationId: wake.id,
          }).recoverInterrupted();
          wake = await readExactTaskWake(deps.db, draft.wakeId);
        }
        if (!wake) return;
        const queue = createIntelligenceWakeQueue(deps.db, {
          getAccountId: owner.getAccountId,
          now,
          sha256: async (bytes) => sha(bytes),
        });
        if (!(await queue.claim(owner.context, wake, "universal-v3-" + randomUUID())))
          return;
        const operation = wake;
        launched = true;
        void (async () => {
          try {
            const lifecycle = createUniversalPersistenceHost({
              ...owner.ownership.persistence,
              stores: deps.stores,
              localFirst: true,
              continuous: {
                priceScheduleId: selection.priceScheduleId,
                providerRequestSha256: draft.requestSha256,
              },
              attempt: draft.attempt,
              requestMaterialByteCount: draft.marker.length,
              async currentTask() {
                await owner.ownership.assertCurrent();
                const value = await snapshot(owner);
                if (!value) throw Error("UNIVERSAL_V3_TASK_SCOPE");
                return value.task;
              },
            });
            const result = await runUniversalV3Wake({
              context: owner.context,
              repository: owner.repository,
              wake: operation,
              manifest: retained.manifest,
              draft,
              provider: {
                custody: lifecycle.custody,
                priceSchedule: await lifecycle.priceSchedule(),
                costGuardDisabled: owner.ownership.persistence.costGuardEnabled === false,
              },
              send: deps.send ?? createFlightHttpsSend(),
              assertCurrent: owner.ownership.assertCurrent,
              assertDurableStart: lifecycle.assertDurableStart,
              assertCompletion(result, attempt, task) {
                return lifecycle.assertCompletion(
                  {
                    providerOutcome: "SETTLED",
                    providerReceipt: {
                      requestId: result.providerReceipt.requestId,
                      requestSha256: result.providerReceipt.requestSha256 ?? null,
                      responseSha256: result.providerReceipt.responseSha256,
                      usage: result.providerReceipt.usage,
                      costNanos: result.providerReceipt.costNanos ?? null,
                    },
                  },
                  attempt,
                  task,
                );
              },
              async retainPublication(attempt, bytes, digest) {
                const pin = {
                  reference: attempt.attempt_id,
                  sha256: digest,
                  byteCount: bytes.length,
                };
                await deps.stores.custody.put({
                  accountId: scope.accountId,
                  reservationId: pin.reference,
                  sha256: digest,
                  byteCount: bytes.length,
                  bytes,
                });
                await deps.stores.retained.put(attempt, pin);
              },
            });
            if (result === "PUBLISHED" || result === "RECONCILE_ONLY")
              await deps.intake.discardFiles(scope);
            await queue.settle(owner.context, operation);
          } catch {
            // Retain durable state and allow read-only inspection; never repeat an Attempt.
            await queue
              .settle(owner.context, operation, Error("UNIVERSAL_V3_EXECUTION_FAILED"))
              .catch(() => {});
          } finally {
            release();
          }
        })();
      } finally {
        if (!launched) release();
      }
    },
  };
}

export type UniversalV3Execution = ReturnType<typeof createUniversalV3Execution>;
