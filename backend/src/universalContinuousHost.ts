import type { DatabaseSync } from "node:sqlite";
import {
  assertMixedBClaimCurrent,
  assertMixedBTaskStaged,
  claimMixedBTaskWake,
  readProtectedMixedBReservation,
  readMixedBRunBeginState,
  spendMixedBRunBegin,
  recoverMixedBTaskWake,
  mixedBInitialDigest,
  mixedBInitialManifestSchema,
  type MixedBAttemptPhase,
  type MixedBInitialManifest,
} from "./universalMixedBTaskReservation";
import { projectUniversalTaskActivity } from "./universalTaskActivity";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import { createHash } from "node:crypto";
import type { AccountRequestContext } from "../../src/data/auth/accountRequestContext";
import type { SyncOperation } from "../../src/data/sync/syncOperationRepository";
import {
  createIntelligenceContinuationRepository,
  type ContinuationDatabase,
} from "../../src/data/repositories/intelligenceContinuationRepository";
import {
  taskMutableColumns,
  attemptMutableColumns,
  type Task,
  type Attempt,
} from "../../src/domain/intelligence/persistence";
import { ledgerBootstrapResponseSchema } from "../../src/data/api/ledgerReadContracts";
import type { PublicationCatalogConnection } from "./tripPublicationCatalogRead";
import {
  createUniversalBatchSource,
  universalProviderBatchContext,
  universalProviderOwningContext,
  type UniversalProviderBatchContext,
  type UniversalRunBinding,
} from "./universalBatchSource";
import type { UniversalSourceTask, UniversalSourceMetadata } from "./universalSourceRead";
import {
  type UniversalManifest,
  type UniversalMaterialReady,
  prepareUniversalDispatch,
  UNIVERSAL_IMPORT_VERSION,
  type UniversalResult,
} from "./universalImport";
import { createUniversalSourceReader } from "./universalSourceRead";
import { universalBindingDiagnostic } from "./universalBindingDiagnostic";
import {
  buildUniversalRegisteredTaskDraft,
  type universalContinuousSelectionSchema,
} from "./universalRegisteredTaskDraft";
import {
  bindOrdinaryUniversalTaskWake,
  bootstrapUniversalTask,
  universalTaskDatabase,
} from "./universalTaskBootstrap";
import {
  createUniversalBackendRuntime,
  type UniversalRuntimeProvisioning,
} from "./universalRuntime";
import { createUniversalContinuationHost } from "./universalContinuationHost";
import { readUniversalCatalog } from "./universalCatalog";
import { persistenceDigest } from "./externalIntegrationPersistence";
import { recoverSettledUniversalTask } from "./universalSettledRecovery";
import { createUniversalTaskReceiptChecks } from "./universalTaskReceipt";
import type { UniversalPriceSchedule } from "./universalDeepSeekProvider";
import { ZodError, z } from "zod";
import {
  assertMixedBTaskFence,
  createUniversalOriginalSourceConnection,
  type MixedBPristineSource,
} from "./universalOriginalSource";
import { readRetainedPngReceipt } from "./universalRetainedPngRead";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const immutable = (value: Task | Attempt, mutable: readonly string[]) =>
  persistenceDigest(
    Object.fromEntries(Object.entries(value).filter(([k]) => !mutable.includes(k))),
  );
type Runtime = Pick<
  UniversalRuntimeProvisioning,
  | "stores"
  | "sourceConnection"
  | "taskReceiptConnection"
  | "readBinary"
  | "gateway"
  | "environment"
