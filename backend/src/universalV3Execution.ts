import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
import { createUniversalV3Intake, universalV3TaskId } from "./universalV3Intake";
import { runUniversalV3Wake } from "./universalV3Wake";
import { readExactTaskWake } from "./universalMixedBTaskReservation";
import { createFlightHttpsSend } from "./flightHttpsTransport";
import { createFlightPrivateCustody } from "./flightPrivateCustody";
import type { UniversalV3Intake } from "./universalV3Intake";
import {
  initializeUniversalTaskDatabase,
  type universalTaskDatabase,
} from "./universalTaskBootstrap";
import { readUniversalV3StoreConfig } from "./universalContinuousConfig";
import {
  extractUniversalV3Pdf,
  normalizeUniversalV3Image,
  universalV3DecodersPresent,
} from "./universalV3Decoders";
import { createSupabaseDevGateway } from "./supabaseGateway";
import { isNormalAccount } from "./authAccountQualification";
import { persistenceDigest } from "./externalIntegrationPersistence";
import type { UniversalProviderCustody } from "./universalDeepSeekProvider";
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
  ordinaryProvider?: () => string | undefined;
  provision(
    scope: Scope,
    request: Request,
    write: boolean,
  ): Promise<{
    assertCurrent(): Promise<void>;
    selectProvider?(): Promise<z.infer<typeof universalContinuousSelectionSchema>>;
    persistence?: Pick<
      Persistence,
      "gateway" | "connection" | "environment" | "costGuardEnabled"
    >;
  }>;
  send?: ReturnType<typeof createFlightHttpsSend>;
}) {
  // Backpressure only. Durable claim and once-only authority stay with Task/Wake.
  const active = new Set<string>();
  const accountWork = new Set<string>();

  async function current(scope: Scope, request: Request, write = false) {
    const ownership = await deps.provision(scope, request, write);
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
    ordinary: deps.ordinaryProvider !== undefined,
    async available(scope: Scope, request: Request) {
      const owner = await current(scope, request, true);
      if (deps.ordinaryProvider) return Boolean(deps.ordinaryProvider());
      await owner.ownership.selectProvider!();
      return true;
    },
    async start(scope: Scope, request: Request) {
      const owner = await current(scope, request, true);
      if (deps.ordinaryProvider && !deps.ordinaryProvider()) return;
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
        const selection = deps.ordinaryProvider
          ? undefined
          : await owner.ownership.selectProvider!();
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
            const lifecycle =
              selection &&
              createUniversalPersistenceHost({
                ...owner.ownership.persistence!,
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
            const ordinaryProvider = deps.ordinaryProvider;
            const custody = lifecycle
              ? lifecycle.custody
              : ordinaryV3Custody(
                  deps.stores,
                  scope,
                  owner.taskId,
                  draft.attempt.usage_correlation_id!,
                  draft.requestSha256,
                  ordinaryProvider!,
                );
            const result = await runUniversalV3Wake({
              context: owner.context,
              repository: owner.repository,
              wake: operation,
              manifest: retained.manifest,
              draft,
              provider: {
                custody,
                allowMissingUsage: ordinaryProvider !== undefined,
                priceSchedule: await lifecycle?.priceSchedule(),
                costGuardDisabled:
                  ordinaryProvider !== undefined ||
                  owner.ownership.persistence?.costGuardEnabled === false,
              },
              send: deps.send ?? createFlightHttpsSend(),
              assertCurrent: owner.ownership.assertCurrent,
              assertDurableStart:
                lifecycle?.assertDurableStart ??
                (async (attempt, task) => {
                  const retained = await snapshot(owner);
                  const claimed = await readExactTaskWake(deps.db, operation.id, {
                    ...scope,
                    taskId: task.task_id,
                  });
                  if (
                    !retained ||
                    retained.task.manifest_sha256 !== draft.task.manifest_sha256 ||
                    retained.task.publication_fence !== task.publication_fence ||
                    retained.task.current_attempt_id !== attempt.attempt_id ||
                    retained.attempts.length !== 1 ||
                    persistenceDigest(retained.attempts[0]) !==
                      persistenceDigest(attempt) ||
                    attempt.request_sha256 !== draft.requestSha256 ||
                    claimed?.status !== "PROCESSING" ||
                    !claimed.claimOwner ||
                    claimed.claimOwner !== operation.claimOwner
                  )
                    throw Error("UNIVERSAL_V3_START_NOT_DURABLE");
                }),
              ...(lifecycle && {
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
              }),
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

function ordinaryV3Custody(
  stores: Awaited<ReturnType<typeof createFlightPrivateCustody>>,
  scope: Scope,
  taskId: string,
  callId: string,
  requestSha256: string,
  providerKey: () => string | undefined,
): UniversalProviderCustody {
  function matches(input: { accountId: string; taskId: string; requestSha256: string }) {
    return (
      input.accountId === scope.accountId &&
      input.taskId === taskId &&
      input.requestSha256 === requestSha256
    );
  }
  return {
    async acquire(input) {
      if (
        !matches(input) ||
        input.actorId !== scope.accountId ||
        input.tripId !== scope.tripId ||
        input.batchId !== scope.analysisId
      )
        return null;
      const secret = providerKey();
      if (!secret) return null;
      return {
        secret,
        async assertCurrent() {
          if (providerKey() !== secret) throw Error("UNIVERSAL_CREDENTIAL_CHANGED");
        },
      };
    },
    async retainResponse(input) {
      if (!matches(input) || sha(input.bytes) !== input.responseSha256)
        throw Error("UNIVERSAL_RAW_BINDING_INVALID");
      const pin = {
        reference: callId,
        sha256: input.responseSha256,
        byteCount: input.bytes.length,
      };
      await stores.custody.put({
        accountId: scope.accountId,
        reservationId: callId,
        sha256: pin.sha256,
        byteCount: pin.byteCount,
        bytes: input.bytes,
      });
      await stores.retainRaw(scope.accountId, callId, pin, {
        version: 1,
        taskId,
        requestSha256,
        httpStatus: input.httpStatus,
      });
    },
    async settle(input) {
      if (!matches(input) || input.costNanos !== null)
        throw Error("UNIVERSAL_RAW_BINDING_INVALID");
      const raw = await stores.readRaw(scope.accountId, callId);
      if (
        raw.pin.reference !== callId ||
        raw.pin.sha256 !== input.responseSha256 ||
        persistenceDigest(raw.binding) !==
          persistenceDigest({
            version: 1,
            taskId,
            requestSha256,
            httpStatus: 200,
          })
      )
        throw Error("UNIVERSAL_RAW_BINDING_INVALID");
      const bytes = await stores.custody.read({ ...raw.pin, accountId: scope.accountId });
      if (sha(bytes) !== input.responseSha256)
        throw Error("UNIVERSAL_RAW_BINDING_INVALID");
    },
  };
}

export async function loadUniversalV3Runtime(env: Record<string, string | undefined>) {
  if (env.OTR_DEV_UNIVERSAL_CONTINUOUS_HOST !== "v3") return undefined;
  const config = await readUniversalV3StoreConfig(env);
  const providerKey = () => {
    const value = env.OTR_DEV_DEEPSEEK_API_KEY;
    return value &&
      /^[\x21-\x7e]{1,8192}$/.test(value) &&
      (env.OTR_DEV_DEEPSEEK_MODEL ?? "deepseek-flash") === "deepseek-flash"
      ? value
      : undefined;
  };
  if (!providerKey() || !(await universalV3DecodersPresent()))
    throw Error("UNIVERSAL_V3_RUNTIME_CLOSED");
  const gateway = createSupabaseDevGateway({
    url: env.OTR_DEV_SUPABASE_URL!,
    publishableKey: env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY ?? "",
    secretKey: env.OTR_DEV_SUPABASE_SECRET_KEY ?? "",
  });
  const stores = await createFlightPrivateCustody(config.directory, config.identity);
  let sql: DatabaseSync | undefined;
  let closed = false;
  const check = async () => {
    const file = await lstat(config.taskDatabase);
    if (
      !file.isFile() ||
      file.uid !== process.getuid?.() ||
      (file.mode & 0o777) !== 0o600 ||
      file.nlink !== 1
    )
      throw Error("UNIVERSAL_TASK_DATABASE_CLOSED");
    return file;
  };
  async function close() {
    if (closed) return;
    closed = true;
    sql?.close();
    await stores.close();
  }
  try {
    const before = await check();
    sql = new DatabaseSync(config.taskDatabase);
    const after = await check();
    if (before.ino !== after.ino || before.dev !== after.dev)
      throw Error("UNIVERSAL_TASK_DATABASE_CHANGED");
    const requiredTables = sql
      .prepare(
        "SELECT count(*) AS count FROM sqlite_schema WHERE type='table' AND name IN ('intelligence_continuations','intelligence_continuation_attempts','sync_operations')",
      )
      .get();
    if (requiredTables?.count !== 3) throw Error("UNIVERSAL_TASK_DATABASE_CLOSED");
    const db = initializeUniversalTaskDatabase(sql);
    const intake = createUniversalV3Intake(
      db,
      join(config.directory, "universal-v3-spool"),
    );
    const execution = createUniversalV3Execution({
      intake,
      db,
      stores,
      validateImage: normalizeUniversalV3Image,
      extractPdf: extractUniversalV3Pdf,
      ordinaryProvider: providerKey,
      async provision(scope, request, write) {
        const token = /^Bearer ([^\s]+)$/i.exec(
          request.headers.get("Authorization") ?? "",
        )?.[1];
        return {
          async assertCurrent() {
            if (closed || !token || env.OTR_DEV_UNIVERSAL_CONTINUOUS_HOST !== "v3")
              throw Error("UNIVERSAL_AUTH_REQUIRED");
            const user = await gateway.validateAccessToken(token);
            const allowed = write ? gateway.canWriteTrip : gateway.canReadTrip;
            if (
              user?.id !== scope.accountId ||
              !isNormalAccount(user) ||
              !(await allowed.call(gateway, scope.accountId, scope.tripId)) ||
              closed
            )
              throw Error("UNIVERSAL_AUTH_REJECTED");
            const retained = await check();
            if (retained.ino !== before.ino || retained.dev !== before.dev)
              throw Error("UNIVERSAL_TASK_DATABASE_CHANGED");
          },
        };
      },
    });
    return { intake, execution, close };
  } catch (error) {
    await close();
    throw error;
  }
}
