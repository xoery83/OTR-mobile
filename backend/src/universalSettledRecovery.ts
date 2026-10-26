import { createHash } from "node:crypto";
import type { Task } from "../../src/domain/intelligence/persistence";
import type { AccountRequestContext } from "../../src/data/auth/accountRequestContext";
import type { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import type { createFlightPrivateCustody } from "./flightPrivateCustody";
import type { createUniversalTaskReceiptChecks } from "./universalTaskReceipt";
import { createUniversalContinuationHost } from "./universalContinuationHost";
import {
  decodeUniversalDeepSeekResponse,
  type UniversalPriceSchedule,
} from "./universalDeepSeekProvider";
import {
  prepareUniversalDispatch,
  projectUniversalResponse,
  UNIVERSAL_IMPORT_VERSION,
  type UniversalManifest,
} from "./universalImport";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import {
  universalInstruction,
  universalAdvisoryInstruction,
} from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";

const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
// Existing Task/Receipt/Custody only. This entry has no Provider, send, reserve or Task-create port.
export async function recoverSettledUniversalTask(deps: {
  context: AccountRequestContext;
  task: Readonly<Task>;
  attemptId: string;
  callId: string;
  requestMaterialByteCount: number;
  repository: ReturnType<typeof createIntelligenceContinuationRepository>;
  stores: Pick<
    Awaited<ReturnType<typeof createFlightPrivateCustody>>,
    "custody" | "retained" | "readRaw"
  >;
  checks: Pick<
    ReturnType<typeof createUniversalTaskReceiptChecks>,
    "assertCompletion"
  >;
  priceSchedule: UniversalPriceSchedule;
  assertCurrentAuth(): Promise<void>;
  readSourceManifest(task: Readonly<Task>): Promise<UniversalManifest>;
}) {
  await deps.assertCurrentAuth();
  const snapshot = await deps.repository.snapshot(
    deps.context,
    deps.task.task_id,
  );
  const { task } = snapshot;
  const attempt = snapshot.attempts[0];
  if (
    snapshot.attempts.length !== 1 ||
    !attempt ||
    attempt.attempt_id !== deps.attemptId ||
    attempt.usage_correlation_id !== deps.callId ||
    attempt.task_id !== task.task_id ||
    task.account_id !== deps.context.accountId ||
    task.trip_id !== deps.context.tripId ||
    task.task_id !== deps.task.task_id ||
    task.import_id !== deps.task.import_id ||
    task.run_id !== deps.task.run_id ||
    task.input_sha256 !== deps.task.input_sha256 ||
    task.manifest_sha256 !== deps.task.manifest_sha256 ||
    task.policy_sha256 !== deps.task.policy_sha256 ||
    task.publication_fence !== deps.task.publication_fence ||
    task.cancellation_disposition !== "NONE" ||
    ["CANCELED", "STALE", "FAILED"].includes(task.work_disposition) ||
    !["RUNNING", "TERMINAL"].includes(attempt.execution_observation) ||
    !["START_DURABLE", "COMPLETE"].includes(attempt.metering_disposition)
  )
    throw Error("UNIVERSAL_RECOVERY_BINDING_INVALID");
  const manifest = await deps.readSourceManifest(task);
  const dispatch = prepareUniversalDispatch(
    task.account_id,
    task.import_id!,
    {
      version: UNIVERSAL_IMPORT_VERSION,
      tripId: task.trip_id!,
      taskId: task.task_id,
    },
    manifest,
  );
  if (
    dispatch.requestSha256 !== attempt.request_sha256 ||
    !dispatch.ready.length
  )
    throw Error("UNIVERSAL_RECOVERY_SOURCE_CHANGED");
  const request = buildUniversalDeepSeekRequest({
    actorId: task.account_id,
    accountId: task.account_id,
    tripId: task.trip_id!,
    batchId: task.import_id!,
    taskId: task.task_id,
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
  const raw = await deps.stores.readRaw(task.account_id, deps.callId);
  const binding = raw.binding as {
    version?: unknown;
    taskId?: unknown;
    requestSha256?: unknown;
    httpStatus?: unknown;
  };
  if (
    !binding ||
    binding.version !== 1 ||
    binding.taskId !== task.task_id ||
    binding.requestSha256 !== request.requestSha256 ||
    binding.httpStatus !== 200 ||
    raw.pin.reference !== deps.callId
  )
    throw Error("UNIVERSAL_RECOVERY_RAW_BINDING_INVALID");
  const bytes = await deps.stores.custody.read({
    accountId: task.account_id,
    ...raw.pin,
  });
  if (bytes.byteLength !== raw.pin.byteCount || sha(bytes) !== raw.pin.sha256)
    throw Error("UNIVERSAL_RECOVERY_RAW_INTEGRITY");
  const decoded = decodeUniversalDeepSeekResponse(bytes, deps.priceSchedule);
  if (!decoded.costNanos) throw Error("UNIVERSAL_RECOVERY_USAGE_UNRESOLVED");
  const result = projectUniversalResponse(dispatch, {
    output: decoded.output,
    providerReceipt: {
      outcome: "SETTLED",
      requestId: decoded.providerRequestId,
      requestSha256: request.requestSha256,
      responseSha256: raw.pin.sha256,
      usage: decoded.usage,
      costNanos: decoded.costNanos,
    },
  });
  await deps.assertCurrentAuth();
  const host = createUniversalContinuationHost({
    context: deps.context,
    batchId: task.import_id!,
    taskId: task.task_id,
    repository: deps.repository,
    custody: deps.stores.custody,
    retained: deps.stores.retained,
    requestMaterialByteCount: deps.requestMaterialByteCount,
    attempt,
    readSourceManifest: deps.readSourceManifest,
    assertCompletion: deps.checks.assertCompletion,
    async assertDurableStart() {
      throw Error("UNIVERSAL_RECOVERY_DISPATCH_FORBIDDEN");
    },
  });
  // Current Source proof is rechecked immediately before the existing owning publication.
  const again = prepareUniversalDispatch(
    task.account_id,
    task.import_id!,
    {
      version: UNIVERSAL_IMPORT_VERSION,
      tripId: task.trip_id!,
      taskId: task.task_id,
    },
    await deps.readSourceManifest(task),
  );
  if (again.requestSha256 !== dispatch.requestSha256)
    throw Error("UNIVERSAL_RECOVERY_SOURCE_CHANGED");
  if (task.work_disposition === "PUBLISHED") {
    await deps.checks.assertCompletion(result, attempt, task);
    const existing = await host.readReceipt(
      task.account_id,
      task.import_id!,
      task.task_id,
    );
    if (JSON.stringify(existing) !== JSON.stringify(result))
      throw Error("UNIVERSAL_RECOVERY_RESULT_CHANGED");
  } else await host.writeReceipt(result);
  const after = await deps.repository.snapshot(deps.context, task.task_id);
  await deps.repository.authorizeResultDisclosure(
    deps.context,
    after.attempts[0],
  );
  await deps.assertCurrentAuth();
  return result;
}

// Mounted only by an explicitly sealed settled-read runtime. POST cannot claim an attempt.
export function createSettledUniversalReadPort(
  deps: Parameters<typeof recoverSettledUniversalTask>[0],
): import("./universalImport").UniversalPort {
  async function scope(actor: string, batch: string, taskId: string) {
    if (
      actor !== deps.context.accountId ||
      batch !== deps.task.import_id ||
      taskId !== deps.task.task_id
    )
      return null;
    await deps.assertCurrentAuth();
    const snapshot = await deps.repository.snapshot(deps.context, taskId);
    if (
      snapshot.task.work_disposition !== "PUBLISHED" ||
      snapshot.attempts.length !== 1 ||
      snapshot.attempts[0].attempt_id !== deps.attemptId ||
      snapshot.attempts[0].result_install_disposition !== "INSTALLED"
    )
      return null;
    const manifest = await deps.readSourceManifest(snapshot.task);
    const dispatch = prepareUniversalDispatch(
      actor,
      batch,
      {
        version: UNIVERSAL_IMPORT_VERSION,
        tripId: deps.context.tripId!,
        taskId,
      },
      manifest,
    );
    if (dispatch.requestSha256 !== snapshot.attempts[0].request_sha256)
      throw Error("UNIVERSAL_RECOVERY_SOURCE_CHANGED");
    return { snapshot, dispatch };
  }
  return {
    async execute() {
      throw Error("UNIVERSAL_RECOVERY_DISPATCH_FORBIDDEN");
    },
    async readContext(actor, batch, trip) {
      if (trip !== deps.context.tripId) return null;
      const current = await scope(actor, batch, deps.task.task_id);
      if (!current) return null;
      return {
        version: "otr.backend.universal-context/1",
        actorId: actor,
        accountId: actor,
        tripId: trip,
        batchId: batch,
        taskId: deps.task.task_id,
      };
    },
    async read(actor, batch, taskId) {
      const current = await scope(actor, batch, taskId);
      if (!current) return null;
      const a = current.snapshot.attempts[0];
      const host = createUniversalContinuationHost({
        context: deps.context,
        batchId: batch,
        taskId,
        repository: deps.repository,
        custody: deps.stores.custody,
        retained: deps.stores.retained,
        requestMaterialByteCount: Buffer.byteLength(
          JSON.stringify(current.dispatch.dispatchMarker),
        ),
        attempt: a,
        readSourceManifest: deps.readSourceManifest,
        assertCompletion: deps.checks.assertCompletion,
        async assertDurableStart() {
          throw Error("UNIVERSAL_RECOVERY_DISPATCH_FORBIDDEN");
        },
      });
      const result = await host.readReceipt(actor, batch, taskId);
      if (!result) return null;
      await deps.checks.assertCompletion(result, a, current.snapshot.task);
      await deps.repository.authorizeResultDisclosure(deps.context, a);
      await deps.assertCurrentAuth();
      return result;
    },
  };
}
