import { registeredUniversalModelProfile } from "./universalModelProfile";
import { createHash } from "node:crypto";
import type { AccountRequestContext } from "../../src/data/auth/accountRequestContext";
import type { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import {
  attemptSchema,
  type Attempt,
  type Task,
} from "../../src/domain/intelligence/persistence";
import type { PrivateMaterialCustody } from "./externalIntegrationPersistence";
import type {
  UniversalHost,
  UniversalManifest,
  UniversalResult,
} from "./universalImport";
import { UNIVERSAL_IMPORT_VERSION, UNIVERSAL_IMPORT_SCHEMA_ID } from "./universalImport";
import type { createFlightPrivateCustody } from "./flightPrivateCustody";

type Repository = ReturnType<typeof createIntelligenceContinuationRepository>;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// One already-admitted Task and its owning queue/attempt. This adapter creates no Task,
// queue, Batch, Source, official Review or Canonical publication authority.
export function createUniversalContinuationHost(deps: {
  context: AccountRequestContext;
  batchId: string;
  taskId: string;
  repository: Repository;
  custody: PrivateMaterialCustody;
  retained: Awaited<ReturnType<typeof createFlightPrivateCustody>>["retained"];
  requestMaterialByteCount: number;
  readSourceManifest(task: Readonly<Task>): Promise<UniversalManifest | null>;
  attempt: Attempt;
  // Existing Provider reservation must prove its actual durable START and the
  // exact Universal profile. A Flight-only reservation is not a valid implementation.
  assertDurableStart(attempt: Readonly<Attempt>, task: Readonly<Task>): Promise<void>;
  assertCompletion(
    result: Readonly<UniversalResult>,
    attempt: Readonly<Attempt>,
    task: Readonly<Task>,
  ): Promise<void>;
}): UniversalHost {
  const attempt = attemptSchema.parse(structuredClone(deps.attempt));
  const context = Object.freeze({ ...deps.context });
  if (
    attempt.account_id !== context.accountId ||
    attempt.task_id !== deps.taskId ||
    attempt.shadow ||
    attempt.attempt_sequence !== 1 ||
    !attempt.request_material_reference ||
    attempt.request_material_reference === attempt.attempt_id ||
    !Number.isSafeInteger(deps.requestMaterialByteCount) ||
    deps.requestMaterialByteCount < 1 ||
    deps.requestMaterialByteCount > 4194304
  )
    throw new Error("UNIVERSAL_TASK_BINDING_INVALID");

  async function current() {
    const snapshot = await deps.repository.snapshot(context, deps.taskId);
    const t = snapshot.task;
    if (
      t.account_id !== context.accountId ||
      t.trip_id !== context.tripId ||
      t.import_id !== deps.batchId ||
      t.task_id !== deps.taskId ||
      t.stage !== "INTERPRETATION" ||
      t.consumer_id !== "import" ||
      t.schema_id !== UNIVERSAL_IMPORT_SCHEMA_ID ||
      t.schema_version !== 1 ||
      t.schema_dialect !== "OTR_TYPED_V1" ||
      t.consumer_version !== 1 ||
      t.schema_sha256 !== registeredUniversalModelProfile.output_schema_sha256 ||
      t.policy_snapshot.max_attempts !== 1 ||
      t.cancellation_disposition !== "NONE" ||
      ["CANCELED", "STALE", "FAILED"].includes(t.work_disposition) ||
      snapshot.attempts.length > 1 ||
      snapshot.attempts.some(
        (a) =>
          a.attempt_id !== attempt.attempt_id ||
          a.shadow ||
          a.request_sha256 !== attempt.request_sha256 ||
          a.request_material_reference !== attempt.request_material_reference ||
          a.request_material_sha256 !== attempt.request_material_sha256 ||
          a.task_publication_fence !== attempt.task_publication_fence,
      )
    )
      throw new Error("UNIVERSAL_TASK_UNAVAILABLE");
    return snapshot;
  }
  function assertScope(actor: string, batch: string, task = deps.taskId) {
    if (actor !== context.accountId || batch !== deps.batchId || task !== deps.taskId)
      throw new Error("UNIVERSAL_TASK_UNAVAILABLE");
  }
  async function material(reference: string, sha256: string, byteCount: number) {
    const bytes = await deps.custody.read({
      accountId: context.accountId,
      reference,
      sha256,
      byteCount,
    });
    if (digest(bytes) !== sha256) throw new Error("UNIVERSAL_RECEIPT_INTEGRITY");
    const value = JSON.parse(Buffer.from(bytes).toString("utf8")) as UniversalResult;
    if (
      value.version !== UNIVERSAL_IMPORT_VERSION ||
      value.actorId !== context.accountId ||
      value.accountId !== context.accountId ||
      value.tripId !== context.tripId ||
      value.batchId !== deps.batchId ||
      value.taskId !== deps.taskId ||
      value.requestSha256 !== attempt.request_sha256 ||
      value.canonicalWrites !== false ||
      value.formalReview !== "NOT_RUN" ||
      value.admission !== "NOT_RUN"
    )
      throw new Error("UNIVERSAL_RECEIPT_INTEGRITY");
    return value;
  }
  // The immutable request material is the UNKNOWN marker; only the owning Task's
  // published response pin can disclose a completed result after a restart.
  async function receipt(t: Task, a: Attempt) {
    if (t.work_disposition === "PUBLISHED") {
      if (
        !a.response_material_reference ||
        !a.response_material_sha256 ||
        a.response_sha256 !== a.response_material_sha256 ||
        t.result_sha256 !== a.response_sha256 ||
        a.result_install_disposition !== "INSTALLED"
      )
        throw new Error("UNIVERSAL_RECEIPT_INTEGRITY");
      const pin = await deps.retained.read(a);
      if (
        !pin ||
        pin.reference !== a.response_material_reference ||
        pin.sha256 !== a.response_material_sha256
      )
        throw new Error("UNIVERSAL_RECEIPT_INTEGRITY");
      return material(pin.reference, pin.sha256, pin.byteCount);
    }
    return material(
      a.request_material_reference!,
      a.request_material_sha256!,
      deps.requestMaterialByteCount,
    );
  }
  return {
    async readManifest(actor, trip, batch) {
      assertScope(actor, batch);
      if (trip !== context.tripId) return null;
      const { task: t } = await current();
      const manifest = await deps.readSourceManifest(t);
      await current();
      return manifest;
    },
    async claimDispatch(marker) {
      assertScope(marker.actorId, marker.batchId, marker.taskId);
      const state = await current();
      if (state.attempts[0]) {
        const value = await receipt(state.task, state.attempts[0]);
        await current();
        return { claimed: false, receipt: value };
      }
      const bytes = Buffer.from(JSON.stringify(marker));
      if (
        marker.requestSha256 !== attempt.request_sha256 ||
        digest(bytes) !== attempt.request_material_sha256 ||
        bytes.length !== deps.requestMaterialByteCount
      )
        throw new Error("UNIVERSAL_TASK_CHANGED_REQUEST");
      await deps.custody.put({
        accountId: context.accountId,
        reservationId: attempt.request_material_reference!,
        sha256: digest(bytes),
        byteCount: bytes.length,
        bytes,
      });
      let a = await deps.repository.reserveAttempt(
        context,
        attempt,
        state.task.row_revision,
      );
      await deps.assertDurableStart(a, state.task);
      a = await deps.repository.beginExecution(
        context,
        a.attempt_id,
        a.row_revision,
        "START_DURABLE",
      );
      await deps.repository.admitExecution(context, a, () => {});
      return { claimed: true, receipt: marker };
    },
    async writeReceipt(result) {
      assertScope(result.actorId, result.batchId, result.taskId);
      if (
        result.accountId !== context.accountId ||
        result.tripId !== context.tripId ||
        result.requestSha256 !== attempt.request_sha256
      )
        throw new Error("UNIVERSAL_TASK_CHANGED_REQUEST");
      const state = await current();
      let a = state.attempts[0];
      if (!a) throw new Error("UNIVERSAL_TASK_UNCLAIMED");
      if (result.status === "EXECUTION_OUTCOME_UNKNOWN") {
        await deps.repository.observeAttempt(context, a.attempt_id, a.row_revision, {
          execution_observation: "UNKNOWN",
          execution_outcome: null,
          metering_disposition: "UNKNOWN",
          response_material_reference: null,
          response_material_sha256: null,
          response_sha256: null,
          reported_usage_summary: null,
        });
        return;
      }
      await deps.assertCompletion(result, a, state.task);
      const bytes = Buffer.from(JSON.stringify(result)),
        sha256 = digest(bytes);
      await deps.custody.put({
        accountId: context.accountId,
        reservationId: a.attempt_id,
        sha256,
        byteCount: bytes.length,
        bytes,
      });
      await deps.retained.put(a, {
        reference: a.attempt_id,
        sha256,
        byteCount: bytes.length,
      });
      a = await deps.repository.observeAttempt(context, a.attempt_id, a.row_revision, {
        execution_observation: "TERMINAL",
        execution_outcome: "SUCCEEDED",
        metering_disposition: "COMPLETE",
        response_material_reference: a.attempt_id,
        response_material_sha256: sha256,
        response_sha256: sha256,
        reported_usage_summary: null,
      });
      await deps.repository.installResult(
        context,
        a.attempt_id,
        a.row_revision,
        a.attempt_id,
        sha256,
        async () => {},
      );
    },
    async readReceipt(actor, batch, task) {
      assertScope(actor, batch, task);
      const state = await current();
      const value = state.attempts[0]
        ? await receipt(state.task, state.attempts[0])
        : null;
      await current();
      return value;
    },
  };
}
