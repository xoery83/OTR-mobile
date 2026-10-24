import { z } from "zod";
import { verifyUtf8TextFile } from "@/domain/capture/utf8TextFile";
import { validateCaptureUtf8 } from "../files/capturePayloadReader";
import { canonicalSubmission } from "@/domain/capture/captureSubmission";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createCaptureSubmissionRepository } from "../repositories/captureSubmissionRepository";
import type { createLocalCaptureInboxRepository } from "../repositories/localCaptureInboxRepository";
import type { createCaptureSourceAdmissionRepository } from "../repositories/captureSourceAdmissionRepository";
import type { ImportHash } from "@/domain/trip/flightImportReview";

const plan = z.strictObject({
  inputId: z.uuid(),
  bindingId: z.uuid(),
  sourceId: z.uuid(),
  representationId: z.uuid(),
  operationId: z.uuid(),
  operationKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
});
async function admissionKey(batchId: string, inputId: string, hash: ImportHash) {
  return (
    "u-source:" +
    (await hash(new TextEncoder().encode(canonicalEventJson([batchId, inputId]))))
  );
}
// Source command IDs are created locally once and retained by the existing owning binding.
// Reopen derives the same key from real C3 identities; no Task/Run identity is minted.
export async function recoverUniversalOriginalPlans(
  context: AccountRequestContext,
  jobId: string,
  deps: Parameters<typeof prepareUniversalOriginalBatch>[3] & { newId(): string },
) {
  await assertAccountRequestContext(context, deps.getAccountId);
  const job = await deps.submissions.reopen(jobId, context);
  if (
    !job.allInputsAccepted ||
    job.batch.accountId !== context.accountId ||
    job.inputs.some(
      (i) =>
        i.kind !== "TEXT" &&
        !(i.kind === "FILE" && i.declaredContentType === "text/plain"),
    )
  )
    throw new Error("UNIVERSAL_SOURCE_PROFILE_UNAVAILABLE");
  const plans = [];
  for (const input of job.inputs) {
    const key = await admissionKey(job.batch.batchId, input.id, deps.hash);
    const existing = await deps.sources.readAdmissionByKey(context, key);
    if (
      existing &&
      (existing.intent_kind !== "NEW" || existing.capture_id !== input.captureId)
    )
      throw new Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
    plans.push(
      plan.parse(
        existing
          ? {
              inputId: input.id,
              bindingId: existing.id,
              sourceId: existing.source_id,
              representationId: existing.representation_id,
              operationId: existing.source_operation_id,
              operationKey: existing.source_operation_key,
            }
          : {
              inputId: input.id,
              bindingId: deps.newId(),
              sourceId: deps.newId(),
              representationId: deps.newId(),
              operationId: deps.newId(),
              operationKey: deps.newId(),
            },
      ),
    );
  }
  await assertAccountRequestContext(context, deps.getAccountId);
  return plans;
}

