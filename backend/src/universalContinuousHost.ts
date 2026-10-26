import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import { createHash } from "node:crypto";
import type { AccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
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
  type UniversalRunBinding,
} from "./universalBatchSource";
import type { UniversalSourceTask } from "./universalSourceRead";
import type { UniversalManifest } from "./universalImport";
import { createUniversalSourceReader } from "./universalSourceRead";
import {
  buildUniversalRegisteredTaskDraft,
  type universalContinuousSelectionSchema,
} from "./universalRegisteredTaskDraft";
import {
  bootstrapUniversalTask,
  type universalTaskDatabase,
} from "./universalTaskBootstrap";
import {
  createUniversalBackendRuntime,
  type UniversalRuntimeProvisioning,
} from "./universalRuntime";
import { createUniversalContinuationHost } from "./universalContinuationHost";
import { readUniversalCatalog } from "./universalCatalog";
import { persistenceDigest } from "./externalIntegrationPersistence";
import {
  prepareUniversalDispatch,
  UNIVERSAL_IMPORT_VERSION,
  type UniversalResult,
} from "./universalImport";
import { recoverSettledUniversalTask } from "./universalSettledRecovery";
import { createUniversalTaskReceiptChecks } from "./universalTaskReceipt";
import type { UniversalPriceSchedule } from "./universalDeepSeekProvider";
import type { z } from "zod";
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
  context: AccountRequestContext;
  assertCurrentAuth(): Promise<void>;
  db: ReturnType<typeof universalTaskDatabase>;
  catalogConnection: PublicationCatalogConnection;
  bootstrapLedger(): Promise<unknown>;
  selectProvider(): Promise<z.infer<typeof universalContinuousSelectionSchema>>;
  runtime: Runtime & {
    stores: Runtime["stores"] &
      Pick<
        Awaited<
          ReturnType<typeof import("./flightPrivateCustody").createFlightPrivateCustody>
        >,
        "readRaw"
      >;
  };
  publishedSource?: {
    lookup(
      actor: string,
      trip: string,
      batch: string,
    ): Promise<UniversalRunBinding | null>;
    readManifest(task: Readonly<UniversalSourceTask>): Promise<UniversalManifest>;
  };
  readAdmittedPrice(task: Task, attempt: Attempt): Promise<UniversalPriceSchedule>;
}) {
  const context = Object.freeze({ ...deps.context }),
    actor = context.accountId,
    trip = context.tripId;
  const current = async () => {
    if (deps.enabled !== true) throw Error("UNIVERSAL_CONTINUOUS_CLOSED");
    await deps.assertCurrentAuth();
  };
  const source = createUniversalBatchSource({
    enabled: deps.enabled,
    connection: deps.runtime.sourceConnection,
    authorize: async (a, t) => {
      if (a !== actor || t !== trip) throw Error("SOURCE_ACCESS_DENIED");
      await current();
    },
  });
  const readManifest =
    deps.publishedSource?.readManifest ??
    createUniversalSourceReader({
      connection: deps.runtime.sourceConnection,
      continuous: true,
      readBinary: deps.runtime.readBinary,
    });
  const repository = (expected?: Task, admitted?: Attempt) =>
    createIntelligenceContinuationRepository(deps.db, {
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
  async function found(batch: string, taskId?: string) {
    await current();
    const binding = await (deps.publishedSource ?? source).lookup(actor, trip, batch);
    if (!binding || (taskId && binding.taskId !== taskId))
      throw Error("UNIVERSAL_TASK_UNAVAILABLE");
    const state = await existing(binding);
    if (!state) throw Error("OWNING_TASK_READER_UNAVAILABLE");
    const sourceManifest = await readManifest(state.task);
    await current();
    return { binding, ...state, sourceManifest };
  }
  async function marker(task: Task, lockedManifest?: UniversalManifest) {
    const dispatch = prepareUniversalDispatch(
      actor,
      task.import_id!,
      { version: UNIVERSAL_IMPORT_VERSION, tripId: trip, taskId: task.task_id },
      lockedManifest ?? (await readManifest(task)),
    );
    if (!dispatch.ready.length) throw Error("UNIVERSAL_NO_INTERPRETABLE_SOURCE");
    return { dispatch, bytes: Buffer.from(JSON.stringify(dispatch.dispatchMarker)) };
  }
  async function readResult(batch: string, taskId: string) {
    return readState(await found(batch, taskId));
  }
  async function readState(
    state: Awaited<ReturnType<typeof found>>,
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
  return {
    async prepare(raw: unknown) {
      await current();
      const selection = await deps.selectProvider();
      await current();
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
      if (prior) return { status: "EXISTING" as const, context: bindingContext };
      const manifest = await readManifest({
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
          transform_sha256: null,
        })),
      });
      const draft = await buildUniversalRegisteredTaskDraft(binding, manifest, selection);
      if (Date.parse(draft.task.policy_snapshot.deadline!) <= Date.now())
        throw Error("UNIVERSAL_TASK_EXPIRED");
      const catalog = await readUniversalCatalog(
        deps.catalogConnection,
        draft.task,
        AbortSignal.timeout(5000),
      );
      const ledger = ledgerBootstrapResponseSchema.parse(await deps.bootstrapLedger());
      await current();
      await bootstrapUniversalTask({
        db: deps.db,
        task: draft.task,
        attempt: draft.attempt,
        catalog,
        ledger,
        getAccountId: async () => actor,
        assertCurrent() {
          if (deps.enabled !== true) throw Error("UNIVERSAL_CONTINUOUS_CLOSED");
        },
        claimQueue: false,
      });
      await current();
      return { status: "QUEUED" as const, context: bindingContext };
    },
    async readContext(batch: string) {
      const state = await found(batch);
      return {
        version: "otr.backend.universal-context/1" as const,
        actorId: actor,
        accountId: actor,
        tripId: trip,
        batchId: batch,
        taskId: state.task.task_id,
      };
    },
    readResult,
    async readPublished(
      batch: string,
      taskId: string,
    ): Promise<UniversalPublishedResult | null> {
      const before = await found(batch, taskId);
      if (before.task.work_disposition !== "PUBLISHED") return null;
      // Core retains the owning Source locks; its first manifest already checks all bytes twice.
      const result = deps.publishedSource
        ? await readState(before, before.sourceManifest)
        : await readResult(batch, taskId);
      if (!result || result.providerOutcome !== "SETTLED" || !before.task.result_sha256)
        throw Error("UNIVERSAL_RESULT_UNAVAILABLE");
      const after = deps.publishedSource
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
      const state = await found(batch, taskId);
      const q = await deps.db.getFirstAsync<{
        status: string;
        claim_owner: string;
        base_version: number;
      }>(
        "SELECT status,claim_owner,base_version FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=? AND entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?",
        claim.operationId,
        actor,
        trip,
        taskId,
      );
      if (
        !q ||
        state.task.sync_operation_id !== claim.operationId ||
        q.status !== "PROCESSING" ||
        q.claim_owner !== claim.owner ||
        q.base_version !== claim.baseVersion
      )
        throw Error("INTELLIGENCE_QUEUE_SCOPE");
      // Existing attempts, including UNKNOWN, never get a second Provider send.
      if (state.attempts.length) {
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
            checks: createUniversalTaskReceiptChecks(deps.runtime.taskReceiptConnection),
            priceSchedule: await deps.readAdmittedPrice(state.task, a),
            assertCurrentAuth: current,
            readSourceManifest: readManifest,
          });
        return readResult(batch, taskId);
      }
      const draft = await buildUniversalRegisteredTaskDraft(
        state.binding,
        await readManifest(state.task),
        await deps.selectProvider(),
      );
      if (
        immutable(draft.task, taskMutableColumns) !==
        immutable(state.task, taskMutableColumns)
      )
        throw Error("UNIVERSAL_CONFIGURATION_CHANGED");
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
      const runtime = await createUniversalBackendRuntime({
        context,
        batchId: batch,
        taskId,
        attempt: admitted,
        repository: repository(state.task, admitted),
        requestMaterialByteCount: draft.marker.length,
        ...deps.runtime,
        continuousSource: true,
        continuousProvider: {
          priceScheduleId: draft.selection.priceScheduleId,
          providerRequestSha256: request.requestSha256,
        },
        assertCurrentAuth: current,
      });
      if (!runtime.universalImportPort) throw Error("UNIVERSAL_PROVIDER_CLOSED");
      return runtime.universalImportPort.execute(actor, batch, {
        version: UNIVERSAL_IMPORT_VERSION,
        tripId: trip,
        taskId,
      });
    },
  };
}