>;
export type UniversalPublishedResult = {
  result: UniversalResult;
  resultSha256: string;
  runId: string;
  taskRowRevision: number;
  publicationFence: number;
};
// Per verified normal Auth/Trip context. All work remains in existing Backend Task
// SQLite/WakeQueue and protected Source/Provider authorities. No timer or parallel queue.
export function createUniversalContinuousHost(deps: {
  enabled?: boolean;
  finiteBatch?: ReturnType<typeof universalProviderBatchContext>;
  finiteDeadline?: string;
  // Trusted exact B scope only. The default loader has no forward enrollment.
  mixedBInitial?: MixedBInitialManifest;
  mixedBPristineSource?: MixedBPristineSource;
  mixedBForwardRecovery?: {
    taskDatabase: DatabaseSync;
    materialInputSha256: string;
    assertConfigCurrent(): void;
  };
  context: AccountRequestContext;
  assertCurrentAuth(): Promise<void>;
  assertNewExecutionAllowed?(): void;
  db: ReturnType<typeof universalTaskDatabase>;
  catalogConnection: PublicationCatalogConnection;
  bootstrapLedger(): Promise<unknown>;
  selectProvider(
    binding: UniversalProviderBatchContext,
  ): Promise<z.infer<typeof universalContinuousSelectionSchema>>;
  runtime: Runtime & {
    stores: Runtime["stores"] &
      Pick<
        Awaited<
          ReturnType<typeof import("./flightPrivateCustody").createFlightPrivateCustody>
        >,
        "readRaw"
      >;
  };
  sourceReadRequestId?: string;
  retainedResultsEnabled?: boolean;
  publishedSource?: {
    lookup(
      actor: string,
      trip: string,
      batch: string,
    ): Promise<UniversalRunBinding | null>;
    readManifest(task: Readonly<UniversalSourceTask>): Promise<UniversalManifest>;
    withRetainedMetadata?<T>(
      task: Readonly<UniversalSourceTask>,
      read: (snapshot: UniversalSourceMetadata) => Promise<T>,
    ): Promise<T>;
  };
  readAdmittedPrice(task: Task, attempt: Attempt): Promise<UniversalPriceSchedule | undefined>;
}) {
  const context = Object.freeze({ ...deps.context }),
    actor = context.accountId,
    trip = context.tripId;
  const mixedBInitial =
    deps.mixedBInitial && mixedBInitialManifestSchema.parse(deps.mixedBInitial);
  if (mixedBInitial && (mixedBInitial.actorId !== actor || mixedBInitial.tripId !== trip))
    throw Error("MIXED_B_INITIAL_BINDING");
  const forward = deps.mixedBForwardRecovery;
  if (
    forward &&
    (!mixedBInitial ||
      !deps.finiteBatch ||
      !deps.finiteDeadline ||
      universalTaskDatabase(forward.taskDatabase) !== deps.db)
  )
    throw Error("MIXED_B_FORWARD_CONFIG_BINDING");
  const mixedBOwner =
    forward && mixedBInitial && deps.finiteDeadline
      ? createUniversalOriginalSourceConnection(deps.runtime.sourceConnection, hash, {
          mixedBInitial: {
            manifest: mixedBInitial,
            taskDb: forward.taskDatabase,
            assertCurrent: assertMixedBForwardCurrent,
            expectedMaterial: {
              inputSha256: forward.materialInputSha256,
              expiresAt: deps.finiteDeadline,
            },
          },
        })
      : undefined;

  const current = async () => {
    if (deps.enabled !== true) throw Error("UNIVERSAL_CONTINUOUS_CLOSED");
    await deps.assertCurrentAuth();
  };
  const assertNewExecutionCurrent = () => {
    if (deps.enabled !== true) throw Error("UNIVERSAL_CONTINUOUS_CLOSED");
    deps.assertNewExecutionAllowed?.();
  };
  const executionCurrent = async () => {
    await current();
    assertNewExecutionCurrent();
  };
  const source = createUniversalBatchSource({
    enabled: deps.enabled,
    finiteBatch: deps.finiteBatch,
    connection: deps.runtime.sourceConnection,
    authorize: async (a, t) => {
      if (a !== actor || t !== trip) throw Error("SOURCE_ACCESS_DENIED");
      await current();
    },
  });
  const sourceReader = createUniversalSourceReader({
    connection: deps.runtime.sourceConnection,
    continuous: !deps.finiteBatch,
    diagnosticRequestId: deps.sourceReadRequestId,
    readBinary: deps.runtime.readBinary,
  });
  const readManifest = deps.publishedSource?.readManifest ?? sourceReader;
  const withRetainedMetadata = deps.publishedSource
    ? deps.publishedSource.withRetainedMetadata?.bind(deps.publishedSource)
    : sourceReader.withRetainedMetadata;
  const repository = (
    expected?: Task,
    admitted?: Attempt,
    db: ContinuationDatabase = deps.db,
  ) =>
    createIntelligenceContinuationRepository(db, {
      getAccountId: async () => actor,
      now: () => new Date().toISOString(),
      sha256: hash,
      async validateAdmission(value) {
        if (
          !expected ||
          immutable(value, taskMutableColumns) !== immutable(expected, taskMutableColumns)
        )
          throw Error("UNIVERSAL_TASK_CHANGED");
      },
      async validateAttemptAdmission(_t, a, p) {
        if (
          !admitted ||
          p ||
          immutable(a, attemptMutableColumns) !==
            immutable(admitted, attemptMutableColumns)
        )
          throw Error("UNIVERSAL_ATTEMPT_CHANGED");
      },
      async eligibleWait() {
        return false;
      },
      async verifyRecovery() {
        throw Error("UNIVERSAL_EXACT_RECOVERY_REQUIRED");
      },
    });
  async function existing(binding: UniversalRunBinding) {
    let task: Task;
    try {
      task = await repository().read(context, binding.taskId);
    } catch (e) {
      if (e instanceof Error && e.message === "INTELLIGENCE_TASK_NOT_FOUND") return null;
      throw e;
    }
    const state = await repository(task).snapshot(context, binding.taskId);
    if (
      task.account_id !== actor ||
      task.trip_id !== trip ||
      task.import_id !== binding.batchId ||
      task.run_id !== binding.runId ||
      task.manifest_sha256 !== binding.submissionSha256 ||
      task.expected_run_generation !== binding.generation
    )
      throw Error("UNIVERSAL_TASK_CHANGED");
    return state;
  }
  async function readBoundTask(batch: string, taskId?: string) {
    const startedAt = Date.now();
    let stage: "AUTH" | "BINDING" | "TASK" = "AUTH";
    try {
      await current();
      stage = "BINDING";
      const binding = await (deps.publishedSource ?? source).lookup(actor, trip, batch);
      const initial = mixedBInitial?.batchId === batch ? mixedBInitial : undefined;
      if (!binding)
        throw Error(
          initial ? "MIXED_B_CONTEXT_UNPROVEN" : "UNIVERSAL_BATCH_NOT_PREPARED",
        );
      if (
        initial &&
        (binding.taskId !== initial.taskId ||
          binding.runId !== initial.runId ||
          binding.submissionSha256 !== initial.submissionSha256)
      )
        throw Error("MIXED_B_CONTEXT_UNPROVEN");
      if (taskId && binding.taskId !== taskId) throw Error("UNIVERSAL_TASK_UNAVAILABLE");
      stage = "TASK";
      const state = await existing(binding);
      if (!state) throw Error("OWNING_TASK_READER_UNAVAILABLE");
      return { binding, ...state };
    } catch (error) {
      // Fixed categories only: no SQL, paths, identity values or original contents.
      const message = error instanceof Error ? error.message : "";
      const category =
        message === "CORE_CONNECTION_BUSY"
          ? "BUSY"
          : [
                "UNIVERSAL_BATCH_NOT_PREPARED",
                "UNIVERSAL_TASK_UNAVAILABLE",
                "OWNING_TASK_READER_UNAVAILABLE",
                "UNIVERSAL_SOURCE_RUN_UNAVAILABLE",
              ].includes(message)
            ? "NOT_FOUND"
            : ["UNIVERSAL_TASK_CHANGED", "INPUT_STALE"].includes(message)
              ? "STALE"
              : message === "CORE_SCOPE_MISMATCH"
                ? "SCOPE"
                : "FAILED";
      try {
        console.info(
          JSON.stringify({
            event: "universal_task_binding_read_failed",
            stage,
            category,
            ...(z.uuid().safeParse(deps.sourceReadRequestId).success
              ? { requestId: deps.sourceReadRequestId }
              : {}),
            readKind: taskId ? "TASK" : "CONTEXT",
            durationMs: Date.now() - startedAt,
            ...universalBindingDiagnostic(error),
          }),
        );
      } catch {
        /* Diagnostics cannot replace the owning failure. */
      }
      if (mixedBInitial?.batchId === batch && message === "UNIVERSAL_BATCH_NOT_PREPARED")
        throw Error("MIXED_B_CONTEXT_UNPROVEN");
      throw error;
    }
  }
  async function found(batch: string, taskId?: string) {
    const state = await readBoundTask(batch, taskId);
    const sourceManifest = await readManifest(state.task);
    await current();
    return { ...state, sourceManifest };
  }
  async function marker(task: Task, lockedManifest?: UniversalManifest) {
    const dispatch = prepareUniversalDispatch(
      actor,
      task.import_id!,
      { version: UNIVERSAL_IMPORT_VERSION, tripId: trip, taskId: task.task_id },
      lockedManifest ?? (await readManifest(task)),
    );
    if (!dispatch.ready.length) throw Error("UNIVERSAL_NO_INTERPRETABLE_SOURCE");
    return {
      dispatch,
      bytes: Buffer.from(JSON.stringify(dispatch.dispatchMarker)),
    };
  }
  async function readResult(batch: string, taskId: string) {
    const state = await readBoundTask(batch, taskId);
    if (
      deps.retainedResultsEnabled === true &&
      withRetainedMetadata &&
      state.task.work_disposition === "PUBLISHED"
    )
      return readRetained(state);
    const sourceManifest = await readManifest(state.task);
    await current();
    return readState(state, sourceManifest);
  }
  async function readRetained(before: Awaited<ReturnType<typeof readBoundTask>>) {
    const { task, binding, attempts } = before;
    if (attempts.length !== 1 || attempts[0].result_install_disposition !== "INSTALLED")
      throw Error("UNIVERSAL_RESULT_UNAVAILABLE");
    const attempt = attempts[0];
    if (!withRetainedMetadata) throw Error("UNIVERSAL_RESULT_UNAVAILABLE");
    const result = await withRetainedMetadata(task, async (snapshot) => {
      // Other source kinds retain the existing full material read contract.
      const representation = snapshot.representations[0];
      if (snapshot.representations.length !== 1 || representation.mime !== "image/png") {
        const state = await found(binding.batchId, task.task_id);
        return readState(state, state.sourceManifest);
      }
      return readRetainedPngReceipt(
        snapshot, binding, task, attempt, context, repository(task, attempt), deps.runtime.stores,
      );
    });
    const after = await readBoundTask(binding.batchId, task.task_id);
    if (JSON.stringify(after) !== JSON.stringify(before))
      throw Error("UNIVERSAL_PUBLICATION_CHANGED");
    await repository(task, attempt).authorizeResultDisclosure(context, attempt);
    await current();
    return result;
  }
  async function readState(
    state: Awaited<ReturnType<typeof readBoundTask>>,
    lockedManifest?: UniversalManifest,
  ) {
    const batch = state.binding.batchId,
      taskId = state.binding.taskId;
    if (!state.attempts.length) return null;
    if (state.attempts.length !== 1) throw Error("UNIVERSAL_TASK_CHANGED");
    const attempt = state.attempts[0],
      material = await marker(state.task, lockedManifest);
    if (
      material.dispatch.requestSha256 !== attempt.request_sha256 ||
      (await hash(material.bytes)) !== attempt.request_material_sha256
    )
      throw Error("UNIVERSAL_TASK_CHANGED");
    const host = createUniversalContinuationHost({
      context,
      batchId: batch,
      taskId,
      repository: repository(state.task, attempt),
      ...deps.runtime.stores,
      attempt,
      requestMaterialByteCount: material.bytes.length,
      readSourceManifest: readManifest,
      async assertDurableStart() {
        throw Error("UNIVERSAL_READ_ONLY");
      },
      async assertCompletion() {
        throw Error("UNIVERSAL_READ_ONLY");
      },
    });
    const result = await host.readReceipt(actor, batch, taskId);
    await current();
    return result;
  }
  function executionContext(task: Task, batch: string, attemptCount: number) {
    return {
      version: "otr.backend.universal-context/1" as const,
      actorId: actor,
      accountId: actor,
      tripId: trip,
      batchId: batch,
      taskId: task.task_id,
      activity: projectUniversalTaskActivity(task, attemptCount),
    };
  }
  function assertMixedBWindowCurrent() {
    if (
      deps.enabled !== true ||
      !deps.assertNewExecutionAllowed ||
      !deps.finiteDeadline ||
      !(Date.parse(deps.finiteDeadline) > Date.now())
    )
      throw Error("MIXED_B_WINDOW_CLOSED");
    deps.assertNewExecutionAllowed();
  }
  function assertMixedBForwardCurrent() {
    assertMixedBWindowCurrent();
    if (!forward) throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
    forward.assertConfigCurrent();
  }

  async function isProtectedMixedB(batch: string, taskId: string) {
    const configured =
      mixedBInitial?.batchId === batch || mixedBInitial?.taskId === taskId;
    if (
      configured &&
      (mixedBInitial?.batchId !== batch || mixedBInitial.taskId !== taskId)
    )
      throw Error("MIXED_B_INITIAL_BINDING");
    const row = await readProtectedMixedBReservation(deps.db, batch, taskId);
    if (!row) return configured;
    if (
      row.account_id !== actor ||
      row.trip_id !== trip ||
      row.batch_id !== batch ||
      row.task_id !== taskId
    )
      throw Error("MIXED_B_INITIAL_BINDING");
    if (!configured) throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
    return true;
  }

  async function freshMixedBWake(
    binding: UniversalRunBinding,
    draft: Awaited<ReturnType<typeof buildUniversalRegisteredTaskDraft>>,
  ) {
    if (!mixedBOwner || !mixedBInitial || !deps.finiteBatch)
      throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
    await current();
    assertMixedBForwardCurrent();
    const { owningBinding: _, ...expected } = universalProviderOwningContext(binding);
    if (persistenceDigest(expected) !== persistenceDigest(deps.finiteBatch))
      throw Error("MIXED_B_MATERIAL_BINDING");
    const assertMaterial = await mixedBOwner.withCurrentMixedBMaterial(
      {
        batchId: binding.batchId,
        submissionSha256: binding.submissionSha256,
        inputs: expected.inputs,
      },
      binding,
      async (assertCurrent) => assertCurrent,
    );
    await current();
    assertMaterial();
    return {
      db: deps.db,
      context,
      reservation: { initial: mixedBInitial, finalRun: binding },
      task: draft.task,
      expectedWakeId: draft.attempt.sync_operation_id,
      assertCurrent() {
        assertMaterial();
        if (!(Date.now() < Date.parse(draft.task.policy_snapshot.deadline ?? "")))
          throw Error("MIXED_B_TASK_WINDOW_CLOSED");
      },
    };
  }

  async function reconstructMixedBWake(state: Awaited<ReturnType<typeof readBoundTask>>) {
    if (!mixedBOwner || state.attempts.length)
      throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
    assertMixedBForwardCurrent();
    const draft = await buildUniversalRegisteredTaskDraft(
      state.binding,
      await readManifest(state.task),
      await deps.selectProvider(universalProviderOwningContext(state.binding)),
      deps.finiteDeadline,
    );
    if (
      immutable(draft.task, taskMutableColumns) !==
      immutable(state.task, taskMutableColumns)
    )
      throw Error("MIXED_B_TASK_BINDING");
    return draft;
  }

  async function observeMaterialReady(batch: string) {
    await executionCurrent();
    if (!forward || !mixedBOwner || !mixedBInitial || !deps.finiteBatch ||
      mixedBInitial.batchId !== batch || deps.finiteBatch.batchId !== batch)
      throw Error("MIXED_B_MATERIAL_BINDING");
    const { submissionSha256, inputs } = deps.finiteBatch;
    const proof = await mixedBOwner.observeMixedBMaterialReady({ batchId: batch, submissionSha256, inputs });
    const spent = await readMixedBRunBeginState(deps.db, mixedBInitial);
    if (spent !== null && (spent !== forward.materialInputSha256 || proof.runState === "ABSENT"))
      throw Error("MIXED_B_RUN_BEGIN_OUTCOME_UNQUALIFIED");
    await current();
    proof.assertCurrent();
    return { ...proof, prepare: { tripId: trip, batchId: batch, submissionSha256, inputs } };
  }

  async function manifestForRun(binding: UniversalRunBinding) {
    return readManifest({
      account_id: actor,
      trip_id: trip,
      import_id: binding.batchId,
      task_id: binding.taskId,
      run_id: binding.runId,
      manifest_sha256: binding.submissionSha256,
      input_pins: binding.inputs.map((p) => ({
        kind: "SOURCE",
        source_id: p.source_id,
        material_revision: p.material_revision,
        representation_id: p.representation_id,
        payload_sha256: p.payload_sha256,
        byte_count: p.byte_count,
        input_id: p.id,
        transform_sha256: p.pdfSource?.transformOptionsSha256 ?? null,
      })),
    });
  }

  async function recoverOrdinaryWake(
    binding: UniversalRunBinding,
    prior: NonNullable<Awaited<ReturnType<typeof existing>>>,
    selection?: z.infer<typeof universalContinuousSelectionSchema>,
  ) {
    if (prior.task.sync_operation_id) return prior.task;
    if (
      deps.finiteBatch ||
      prior.attempts.length ||
      prior.task.row_revision !== 1 ||
      prior.task.work_disposition !== "PENDING"
    )
      throw Error("UNIVERSAL_WAKE_RECOVERY_UNQUALIFIED");
    await executionCurrent();
    const selected =
      selection ?? (await deps.selectProvider(universalProviderOwningContext(binding)));
    const draft = await buildUniversalRegisteredTaskDraft(
      binding,
      await manifestForRun(binding),
      selected,
      deps.finiteDeadline,
    );
    if (
      immutable(prior.task, taskMutableColumns) !==
      immutable(draft.task, taskMutableColumns)
    )
      throw Error("UNIVERSAL_TASK_CHANGED");
    await executionCurrent();
    return bindOrdinaryUniversalTaskWake({
      db: deps.db,
      context,
      task: prior.task,
      expectedWakeId: draft.attempt.sync_operation_id,
      repository: (db) => repository(undefined, undefined, db),
      assertCurrent: assertNewExecutionCurrent,
    });
  }

  return {
    async readMaterialReady(batch: string): Promise<UniversalMaterialReady> {
      let prepare: UniversalMaterialReady["prepare"];
      if (mixedBInitial?.batchId === batch) {
        prepare = (await observeMaterialReady(batch)).prepare;
      } else {
        await executionCurrent();
        if (deps.finiteBatch) throw Error("UNIVERSAL_MATERIAL_UNAVAILABLE");
        const binding = await source.lookup(actor, trip, batch);
        if (
          !binding ||
          (await isProtectedMixedB(batch, binding.taskId)) ||
          (await existing(binding))
        )
          throw Error("UNIVERSAL_MATERIAL_UNAVAILABLE");
        // Only the owning Run can restore the exact original pins after a lost Prepare.
        const { inputs, submissionSha256 } = universalProviderOwningContext(binding);
        prepare = { tripId: trip, batchId: batch, submissionSha256, inputs };
        await executionCurrent();
      }
      return {
        version: "otr.backend.universal-material-ready/1",
        state: "MATERIAL_READY_NO_TASK",
        accountId: actor,
        actorId: actor,
        prepare,
      };
    },
    async prepare(raw: unknown) {
      await executionCurrent();
      const batchContext = universalProviderBatchContext(actor, trip, raw);
      if (await isProtectedMixedB(batchContext.batchId, batchContext.taskId)) {
        const mixedB = mixedBInitial!;
        if (
          !deps.finiteBatch ||
          batchContext.submissionSha256 !== mixedB.submissionSha256 ||
          persistenceDigest(batchContext) !== persistenceDigest(deps.finiteBatch)
        )
          throw Error("MIXED_B_MATERIAL_BINDING");
        assertMixedBWindowCurrent();
        let binding = await source.lookup(actor, trip, mixedB.batchId);
        if (!forward || !mixedBOwner) {
          if (!binding) throw Error("MIXED_B_EXISTING_RUN_REQUIRED");
          throw Error("MIXED_B_MATERIAL_LEASE_UNQUALIFIED");
        }
        const assertReserved = () => {
          assertMixedBForwardCurrent();
          assertMixedBTaskFence(forward.taskDatabase, mixedB, true);
        };
        assertMixedBForwardCurrent();
        if (!binding) {
          const ready = await observeMaterialReady(mixedB.batchId);
          if (ready.runState === "PENDING") binding = await source.lookup(actor, trip, mixedB.batchId);
          else {
            await spendMixedBRunBegin(deps.db, mixedB, forward.materialInputSha256, ready.assertCurrent);
            binding = await source.beginMixedB(
              actor, trip, raw, forward.materialInputSha256, ready.normalizedInputSha256,
              () => { ready.assertCurrent(); assertReserved(); },
            );
          }
        }
        if (!binding) throw Error("MIXED_B_RUN_READBACK_UNAVAILABLE");
        const bindingContext = {
          version: "otr.backend.universal-context/1" as const,
          actorId: actor,
          accountId: actor,
          tripId: trip,
          batchId: binding.batchId,
          taskId: binding.taskId,
        };
        const priorTask = await existing(binding);
        if (priorTask?.attempts.length) throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        if (!priorTask && (await observeMaterialReady(mixedB.batchId)).runState !== "PENDING")
          throw Error("MIXED_B_RUN_READBACK_UNAVAILABLE");
        const draft = await buildUniversalRegisteredTaskDraft(
          binding,
          await manifestForRun(binding),
          await deps.selectProvider(universalProviderOwningContext(binding)),
          deps.finiteDeadline,
        );
        if (priorTask) {
          if (immutable(priorTask.task, taskMutableColumns) !== immutable(draft.task, taskMutableColumns))
            throw Error("MIXED_B_TASK_BINDING");
          await freshMixedBWake(binding, draft);
          return { status: "EXISTING" as const, context: bindingContext };
        }
        const reservation = { initial: mixedB, finalRun: binding };
        const catalog = await readUniversalCatalog(deps.catalogConnection, draft.task, AbortSignal.timeout(5000));
        const ledger = ledgerBootstrapResponseSchema.parse(await deps.bootstrapLedger());
        await bootstrapUniversalTask({
          db: deps.db,
          task: draft.task,
          attempt: draft.attempt,
          catalog,
          ledger,
          getAccountId: async () => actor,
          assertCurrent: assertMixedBForwardCurrent,
          claimQueue: false,
          mixedBReservation: reservation,
          proveMixedBStage: async () => (await freshMixedBWake(binding, draft)).assertCurrent,
        });
        await assertMixedBTaskStaged(deps.db, reservation, draft.task);
        const readback = await readBoundTask(binding.batchId, binding.taskId);
        if (persistenceDigest(readback.binding) !== persistenceDigest(binding))
          throw Error("MIXED_B_MATERIAL_BINDING");
        const proof = await freshMixedBWake(readback.binding, draft);
        await recoverMixedBTaskWake({
          ...proof,
          repository: (db) => repository(draft.task, undefined, db),
          now: () => new Date().toISOString(),
        });
        return { status: "QUEUED" as const, context: bindingContext };
      }
      const selection = await deps.selectProvider(batchContext);
      await executionCurrent();
      const binding = await source.prepare(actor, trip, raw),
        prior = await existing(binding);
      const bindingContext = {
        version: "otr.backend.universal-context/1" as const,
        actorId: actor,
        accountId: actor,
        tripId: trip,
        batchId: binding.batchId,
        taskId: binding.taskId,
      };
      if (prior) {
        if (await isProtectedMixedB(binding.batchId, binding.taskId))
          throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        await recoverOrdinaryWake(binding, prior, selection);
        return { status: "EXISTING" as const, context: bindingContext };
      }
      const draft = await buildUniversalRegisteredTaskDraft(
        binding, await manifestForRun(binding), selection, deps.finiteDeadline,
      );
      if (Date.parse(draft.task.policy_snapshot.deadline!) <= Date.now())
        throw Error("UNIVERSAL_TASK_EXPIRED");
      const catalog = await readUniversalCatalog(
        deps.catalogConnection,
        draft.task,
        AbortSignal.timeout(5000),
      );
      const ledger = ledgerBootstrapResponseSchema.parse(await deps.bootstrapLedger());
      await executionCurrent();
      await bootstrapUniversalTask({
        db: deps.db,
        task: draft.task,
        attempt: draft.attempt,
        catalog,
        ledger,
        getAccountId: async () => actor,
        assertCurrent: assertNewExecutionCurrent,
        claimQueue: false,
      });
      await current();
      return { status: "QUEUED" as const, context: bindingContext };
    },
    async readContext(batch: string) {
      if (mixedBInitial?.batchId === batch && deps.mixedBPristineSource) {
        await current();
        let pristine = false;
        try {
          assertMixedBWindowCurrent();
          const port = deps.mixedBPristineSource;
          const digest = mixedBInitialDigest(mixedBInitial);
          if (port.proveContinuationMixedBTaskAbsent)
            await port.proveContinuationMixedBTaskAbsent(actor, trip, batch, digest);
          else await port.proveInitialMixedBTaskAbsent(actor, trip, batch, digest);
          pristine = true;
        } catch {
          // A retained binding may still be readable. A generic miss stays uncertain for B.
        }
        if (pristine) {
          await current();
          assertMixedBWindowCurrent();
          throw Error("UNIVERSAL_BATCH_NOT_PREPARED");
        }
      }
      const state = await readBoundTask(batch);
      await current();
      return executionContext(state.task, batch, state.attempts.length);
    },
    // Normal authorized POST only. Passive Context/Results never bind or create a wake.
    async resume(batch: string, taskId: string) {
      const mixedB = await isProtectedMixedB(batch, taskId);
      if (mixedB) assertMixedBForwardCurrent();
      const state = await readBoundTask(batch, taskId);
      if (mixedB) {
        const draft = await reconstructMixedBWake(state);
        const proof = await freshMixedBWake(state.binding, draft);
        const task = await recoverMixedBTaskWake({
          ...proof,
          repository: (db) => repository(draft.task, undefined, db),
          now: () => new Date().toISOString(),
        });
        return executionContext(task, batch, 0);
      }
      // A previously missing Task can be created by an independent writer during lookup.
      if (await isProtectedMixedB(batch, taskId))
        throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
      const task = await recoverOrdinaryWake(state.binding, state);
      await current();
      return executionContext(task, batch, state.attempts.length);
    },
    async claimTargetedMixedBWake(batch: string, taskId: string, owner: string) {
      if (!(await isProtectedMixedB(batch, taskId))) return undefined;
      assertMixedBForwardCurrent();
      const state = await readBoundTask(batch, taskId);
      const draft = await reconstructMixedBWake(state);
      return claimMixedBTaskWake({
        ...(await freshMixedBWake(state.binding, draft)),
        owner,
        now: () => new Date().toISOString(),
      });
    },
    async assertOrdinaryWake(batch: string, taskId: string) {
      if (await isProtectedMixedB(batch, taskId))
        throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
    },
    readResult,
    async readPublished(
      batch: string,
      taskId: string,
    ): Promise<UniversalPublishedResult | null> {
      const retained = deps.retainedResultsEnabled === true && !!withRetainedMetadata;
      const before = retained
        ? { ...(await readBoundTask(batch, taskId)), sourceManifest: undefined }
        : await found(batch, taskId);
      if (before.task.work_disposition !== "PUBLISHED") {
        if (retained) {
          await readManifest(before.task);
          await current();
        }
        return null;
      }
      // Core retains the owning Source locks; its first manifest already checks all bytes twice.
      const result = retained
        ? await readRetained(before)
        : deps.publishedSource
          ? await readState(before, before.sourceManifest)
          : await readResult(batch, taskId);
      if (!result || result.providerOutcome !== "SETTLED" || !before.task.result_sha256)
        throw Error("UNIVERSAL_RESULT_UNAVAILABLE");
      const after = retained
        ? await readBoundTask(batch, taskId)
        : deps.publishedSource
          ? await existing(before.binding)
          : await found(batch, taskId);
      await current();
      if (!after) throw Error("UNIVERSAL_TASK_UNAVAILABLE");
      if (
        after.task.row_revision !== before.task.row_revision ||
        after.task.publication_fence !== before.task.publication_fence ||
        after.task.result_sha256 !== before.task.result_sha256
      )
        throw Error("UNIVERSAL_PUBLICATION_CHANGED");
      return {
        result,
        resultSha256: after.task.result_sha256!,
        runId: after.task.run_id!,
        taskRowRevision: after.task.row_revision,
        publicationFence: after.task.publication_fence,
      };
    },
    async executeQueued(
      batch: string,
      taskId: string,
      claim: { operationId: string; owner: string; baseVersion: number },
    ) {
      let phase = "SOURCE_READ";
      try {
        const mixedB = await isProtectedMixedB(batch, taskId);
        const state = await found(batch, taskId);
        if (mixedB && state.attempts.length)
          throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        phase = "QUEUE_READ";
        const q = await deps.db.getFirstAsync<SyncOperation>(
          "SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,entity_type AS entityType,entity_id AS entityId,operation_type AS operationType,idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=? AND entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?",
          claim.operationId,
          actor,
          trip,
          taskId,
        );
        if (
          !q ||
          state.task.sync_operation_id !== claim.operationId ||
          q.status !== "PROCESSING" ||
          q.claimOwner !== claim.owner ||
          q.baseVersion !== claim.baseVersion
        )
          throw Error("INTELLIGENCE_QUEUE_SCOPE");
        if (!mixedB && !state.attempts.length) {
          if (["FAILED", "CANCELED", "STALE"].includes(state.task.work_disposition))
            return null;
          if (
            state.task.current_attempt_id === null &&
            state.task.cancellation_disposition === "NONE" &&
            ["PENDING", "WAITING"].includes(state.task.work_disposition) &&
            state.task.policy_snapshot.deadline !== null &&
            Date.parse(state.task.policy_snapshot.deadline) <= Date.now()
          ) {
            phase = "TASK_DEADLINE";
            await current();
            await repository(state.task).wait(
              context,
              taskId,
              state.task.row_revision,
              [
                {
                  reason: "POLICY_BLOCKED",
                  dependency_id: null,
                  capability: null,
                  policy_sha256: state.task.policy_sha256,
                },
              ],
              true,
              undefined,
              q,
            );
            await current();
            return null;
          }
        }
        // Existing attempts, including UNKNOWN, never get a second Provider send.
        if (state.attempts.length) {
          phase = "SETTLED_RECOVERY";
          if (state.attempts.length !== 1) throw Error("UNIVERSAL_TASK_CHANGED");
          const a = state.attempts[0];
          if (state.task.work_disposition !== "PUBLISHED")
            await recoverSettledUniversalTask({
              context,
              task: state.task,
              attemptId: a.attempt_id,
              callId: a.usage_correlation_id!,
              requestMaterialByteCount: (await marker(state.task)).bytes.length,
              repository: repository(state.task, a),
              stores: deps.runtime.stores,
              checks: createUniversalTaskReceiptChecks(
                deps.runtime.taskReceiptConnection,
              ),
              priceSchedule: await deps.readAdmittedPrice(state.task, a),
              assertCurrentAuth: current,
              readSourceManifest: readManifest,
            });
          return await readResult(batch, taskId);
        }
        await executionCurrent();
        phase = "MANIFEST_READ";
        const manifest = await readManifest(state.task);
        phase = "PROVIDER_SELECTION";
        const selection = await deps.selectProvider(
          universalProviderOwningContext(state.binding),
        );
        phase = "TASK_DRAFT";
        const draft = await buildUniversalRegisteredTaskDraft(
          state.binding,
          manifest,
          selection,
          deps.finiteDeadline,
        );
        if (
          immutable(draft.task, taskMutableColumns) !==
          immutable(state.task, taskMutableColumns)
        )
          throw Error("UNIVERSAL_CONFIGURATION_CHANGED");
        phase = "DISPATCH_PREFLIGHT";
        const dispatch = prepareUniversalDispatch(
          actor,
          batch,
          { version: UNIVERSAL_IMPORT_VERSION, tripId: trip, taskId },
          await readManifest(state.task),
        );
        const request = buildUniversalDeepSeekRequest({
          actorId: actor,
          accountId: actor,
          tripId: trip,
          batchId: batch,
          taskId,
          promptVersion: COMPACT_PROMPT_VERSION,
          instruction: universalInstruction,
          advisoryInstruction: universalAdvisoryInstruction,
          sources: dispatch.ready.map((p, index) => ({
            index,
            sourceId: p.sourceId,
            mime: p.mime,
            modality: p.modality as "TEXT" | "IMAGE",
            sha256: p.submittedSha256,
            bytes: p.bytes,
          })),
        });
        const stamp = new Date().toISOString(),
          admitted = { ...draft.attempt, created_at: stamp, updated_at: stamp };
        const taskRepository = repository(state.task, admitted);
        let executionRepository = taskRepository;
        let gateway = deps.runtime.gateway;
        let beforeRemoteSend: UniversalRuntimeProvisioning["beforeRemoteSend"];
        if (mixedB) {
          const fresh = () => freshMixedBWake(state.binding, draft);
          const readKnownAttempt = async (
            proof: Awaited<ReturnType<typeof fresh>>,
            phase: MixedBAttemptPhase,
          ) => {
            let assertSnapshot: (() => void) | undefined;
            await deps.db.withTransactionAsync(async () => {
              assertSnapshot = await assertMixedBClaimCurrent(proof, claim, {
                expected: admitted,
                phase,
              });
            });
            if (!assertSnapshot) throw Error("MIXED_B_WAKE_STATE");
            assertSnapshot();
            return assertSnapshot;
          };
          const guardedAttemptRepository = (
            proof: Awaited<ReturnType<typeof fresh>>,
            before: MixedBAttemptPhase | undefined,
            after: MixedBAttemptPhase,
          ) =>
            repository(state.task, admitted, {
              ...deps.db,
              withTransactionAsync(work: () => Promise<void>) {
                return deps.db.withImmediateTransactionAsync(async () => {
                  await assertMixedBClaimCurrent(
                    proof,
                    claim,
                    before ? { expected: admitted, phase: before } : undefined,
                  );
                  await work();
                  await assertMixedBClaimCurrent(proof, claim, {
                    expected: admitted,
                    phase: after,
                  });
                });
              },
            });
          executionRepository = {
            ...taskRepository,
            async reserveAttempt(...args) {
              return guardedAttemptRepository(
                await fresh(),
                undefined,
                "RESERVED",
              ).reserveAttempt(...args);
            },
            async beginExecution(...args) {
              return guardedAttemptRepository(
                await fresh(),
                "RESERVED",
                "RUNNING",
              ).beginExecution(...args);
            },
            async admitExecution(...args) {
              return guardedAttemptRepository(
                await fresh(),
                "RUNNING",
                "START_ADMITTED",
              ).admitExecution(...args);
            },
          };
          const originalGateway = gateway;
          gateway = {
            async invoke(kind, raw) {
              if (
                kind === "universal_activation_reserve_call" ||
                kind === "external_integration_mark_dispatch"
              )
                (await readKnownAttempt(await fresh(), "RESERVED"))();
              return originalGateway.invoke(kind, raw);
            },
          };
          beforeRemoteSend = async () => {
            const proof = await fresh();
            return { readCurrentClaim: () => readKnownAttempt(proof, "START_ADMITTED") };
          };
        }
        phase = "RUNTIME_PREPARATION";
        const runtime = await createUniversalBackendRuntime({
          context,
          batchId: batch,
          taskId,
          attempt: admitted,
          repository: executionRepository,
          requestMaterialByteCount: draft.marker.length,
          ...deps.runtime,
          gateway,
          beforeRemoteSend,
          continuousSource: !deps.finiteBatch,
          continuousProvider: deps.finiteBatch
            ? undefined
            : {
                priceScheduleId: draft.selection.priceScheduleId,
                providerRequestSha256: request.requestSha256,
              },
          assertCurrentAuth: executionCurrent,
        });
        if (!runtime.universalImportPort) throw Error("UNIVERSAL_PROVIDER_CLOSED");
        phase = "PROVIDER_EXECUTION";
        return await runtime.universalImportPort.execute(actor, batch, {
          version: UNIVERSAL_IMPORT_VERSION,
          tripId: trip,
          taskId,
        });
      } catch (error) {
        try {
          console.info(
            JSON.stringify({
              event: "universal_execution_phase_failed",
              phase,
              kind:
                error instanceof ZodError
                  ? "SCHEMA"
                  : error instanceof TypeError
                    ? "TYPE"
                    : "OTHER",
            }),
          );
        } catch {
          // Never let diagnostics replace the owning failure.
        }
        throw error;
      }
    },
  };
}
