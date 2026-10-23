import { z } from "zod";
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
// Trusted finite operator supplies only existing Source command IDs. There are no Task/Run IDs here.
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
    const admissionKey =
      "u-source:" +
      (await deps.hash(
        new TextEncoder().encode(canonicalEventJson([job.batch.batchId, input.id])),
      ));
    await deps.sources.admit(context, {
      id: p.bindingId,
      admission_key: admissionKey,
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