// Operator readback only. These local command pins are proposals, never remote Source Proof.
// Missing bindings remain missing; no ID generation, Source admission, queue or network work.
export async function readUniversalOriginalPins(
  context: AccountRequestContext,
  jobId: string,
  deps: Parameters<typeof prepareUniversalOriginalBatch>[3],
) {
  const current = () => assertAccountRequestContext(context, deps.getAccountId);
  await current();
  const job = await deps.submissions.reopen(jobId, context);
  if (
    job.batch.accountId !== context.accountId ||
    job.batch.context.tripPrior?.id !== context.tripId ||
    !job.allInputsAccepted
  )
    throw Error("UNIVERSAL_CAPTURE_BATCH_NOT_READY");
  const inputs = [];
  for (const input of job.inputs) {
    await current();
    if (!input.captureId || !input.payloadId || input.state !== "ACCEPTED")
      throw Error("UNIVERSAL_CAPTURE_BATCH_NOT_READY");
    const retained = await deps.captures.getForSourceHandoff(input.captureId);
    if (
      retained.capture.accountId !== context.accountId ||
      retained.capture.payloadId !== input.payloadId ||
      retained.bytes.length !== input.contentByteCount ||
      (await deps.hash(retained.bytes)) !== input.contentSha256
    )
      throw Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
    if (input.kind === "FILE")
      verifyUtf8TextFile(
        retained.bytes,
        input.originalFilename,
        input.declaredContentType,
      );
    else if (input.kind === "TEXT") validateCaptureUtf8(retained.bytes);
    else throw Error("UNIVERSAL_SOURCE_PROFILE_UNAVAILABLE");
    const binding = await deps.sources.readAdmissionByKey(
      context,
      await admissionKey(job.batch.batchId, input.id, deps.hash),
    );
    if (
      binding &&
      (binding.intent_kind !== "NEW" ||
        binding.capture_id !== input.captureId ||
        binding.capture_payload_id !== input.payloadId ||
        binding.material_sha256 !== input.contentSha256 ||
        binding.byte_count !== input.contentByteCount ||
        binding.capture_revision !== retained.capture.revision ||
        retained.capture.tripId !== context.tripId)
    )
      throw Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
    const recovery = binding
      ? await deps.sources.recovery(context, binding.id as string)
      : null;
    const command = (
      recovery?.command as { source_command?: Record<string, Json> } | null
    )?.source_command;
    const payload = command?.payload as Record<string, Json> | undefined;
    const original = payload?.original as Record<string, Json> | undefined;
    const sourceInput = payload?.source_input as Record<string, Json> | undefined;
    if (
      binding &&
      (!recovery?.operationId ||
        command?.actor_account_id !== context.accountId ||
        command?.trip_id !== context.tripId ||
        command?.operation_id !== binding.source_operation_id ||
        command?.operation_key !== binding.source_operation_key ||
        command?.operation_sha256 !== binding.source_operation_sha256 ||
        command?.source_id !== binding.source_id ||
        original?.id !== binding.representation_id ||
        original?.payload_sha256 !== input.contentSha256 ||
        original?.byte_count !== input.contentByteCount ||
        original?.original_filename !== input.originalFilename ||
        sourceInput?.source_kind !== input.kind ||
        sourceInput?.acquisition_channel !== (input.kind === "FILE" ? "FILES" : "PASTE"))
    )
      throw Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
    inputs.push({
      inputId: input.id,
      ordinal: input.ordinal,
      kind: input.kind,
      acquisitionSource: input.acquisitionSource,
      originalFilename: input.originalFilename,
      byteCount: input.contentByteCount,
      sha256: input.contentSha256,
      bindingId: binding?.id ?? null,
      sourceState: binding?.state ?? "SOURCE_OPERATION_NOT_PREPARED",
      queueOperationId: recovery?.operationId ?? null,
      sourceCommandPin: binding
        ? {
            profile:
              input.kind === "FILE" ? "OTR_UTF8_TEXT_FILE_V1" : "OTR_SUBMITTED_TEXT_V1",
            actorId: context.accountId,
            tripId: context.tripId,
            sourceId: binding.source_id,
            representationId: binding.representation_id,
            operationId: binding.source_operation_id,
            operationKey: binding.source_operation_key,
            operationSha256: binding.source_operation_sha256,
          }
        : null,
    });
  }
  const submissionSha256 = await deps.hash(
    new TextEncoder().encode(canonicalSubmission(job.batch)),
  );
  await current();
  return {
    version: "otr.native.universal-pin-proposal/1" as const,
    qualification: "LOCAL_C3_AND_EXISTING_COMMANDS_ONLY_NOT_SOURCE_PROOF" as const,
    accountId: context.accountId,
    tripId: context.tripId,
    batchId: job.batch.batchId,
    jobId: job.batch.jobId,
    createdAt: job.batch.createdAt,
    submissionSha256,
    inputs,
  };
}

