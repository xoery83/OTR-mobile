import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { hashCaptureBytes } from "@/data/files/capturePayloadReader";
import { createCaptureSubmissionTransactionStore } from "./captureSubmissionRepository";
import type {
  LocalCaptureDatabase,
  LocalCaptureDependencies,
} from "./localCaptureInboxRepository";
import {
  captureProcessingValidationKind,
  captureLocalInterpretationKind,
  createSyncEngine,
  nextSyncAttemptAt,
} from "../sync/syncEngine";
import type { SyncOperation } from "../sync/syncOperationRepository";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { LocalCaptureError } from "@/domain/capture/localCapture";
import { ZodError } from "zod";
import { createSyncOperationClaimOwner } from "../sync/syncOperationRepository";
import {
  attachCaptureLocalModelEvidence,
  buildCaptureLocalResult,
  needsCaptureLocalEnrichment,
  type CaptureLocalResult,
} from "@/domain/capture/captureLocalInterpretation";

type Database = LocalCaptureDatabase;
type Pin = {
  version: 1;
  batchId: string;
  jobId: string;
  manifestSha256: string;
  inputId: string;
  inputRevision: number;
  captureId: string;
  captureRevision: number;
  payloadId: string;
  sha256: string;
  byteCount: number;
};
const kind = captureProcessingValidationKind;
const localKind = captureLocalInterpretationKind;
const localKinds = [kind, localKind] as const;
const select = `SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,
  entity_type AS entityType,entity_id AS entityId,operation_type AS operationType,
  idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,
  status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,
  claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations`;
const opId = (inputId: string) => `capture-processing:${inputId}`;
const localOpId = (inputId: string) => `capture-local:${inputId}`;
function localMediaType(kind: string, declared: string | null, bytes: Uint8Array) {
  const claimed = declared?.split(";", 1)[0].trim().toLowerCase();
  const normalized = claimed === "image/jpg" ? "image/jpeg" : claimed;
  const actual =
    bytes[0] === 37 &&
    bytes[1] === 80 &&
    bytes[2] === 68 &&
    bytes[3] === 70 &&
    bytes[4] === 45
      ? "application/pdf"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
          ? "image/png"
          : null;
  if (
    !actual ||
    (kind === "IMAGE" && actual === "application/pdf") ||
    (normalized && normalized !== "application/octet-stream" && normalized !== actual)
  )
    fail("CAPTURE_LOCAL_UNSUPPORTED_MEDIA");
  return actual!;
}
const fail = (code: string): never => {
  throw new Error(code);
};

