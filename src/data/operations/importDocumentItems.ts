import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { coreSourcePlanReadV2Schema } from "@/domain/trip/tripCoreV2SourceContract";
import { universalP1Identity } from "@/domain/trip/universalImportIdentity";
import { assertUniversalCaptureResult } from "./universalCaptureConsumer";
import type { UniversalImportResult } from "../api/universalImportContracts";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  ImportDocument,
  ImportDocumentScope,
} from "../repositories/importDocumentsRepository";
import type { CoreSourcePlanReadTransport } from "../api/tripCoreV2Transport";
export type ImportDocumentItem = {
  itemId: string;
  operationId: string;
  sourceId: string;
  sourceRevision: number;
  planId: string;
};

export async function readImportDocumentItems(
  context: AccountRequestContext,
  document: ImportDocument,
  bindings: readonly { sourceId: string; sourceRevision: number; tripId?: string }[],
  model: CaptureJobReadModel,
  result: UniversalImportResult,
  deps: {
    getAccountId(): Promise<string>;
    isCurrent(): boolean;
    transport: CoreSourcePlanReadTransport;
  },
): Promise<ImportDocumentItem[]> {
  const current = async () => {
    if (!deps.isCurrent()) throw Error("DOCUMENTS_STALE");
    await assertAccountRequestContext(context, deps.getAccountId);
  };
  await current();
  assertUniversalCaptureResult(model, result);
  const input = model.inputs.find((i) => i.id === document.inputId);
  if (
    document.accountId !== context.accountId ||
    result.accountId !== context.accountId ||
    result.tripId !== context.tripId ||
    (document.tripId !== context.tripId &&
      !(document.tripId === null && bindings.some((b) => b.tripId === context.tripId))) ||
    document.batchId !== model.batch.batchId ||
    document.jobId !== model.batch.jobId ||
    !input ||
    input.captureId !== document.captureId ||
    input.payloadId !== document.payloadId ||
    input.contentSha256 !== document.sha256 ||
    input.contentByteCount !== document.byteCount
  )
    throw Error("DOCUMENTS_SCOPE_MISMATCH");
  const sources = result.sourceBindings.filter(
    (b) =>
      b.inputId === document.inputId &&
      bindings.some(
        (link) =>
          link.sourceId === b.sourceId &&
          link.sourceRevision === b.revision &&
          (document.tripId !== null || link.tripId === context.tripId),
      ),
  );
  if (!sources.length) throw Error("DOCUMENTS_SOURCE_UNAVAILABLE");
  const aliases = new Set(sources.map((s) => s.alias));
  const linked = new Map<string, ImportDocumentItem>();
  for (const candidate of result.candidates) {
    if (
      !["P1", "P2", "P3", "P4", "P5", "P6"].includes(candidate.kind) ||
      !candidate.fields.some((field) => aliases.has(field.sourceId))
    )
      continue;
    await current();
    const prefix = candidate.kind === "P2" ? "p2-" : "";
    const planId = universalP1Identity(result.taskId, candidate.token, prefix + "plan");
    const raw = await deps.transport.sourcePlan(context, planId);
    await current();
    if (!raw) continue;
    const { plan, status } = coreSourcePlanReadV2Schema.parse(raw);
    if (
      plan.accountId !== context.accountId ||
      plan.tripId !== context.tripId ||
      plan.planId !== planId
    )
      throw Error("DOCUMENTS_SCOPE_MISMATCH");
    if (
      plan.mode !== "REVIEWED_SOURCE" ||
      !sources.some(
        (s) => s.sourceId === plan.sourceId && s.revision === plan.sourceRevision,
      )
    )
      continue;
    const candidateId = universalP1Identity(
        result.taskId,
        candidate.token,
        prefix + "candidate",
      ),
      operationId = universalP1Identity(
        result.taskId,
        candidate.token,
        prefix + "operation",
      ),
      itemId = universalP1Identity(result.taskId, candidate.token, prefix + "item");
    const slot = plan.slots.find(
      (s) =>
        s.candidateId === candidateId &&
        s.operationId === operationId &&
        s.targetKind === "ITEM" &&
        s.target.existingId === itemId &&
        s.command === (candidate.kind === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM"),
    );
    if (
      !slot ||
      !status.slots.some(
        (s) =>
          s.slotId === slot.slotId &&
          s.operationId === operationId &&
          s.targetId === itemId &&
          s.outcome === "COMPLETE" &&
          s.domainReceiptId &&
          s.committedRevision !== null,
      )
    )
      continue;
    linked.set(itemId, {
      itemId,
      operationId,
      sourceId: plan.sourceId,
      sourceRevision: plan.sourceRevision,
      planId,
    });
  }
  await current();
  return [...linked.values()];
}

// shortcut: follows the repository-selected Batch; extend when cross-Batch document history is exposed.
export async function readDefaultImportDocumentItems(
  context: AccountRequestContext,
  scope: ImportDocumentScope,
  expected: ImportDocument,
  isCurrent: () => boolean,
) {
  if (!isCurrent()) return null;
  const [
    { requireAdoptedUserId },
    { getDefaultImportDocumentsRepository },
    { reopenDefaultCaptureJob },
    { createUniversalImportTransport },
    { createCoreV2Transport },
    { tripCoreSha256Hex },
  ] = await Promise.all([
    import("../auth/authRepository"),
    import("./defaultImportDocuments"),
    import("./defaultCaptureSubmission"),
    import("../api/universalImportTransport"),
    import("../api/tripCoreV2Transport"),
    import("../repositories/tripCoreSha256"),
  ]);
  await assertAccountRequestContext(context, requireAdoptedUserId);
  if (!isCurrent()) throw Error("DOCUMENTS_STALE");
  const repository = await getDefaultImportDocumentsRepository(),
    document = await repository.read(context, scope, expected.captureId),
    bindings = await repository.sourceLinks(context, scope, expected.captureId);
  if (!isCurrent()) throw Error("DOCUMENTS_STALE");
  if (JSON.stringify(document) !== JSON.stringify(expected))
    throw Error("DOCUMENTS_ORIGINAL_CHANGED");
  if (!document.jobId || !document.batchId || !bindings.length) return null;
  const baseUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
  if (!baseUrl) throw Error("DOCUMENTS_UNAVAILABLE");
  const model = await reopenDefaultCaptureJob(document.jobId);
  await assertAccountRequestContext(context, requireAdoptedUserId);
  if (!isCurrent()) throw Error("DOCUMENTS_STALE");
  const tripId = scope === "TRIP" ? context.tripId : model.batch.context.tripPrior?.id;
  if (!tripId || !bindings.some((b) => b.tripId === tripId)) return null;
  const sourceContext = await captureAccountRequestContext(tripId, requireAdoptedUserId);
  await assertAccountRequestContext(context, requireAdoptedUserId);
  if (sourceContext.accountId !== context.accountId)
    throw Error("DOCUMENTS_SCOPE_MISMATCH");
  const universal = createUniversalImportTransport(requireAdoptedUserId, {
    baseUrl,
    assertCurrent: () => {
      if (!isCurrent()) throw Error("DOCUMENTS_STALE");
    },
  });
  const binding = await universal.context(sourceContext, document.batchId),
    result = await universal.result(sourceContext, binding);
  const items = await readImportDocumentItems(
    sourceContext,
    document,
    bindings.filter((b) => b.tripId === tripId),
    model,
    result,
    {
      getAccountId: requireAdoptedUserId,
      isCurrent,
      transport: createCoreV2Transport(requireAdoptedUserId, tripCoreSha256Hex, {
        baseUrl,
        timeoutMs: 60000,
      }),
    },
  );
  const after = await repository.read(context, scope, expected.captureId);
  if (!isCurrent() || JSON.stringify(after) !== JSON.stringify(expected))
    throw Error("DOCUMENTS_ORIGINAL_CHANGED");
  return items;
}