// Plans contain only Source command IDs, recovered by the owning admission key or supplied by the finite operator. No Task/Run IDs.
// The retained C3 job and its original bytes remain the identity/provenance authority.
export async function prepareUniversalOriginalBatch(
  context: AccountRequestContext,
  jobId: string,
  rawPlans: unknown,
  deps: {
    getAccountId(): Promise<string>;
    hash: ImportHash;
    submissions: ReturnType<typeof createCaptureSubmissionRepository>;
    captures: ReturnType<typeof createLocalCaptureInboxRepository>;
    sources: ReturnType<typeof createCaptureSourceAdmissionRepository>;
  },
) {
  const plans = z.array(plan).min(1).max(64).parse(rawPlans);
  for (const field of [
    "inputId",
    "bindingId",
    "sourceId",
    "representationId",
    "operationId",
    "operationKey",
  ] as const)
    if (new Set(plans.map((p) => p[field])).size !== plans.length)
      throw new Error("UNIVERSAL_SOURCE_PLAN_REUSED");
  const current = () => assertAccountRequestContext(context, deps.getAccountId);
  await current();
  const job = await deps.submissions.reopen(jobId, context);
  await current();
  if (job.batch.accountId !== context.accountId || !job.allInputsAccepted)
    throw new Error("UNIVERSAL_CAPTURE_BATCH_NOT_READY");
  const selected = plans.map((p) => {
    const input = job.inputs.find((i) => i.id === p.inputId);
    if (
      !input ||
      !input.captureId ||
      !input.payloadId ||
      input.state !== "ACCEPTED" ||
      (input.kind !== "TEXT" &&
        !(input.kind === "FILE" && input.declaredContentType === "text/plain"))
    )
      throw new Error("UNIVERSAL_SOURCE_PROFILE_UNAVAILABLE");
    return { p, input };
  });
  const outputs = [];
  for (const { p, input } of selected) {
    await current();
    const retained = await deps.captures.getForSourceHandoff(input.captureId!);
    await current();
    if (
      retained.capture.accountId !== context.accountId ||
      retained.capture.payloadId !== input.payloadId ||
      retained.bytes.length !== input.contentByteCount ||
      (await deps.hash(retained.bytes)) !== input.contentSha256 ||
      (retained.capture.tripId !== null && retained.capture.tripId !== context.tripId)
    )
      throw new Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
    const capture =
      retained.capture.tripId === context.tripId
        ? retained.capture
        : await deps.captures.assign(
            retained.capture.id,
            context.tripId,
            retained.capture.revision,
          );
    await current();
    const key = await admissionKey(job.batch.batchId, input.id, deps.hash);
    await deps.sources.admit(context, {
      id: p.bindingId,
      admission_key: key,
      capture_id: capture.id,
      capture_revision: capture.revision,
      intent_kind: "NEW",
      source_id: p.sourceId,
      representation_id: p.representationId,
      material_revision: 1,
      expected_source_revision: null,
      source_operation_id: p.operationId,
      source_operation_key: p.operationKey,
    });
    const recovery = await deps.sources.recovery(context, p.bindingId);
    await current();
    outputs.push({
      inputId: input.id,
      bindingId: p.bindingId,
      sourceId: p.sourceId,
      representationId: p.representationId,
      operationId: p.operationId,
      queueOperationId: recovery.operationId,
      sourceCommand: (recovery.command as { source_command: Json }).source_command,
    });
  }
  const submissionSha256 = await deps.hash(
    new TextEncoder().encode(canonicalSubmission(job.batch)),
  );
  await current();
  return {
    batchId: job.batch.batchId,
    jobId: job.batch.jobId,
    tripId: context.tripId,
    submissionSha256,
    inputs: outputs,
    unhandledInputIds: job.inputs
      .filter((i) => !plans.some((p) => p.inputId === i.id))
      .map((i) => i.id),
  };
}

// Source-only phase: real existing authenticated catalog read + owning SQLite install.
// Stop this phase before trusted Operator prepareInputs introduces versioned Run3 catalogs.
export async function runUniversalOriginalBatch(
  context: AccountRequestContext,
  jobId: string,
  plans: unknown,
  deps: Parameters<typeof prepareUniversalOriginalBatch>[3] & {
    database: import("../sync/syncOperationRepository").SyncQueueDatabase;
    transport: import("../api/universalOriginalSourceTransport").UniversalOriginalSourceTransport;
    catalog: ReturnType<
      typeof import("../api/tripPublicationCatalogTransport").createTripPublicationCatalogTransport
    >;
    imports: ReturnType<
      typeof import("../repositories/tripImportAdmissionRepository").createTripImportAdmissionRepository
    >;
  },
) {
  const prepared = await prepareUniversalOriginalBatch(context, jobId, plans, deps);
  const { dispatchUniversalOriginalSource } = await import("./universalOriginalSource");
  const results = [];
  for (const input of prepared.inputs) {
    const result = await dispatchUniversalOriginalSource(context, input.bindingId, {
      database: deps.database,
      getAccountId: deps.getAccountId,
      repository: deps.sources,
      transport: deps.transport,
      refreshOwningCatalog: async (c) => {
        const raw = await deps.catalog.read(c);
        await deps.imports.applyCatalogs(c, raw);
      },
    });
    results.push({ inputId: input.inputId, ...result });
    if (result.state !== "ADMITTED") break;
  }
  return { ...prepared, results };
}