export function createCaptureProcessingRepository(
  db: Database,
  getAccountId: () => Promise<string>,
  deps: LocalCaptureDependencies,
) {
  const submissions = createCaptureSubmissionTransactionStore(db, deps);
  const staged = new Map<string, { owner: string; result: CaptureLocalResult }>();
  async function gated<T>(context: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(context, getAccountId);
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await work();
        await assertAccountRequestContext(context, getAccountId);
      });
      return result;
    });
  }
  async function current(context: AccountRequestContext, id: string) {
    const row = await db.getFirstAsync<SyncOperation>(
      `${select} WHERE id=? AND owner_user_id=?`,
      id,
      context.accountId,
    );
    return row ?? fail("CAPTURE_PROCESSING_MISSING");
  }
  async function pinned(context: AccountRequestContext, operation: SyncOperation) {
    if (
      operation.ownerUserId !== context.accountId ||
      operation.tripId !== null ||
      operation.entityType !== "CAPTURE_SUBMISSION_INPUT" ||
      !localKinds.includes(operation.operationType as typeof kind | typeof localKind) ||
      operation.id !==
        (operation.operationType === kind
          ? opId(operation.entityId)
          : localOpId(operation.entityId)) ||
      operation.idempotencyKey !== operation.entityId
    )
      fail("CAPTURE_PROCESSING_SCOPE");
    if (operation.operationType === localKind) {
      const validated = await db.getFirstAsync<SyncOperation>(
        `${select} WHERE id=? AND owner_user_id=?`,
        opId(operation.entityId),
        context.accountId,
      );
      if (
        !validated ||
        validated.status !== "COMPLETED" ||
        validated.payloadJson !== operation.payloadJson
      )
        fail("CAPTURE_LOCAL_PREREQUISITE");
    }
    let pin: Pin;
    try {
      pin = JSON.parse(operation.payloadJson) as Pin;
    } catch {
      return fail("CAPTURE_PROCESSING_PIN");
    }
    if (
      !pin ||
      pin.version !== 1 ||
      pin.inputId !== operation.entityId ||
      pin.inputRevision !== operation.baseVersion ||
      !Number.isSafeInteger(pin.byteCount)
    )
      fail("CAPTURE_PROCESSING_PIN");
    const job = await submissions.load(context, pin.jobId);
    const input = job.inputs.find((item) => item.id === pin.inputId);
    const manifest = await db.getFirstAsync<{ sha256: string }>(
      "SELECT manifest_sha256 AS sha256 FROM capture_submission_batches WHERE account_id=? AND batch_id=? AND job_id=?",
      context.accountId,
      pin.batchId,
      pin.jobId,
    );
    if (
      !manifest ||
      manifest.sha256 !== pin.manifestSha256 ||
      job.batch.batchId !== pin.batchId ||
      !input ||
      input.state !== "ACCEPTED" ||
      input.revision !== pin.inputRevision ||
      input.captureId !== pin.captureId ||
      input.captureRevision !== pin.captureRevision ||
      input.payloadId !== pin.payloadId ||
      input.contentSha256 !== pin.sha256 ||
      input.contentByteCount !== pin.byteCount
    )
      fail("CAPTURE_PROCESSING_STALE_PIN");
    const material = await db.getFirstAsync<{
      revision: number;
      payloadId: string;
      sha256: string;
      byteCount: number;
      bytes: Uint8Array;
      tripId: string | null;
      kind: string;
      declaredContentType: string | null;
    }>(
      `SELECT c.revision,c.payload_id AS payloadId,p.sha256,p.byte_count AS byteCount,p.bytes,c.trip_id AS tripId,c.kind,c.declared_content_type AS declaredContentType
       FROM local_capture_inbox c JOIN local_capture_payloads p ON p.account_id=c.account_id AND p.id=c.payload_id
       WHERE c.account_id=? AND c.id=?`,
      context.accountId,
      pin.captureId,
    );
    if (
      !material ||
      material.tripId !== null ||
      material.revision !== pin.captureRevision ||
      material.payloadId !== pin.payloadId ||
      material.sha256 !== pin.sha256 ||
      material.byteCount !== pin.byteCount ||
      !(material.bytes instanceof Uint8Array) ||
      material.bytes.byteLength !== pin.byteCount ||
      (await hashCaptureBytes(material.bytes, deps.sha256)) !== pin.sha256
    )
      fail("CAPTURE_PROCESSING_HASH_MISMATCH");
    return {
      pin,
      bytes: material!.bytes,
      kind: material!.kind,
      mediaType: material!.declaredContentType,
    };
  }
  return {
    async schedule(context: AccountRequestContext, jobId: string) {
      return gated(context, async () => {
        const job = await submissions.load(context, jobId);
        const manifest = await db.getFirstAsync<{ sha256: string }>(
          "SELECT manifest_sha256 AS sha256 FROM capture_submission_batches WHERE account_id=? AND batch_id=? AND job_id=?",
          context.accountId,
          job.batch.batchId,
          jobId,
        );
        if (!manifest) fail("CAPTURE_PROCESSING_MANIFEST");
        const scheduled: string[] = [];
        for (const input of job.inputs) {
          if (input.state !== "ACCEPTED") continue;
          const id = opId(input.id);
          const pin: Pin = {
            version: 1,
            batchId: job.batch.batchId,
            jobId,
            manifestSha256: manifest!.sha256,
            inputId: input.id,
            inputRevision: input.revision,
            captureId: input.captureId!,
            captureRevision: input.captureRevision!,
            payloadId: input.payloadId!,
            sha256: input.contentSha256!,
            byteCount: input.contentByteCount!,
          };
          const payload = JSON.stringify(pin);
          const old = await db.getFirstAsync<SyncOperation>(`${select} WHERE id=?`, id);
          if (old) {
            if (
              old.ownerUserId !== context.accountId ||
              old.payloadJson !== payload ||
              old.entityId !== input.id ||
              old.operationType !== kind
            )
              fail("CAPTURE_PROCESSING_CHANGED_PIN");
          } else {
            const now = deps.now();
            await db.runAsync(
              `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,
                base_version,payload_json,owner_user_id,status,attempt_count,next_attempt_at,created_at,updated_at)
               VALUES(?,NULL,'CAPTURE_SUBMISSION_INPUT',?,?,?,CAST(? AS INTEGER),?,?,'PENDING',0,NULL,?,?)`,
              id,
              input.id,
              kind,
              input.id,
              input.revision,
              payload,
              context.accountId,
              now,
              now,
            );
          }
          scheduled.push(id);
        }
        return scheduled;
      });
    },
    async scheduleLocal(context: AccountRequestContext, jobId: string) {
      return gated(context, async () => {
        const job = await submissions.load(context, jobId);
        const scheduled: string[] = [];
        for (const input of job.inputs) {
          if (input.state !== "ACCEPTED") continue;
          const validated = await db.getFirstAsync<SyncOperation>(
            `${select} WHERE id=? AND owner_user_id=? AND status='COMPLETED' AND operation_type=?`,
            opId(input.id),
            context.accountId,
            kind,
          );
          if (!validated) continue;
          const id = localOpId(input.id);
          const old = await db.getFirstAsync<SyncOperation>(`${select} WHERE id=?`, id);
          if (old) {
            if (
              old.ownerUserId !== context.accountId ||
              old.payloadJson !== validated.payloadJson ||
              old.operationType !== localKind
            )
              fail("CAPTURE_LOCAL_CHANGED_PIN");
          } else {
            const now = deps.now();
            await db.runAsync(
              `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,
               base_version,payload_json,owner_user_id,status,attempt_count,next_attempt_at,created_at,updated_at)
               VALUES(?,NULL,'CAPTURE_SUBMISSION_INPUT',?,?,?,CAST(? AS INTEGER),?,?,'PENDING',0,NULL,?,?)`,
              id,
              input.id,
              localKind,
              input.id,
              input.revision,
              validated.payloadJson,
              context.accountId,
              now,
              now,
            );
          }
          scheduled.push(id);
        }
        return scheduled;
      });
    },
    async retryLocal(
      context: AccountRequestContext,
      jobId: string,
      inputId: string,
    ) {
      return gated(context, async () => {
        const job = await submissions.load(context, jobId);
        if (!job.inputs.some((input) => input.id === inputId && input.state === "ACCEPTED"))
          fail("CAPTURE_LOCAL_RETRY_SCOPE");
        const operation = await current(context, localOpId(inputId));
        if (operation.operationType !== localKind || operation.status !== "FAILED")
          fail("CAPTURE_LOCAL_RETRY_NOT_FAILED");
        const material = await pinned(context, operation);
        if (material.pin.jobId !== jobId || material.pin.inputId !== inputId)
          fail("CAPTURE_LOCAL_RETRY_SCOPE");
        const updated = await db.runAsync(
          `UPDATE sync_operations SET status='RETRYABLE',next_attempt_at=NULL,
           claim_owner=NULL,lease_expires_at=NULL,updated_at=?
           WHERE id=? AND owner_user_id=? AND operation_type=? AND status='FAILED'
           AND payload_json=? AND attempt_count=?`,
          deps.now(),
          operation.id,
          context.accountId,
          localKind,
          operation.payloadJson,
          operation.attemptCount,
        );
        if (updated.changes !== 1) fail("CAPTURE_LOCAL_RETRY_CAS");
        return operation.id;
      });
    },
    async localResults(context: AccountRequestContext, jobId: string) {
      return gated(context, async () => {
        const job = await submissions.load(context, jobId);
        const rows = await db.getAllAsync<{ resultJson: string }>(
          `SELECT r.result_json AS resultJson FROM capture_local_interpretation_results r
           JOIN capture_submission_inputs i ON i.account_id=r.account_id AND i.input_id=r.input_id
           WHERE r.account_id=? AND i.batch_id=? ORDER BY i.ordinal`,
          context.accountId,
          job.batch.batchId,
        );
        return rows.map((row) => JSON.parse(row.resultJson) as CaptureLocalResult);
      });
    },
    async localEvents(context: AccountRequestContext, jobId: string) {
      return gated(context, async () => {
        const job = await submissions.load(context, jobId);
        return db.getAllAsync<{
          inputId: string;
          sequence: number;
          state:
            "PENDING" | "PROCESSING" | "RETRYABLE" | "FAILED" | "LOCAL_RESULT_RECORDED";
          recordedAt: string;
          attemptCount: number;
        }>(
          `SELECT e.input_id AS inputId,e.sequence,e.state,e.recorded_at AS recordedAt,e.attempt_count AS attemptCount
           FROM capture_local_interpretation_events e JOIN capture_submission_inputs i ON i.account_id=e.account_id AND i.input_id=e.input_id
           WHERE e.account_id=? AND i.batch_id=? ORDER BY e.sequence`,
          context.accountId,
          job.batch.batchId,
        );
      });
    },
    async events(context: AccountRequestContext, jobId: string) {
      return gated(context, async () => {
        const job = await submissions.load(context, jobId);
        return db.getAllAsync<
          NonNullable<CaptureJobReadModel["processingEvents"]>[number]
        >(
          `SELECT e.input_id AS inputId,e.sequence,e.state,e.recorded_at AS recordedAt,e.attempt_count AS attemptCount
           FROM capture_processing_events e JOIN capture_submission_inputs i ON i.account_id=e.account_id AND i.input_id=e.input_id
           WHERE e.account_id=? AND i.batch_id=? ORDER BY e.sequence`,
          context.accountId,
          job.batch.batchId,
        );
      });
    },
    async listPending(context: AccountRequestContext) {
      return gated(context, () =>
        db.getAllAsync<SyncOperation>(
          `${select} WHERE owner_user_id=? AND operation_type IN (?,?) AND status IN ('PENDING','RETRYABLE')
         AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at,rowid`,
          context.accountId,
          kind,
          localKind,
          deps.now(),
        ),
      );
    },
    async nextWake(context: AccountRequestContext) {
      return gated(context, async () => {
        const row = await db.getFirstAsync<{ due: string | null }>(
          `SELECT MIN(CASE WHEN status IN ('PENDING','RETRYABLE')
              THEN COALESCE(next_attempt_at,?)
              WHEN status='PROCESSING' THEN COALESCE(lease_expires_at,?) END) AS due
           FROM sync_operations WHERE owner_user_id=? AND operation_type IN (?,?)
             AND status IN ('PENDING','RETRYABLE','PROCESSING')`,
          deps.now(),
          deps.now(),
          context.accountId,
          kind,
          localKind,
        );
        return row?.due ? Date.parse(row.due) : null;
      });
    },
    async recoverInterrupted(context: AccountRequestContext) {
      return gated(context, async () => {
        const now = deps.now();
        await db.runAsync(
          `UPDATE sync_operations SET status='RETRYABLE',next_attempt_at=NULL,claim_owner=NULL,
             lease_expires_at=NULL,updated_at=? WHERE owner_user_id=? AND operation_type IN (?,?)
             AND status='PROCESSING' AND (lease_expires_at IS NULL OR lease_expires_at<=?)`,
          now,
          context.accountId,
          kind,
          localKind,
          now,
        );
      });
    },
    async claim(context: AccountRequestContext, operation: SyncOperation) {
      return gated(context, async () => {
        const retained = await current(context, operation.id);
        if (
          !localKinds.includes(
            retained.operationType as typeof kind | typeof localKind,
          ) ||
          retained.status !== operation.status ||
          retained.baseVersion !== operation.baseVersion ||
          retained.payloadJson !== operation.payloadJson ||
          retained.attemptCount !== operation.attemptCount ||
          retained.nextAttemptAt !== operation.nextAttemptAt ||
          retained.claimOwner ||
          !["PENDING", "RETRYABLE"].includes(retained.status) ||
          (retained.nextAttemptAt !== null && retained.nextAttemptAt > deps.now())
        )
          return false;
        const now = deps.now();
        const owner = createSyncOperationClaimOwner();
        const updated = await db.runAsync(
          `UPDATE sync_operations SET status='PROCESSING',claim_owner=?,lease_expires_at=?,
           last_attempt_at=?,updated_at=? WHERE id=? AND owner_user_id=? AND operation_type=?
           AND status=? AND base_version=? AND payload_json=?
           AND attempt_count=? AND next_attempt_at IS ?
           AND (next_attempt_at IS NULL OR next_attempt_at<=?)`,
          owner,
          new Date(Date.parse(now) + 300000).toISOString(),
          now,
          now,
          operation.id,
          context.accountId,
          operation.operationType,
          operation.status,
          operation.baseVersion,
          operation.payloadJson,
          operation.attemptCount,
          operation.nextAttemptAt,
          now,
        );
        if (updated.changes === 1) operation.claimOwner = owner;
        return updated.changes === 1;
      });
    },
    async validate(context: AccountRequestContext, operation: SyncOperation) {
      const original = await gated(context, async () => {
        const retained = await current(context, operation.id);
        if (
          retained.status !== "PROCESSING" ||
          !operation.claimOwner ||
          retained.claimOwner !== operation.claimOwner ||
          retained.payloadJson !== operation.payloadJson
        )
          fail("CAPTURE_PROCESSING_CLAIM");
        return pinned(context, retained);
      });
      if (operation.operationType !== localKind) return;
      if (original.kind !== "FILE" && original.kind !== "IMAGE")
        fail("CAPTURE_LOCAL_UNSUPPORTED_KIND");
      const bridge = await import("@/native/captureLocalExtraction");
      const extracted = await bridge.extractCaptureLocal(
        original.bytes,
        localMediaType(original.kind, original.mediaType, original.bytes),
      );
      const textSha256 = await deps.sha256(new TextEncoder().encode(extracted.text));
      const capability = await bridge.readCaptureLocalModelCapability().catch(() => ({
        status: "UNAVAILABLE" as const,
      }));
      let result = buildCaptureLocalResult(
        original.pin.inputId,
        extracted,
        { sha256: original.pin.sha256, byteCount: original.pin.byteCount },
        textSha256,
        capability.status,
      );
      if (capability.status === "AVAILABLE" && needsCaptureLocalEnrichment(result)) {
        try {
          result = attachCaptureLocalModelEvidence(
            result,
            await bridge.enrichCaptureFlightLocal(result.text),
          );
        } catch {
          result = attachCaptureLocalModelEvidence(result, {
            status: "FAILED",
            reason: "LOCAL_MODEL_VALIDATION_FAILED",
            observations: [],
          });
        }
      }
      staged.set(operation.id, { owner: operation.claimOwner!, result });
    },
    async settle(
      context: AccountRequestContext,
      operation: SyncOperation,
      error?: Error,
      next?: string,
    ) {
      return gated(context, async () => {
        const retained = await current(context, operation.id);
        if (
          retained.status !== "PROCESSING" ||
          !operation.claimOwner ||
          retained.claimOwner !== operation.claimOwner ||
          retained.payloadJson !== operation.payloadJson
        )
          fail("CAPTURE_PROCESSING_CLAIM");
        let failure = error;
        if (!failure) {
          try {
            await pinned(context, retained);
          } catch (caught) {
            failure =
              caught instanceof Error
                ? caught
                : new Error("CAPTURE_PROCESSING_VALIDATION");
          }
        }
        const local = operation.operationType === localKind;
        const prepared = local ? staged.get(operation.id) : undefined;
        if (local && !failure && (!prepared || prepared.owner !== operation.claimOwner))
          failure = new Error("CAPTURE_LOCAL_RESULT_MISSING");
        const terminal =
          failure?.message === "CAPTURE_PROCESSING_STALE_PIN" ||
          failure?.message === "CAPTURE_PROCESSING_HASH_MISMATCH" ||
          failure?.message === "CAPTURE_PROCESSING_SCOPE" ||
          failure?.message === "CAPTURE_PROCESSING_PIN" ||
          failure?.message === "CAPTURE_LOCAL_PREREQUISITE" ||
          failure?.message === "CAPTURE_LOCAL_UNSUPPORTED_KIND" ||
          failure?.message === "CAPTURE_LOCAL_UNSUPPORTED_MEDIA" ||
          failure?.message.startsWith("CAPTURE_LOCAL_ORIGINAL_") ||
          failure?.message.startsWith("CAPTURE_LOCAL_PDF_") ||
          failure?.message.startsWith("CAPTURE_LOCAL_OCR_") ||
          failure?.message.startsWith("CAPTURE_LOCAL_SPAN_") ||
          failure?.message.startsWith("CAPTURE_LOCAL_TEXT_") ||
          failure?.message === "CAPTURE_OCR_MAPPING_INVALID" ||
          failure?.message === "CAPTURE_ORIGINAL_MISMATCH" ||
          failure?.message === "PDF_ORIGINAL_MISMATCH" ||
          failure?.message === "PDF_PAGE_MAPPING_INVALID" ||
          failure instanceof ZodError ||
          (failure instanceof LocalCaptureError && failure.code === "INTEGRITY");
        const status = failure ? (terminal ? "FAILED" : "RETRYABLE") : "COMPLETED";
        const errorCode = failure
          ? terminal && /^[A-Z0-9_]{1,80}$/.test(failure.message)
            ? failure.message
            : local
              ? "CAPTURE_LOCAL_RETRY_OR_INVALID"
              : "CAPTURE_PROCESSING_RETRY"
          : null;
        if (local && status === "COMPLETED") {
          const result = prepared!.result;
          await db.runAsync(
            `INSERT INTO capture_local_interpretation_results(account_id,input_id,operation_id,original_sha256,original_byte_count,result_json,recorded_at)
             VALUES(?,?,?,?,?,?,?)`,
            context.accountId,
            operation.entityId,
            operation.id,
            result.originalSha256,
            result.originalByteCount,
            JSON.stringify(result),
            deps.now(),
          );
        }
        const result = await db.runAsync(
          `UPDATE sync_operations SET status=?,attempt_count=attempt_count+?,next_attempt_at=?,
           last_error_code=?,claim_owner=NULL,lease_expires_at=NULL,updated_at=?
           WHERE id=? AND owner_user_id=? AND operation_type=? AND status='PROCESSING' AND claim_owner=? AND payload_json=?`,
          status,
          failure ? 1 : 0,
          status === "RETRYABLE" ? (next ?? deps.now()) : null,
          errorCode,
          deps.now(),
          operation.id,
          context.accountId,
          operation.operationType,
          operation.claimOwner!,
          operation.payloadJson,
        );
        if (result.changes !== 1) fail("CAPTURE_PROCESSING_CAS");
        if (local) staged.delete(operation.id);
      });
    },
    async run(context: AccountRequestContext) {
      const repository = this;
      return createSyncEngine(
        {
          listPending: () => repository.listPending(context),
          recoverInterrupted: () => repository.recoverInterrupted(context),
          claimOperation: (operation) => repository.claim(context, operation),
          settleOperation: (operation, error, next) =>
            repository.settle(context, operation, error, next),
          markProcessing: async () => fail("CAPTURE_PROCESSING_UNSCOPED"),
          markCompleted: async () => fail("CAPTURE_PROCESSING_UNSCOPED"),
          markRetryable: async () => fail("CAPTURE_PROCESSING_UNSCOPED"),
        },
        { push: (operation) => repository.validate(context, operation) },
        (attempt) => nextSyncAttemptAt(attempt, Date.parse(deps.now())),
        (operation) =>
          localKinds.includes(operation.operationType as typeof kind | typeof localKind),
        true,
      ).run("AUTHENTICATED_ONLINE");
    },
  };
}
