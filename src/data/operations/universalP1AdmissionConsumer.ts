import {
  universalP2SourceReviewSchema,
  type UniversalP2SourceReview,
} from "../../domain/trip/universalP2SourceReview";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import { validateCoreCommand } from "../../domain/trip/tripCoreV2Commands";
import { canonicalCoreJson, type Json } from "../../domain/trip/tripCoreV2Json";
import { coreUniversalP1PublishResultSchema } from "../../domain/trip/tripCoreV2SourceContract";
import type { UniversalImportResult } from "../api/universalImportContracts";
import type { createCoreV2Transport } from "../api/tripCoreV2Transport";
import type { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import {
  assertAccountRequestContext,
  captureAccountRequestContext,
} from "../auth/accountRequestContext";
import { assertUniversalCaptureResult } from "./universalCaptureConsumer";
import {
  universalItemSourceReviewSchema,
  type UniversalItemSourceReview,
} from "../../domain/trip/universalP1SourceReview";
type Core = ReturnType<typeof createTripCoreV2Repository>;
const json = (v: unknown) => canonicalCoreJson(v as Json);
// Explicit confirmation only. Existing owning Repository/Queue/worker control mutation and recovery.
export function createUniversalP1AdmissionConsumer(deps: {
  getAccountId(): Promise<string>;
  isCurrent(): boolean;
  core: Pick<Core, "enqueue" | "resume" | "applyReceipt" | "refresh">;
  transport: ReturnType<typeof createCoreV2Transport>;
  sync?(
    context: import("../auth/accountRequestContext").AccountRequestContext,
    operationId: string,
  ): Promise<unknown>;
}) {
  const current = () => {
    if (!deps.isCurrent()) throw Error("UNIVERSAL_CAPTURE_STALE");
  };
  return {
    async confirm(
      model: CaptureJobReadModel,
      result: UniversalImportResult,
      token: string,
      sourceReview?: UniversalItemSourceReview | UniversalP2SourceReview,
    ) {
      current();
      assertUniversalCaptureResult(model, result);
      const context = await captureAccountRequestContext(
          result.tripId,
          deps.getAccountId,
        ),
        candidates = result.candidates.filter((c) => c.token === token);
      if (
        context.accountId !== result.accountId ||
        candidates.length !== 1 ||
        !["P1", "P2", "P3", "P4", "P5"].includes(candidates[0].kind) ||
        candidates[0].subtype !==
          (candidates[0].kind === "P3"
            ? "ACCOMMODATION"
            : candidates[0].kind === "P4"
              ? "RENTAL_CAR"
              : candidates[0].kind === "P2"
                ? "FLIGHT"
                : candidates[0].kind === "P5"
                  ? "TRAIN"
                  : "ACTIVITY") ||
        result.providerOutcome !== "SETTLED" ||
        !deps.transport.publishUniversalP1
      )
        throw Error("OWNING_ADMISSION_UNAVAILABLE");
      const flight = candidates[0].kind === "P2";
      if ((flight || ["P4", "P5"].includes(candidates[0].kind)) && !sourceReview)
        throw Error("OWNING_REVIEW_REQUIRED");
      const review = flight
        ? universalP2SourceReviewSchema.parse(sourceReview)
        : sourceReview
          ? universalItemSourceReviewSchema.parse(sourceReview)
          : undefined;
      const aliases = new Set(
        candidates[0].fields
          .filter((f) =>
            (flight
              ? ["service", "flight_number", "marketing_flight", "origin.local_date"]
              : [
                  "service",
                  "service.number",
                  "transport_subtype",
                  "operator",
                  "operator.name",
                  "origin.local_date",
                  "activity.name",
                  "title",
                  "activity.date",
                  "property.name",
                  "check_in.date",
                  "check_out.date",
                  "pickup.date",
                  "return.date",
                  "schedule.end.local_date",
                  "schedule.start.local_date",
                ]
            ).includes(f.path),
          )
          .map((f) => f.sourceId),
      );
      const sources = result.sourceBindings.filter((b) => aliases.has(b.alias));
      if (!sources.length || new Set(sources.map((s) => s.sourceId)).size !== 1)
        throw Error("SOURCE_RELATION_QUALIFICATION_REQUIRED");
      const publication = coreUniversalP1PublishResultSchema.parse(
        await deps.transport.publishUniversalP1(context, {
          captureVersion: 2,
          sourceId: sources[0].sourceId,
          batchId: result.batchId,
          taskId: result.taskId,
          token,
          requestSha256: result.requestSha256,
          ...(flight
            ? { family: "P2" as const }
            : candidates[0].kind === "P5"
              ? { family: "P5" as const }
              : candidates[0].kind === "P4"
                ? { family: "P4" as const }
                : candidates[0].kind === "P3"
                  ? { family: "P3" as const }
                  : {}),
          ...(review ? { sourceReview: review } : {}),
        }),
      );
      current();
      await assertAccountRequestContext(context, deps.getAccountId);
      const plan = publication.proposedPlan,
        slot = plan.slots[0];
      if (
        plan.mode !== "REVIEWED_SOURCE" ||
        plan.policyVersion !== null ||
        plan.slots.length !== 1 ||
        plan.candidateIds.length !== 1 ||
        plan.sourceId !== sources[0].sourceId ||
        slot.command !== (flight ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM") ||
        slot.targetKind !== "ITEM" ||
        (flight
          ? review?.version !== "otr.universal.p2-source-review/1" ||
            plan.sourceRevision !== review.sourceRevision ||
            (slot.payload as { flightNumberLiteral?: string }).flightNumberLiteral !==
              review.flightNumberLiteral ||
            (slot.payload as { departureDate?: string }).departureDate !==
              review.departureDate
          : (slot.payload as { family?: string }).family !== candidates[0].kind)
      )
        throw Error("CORE_PUBLICATION_SCOPE_MISMATCH");
      const expected = validateCoreCommand({
        contractVersion: 2,
        intentVersion: 2,
        operationId: slot.operationId,
        tripId: context.tripId,
        command: slot.command,
        target: slot.target,
        baseVector: slot.baseVector,
        admission: {
          mode: "REVIEWED_SOURCE",
          sourceIntentId: slot.slotId,
          policyVersion: null,
        },
        payload: slot.payload,
      });
      const prepared = await deps.transport.prepareSourcePlan(context, plan);
      current();
      await assertAccountRequestContext(context, deps.getAccountId);
      if (prepared.readyCommands.length > 1)
        throw Error("CORE_PREPARATION_SCOPE_MISMATCH");
      if (prepared.readyCommands.length === 1) {
        if (json(validateCoreCommand(prepared.readyCommands[0])) !== json(expected))
          throw Error("CORE_PREPARATION_SCOPE_MISMATCH");
        await deps.core.enqueue(context, expected);
        current();
        await assertAccountRequestContext(context, deps.getAccountId);
        await deps.core.resume(context, expected.operationId);
        if (!deps.sync)
          return {
            status: "SYNC_PENDING" as const,
            itemId: slot.target.id,
            operationId: slot.operationId,
          };
        await deps.sync(context, slot.operationId);
        current();
        await assertAccountRequestContext(context, deps.getAccountId);
      }
      const own = prepared.plan.slots.find((s) => s.slotId === slot.slotId);
      if (
        prepared.readyCommands.length === 0 &&
        (!own ||
          !["DOMAIN_SUCCEEDED", "EVIDENCE_PENDING", "COMPLETE"].includes(own.state))
      )
        return {
          status: "OWNING_ADMISSION_PENDING" as const,
          reasons: prepared.reviewSlots,
        };
      const receipt = await deps.transport.receipt(context, slot.operationId);
      current();
      await assertAccountRequestContext(context, deps.getAccountId);
      if (!receipt && prepared.readyCommands.length === 1)
        return {
          status: "SYNC_PENDING" as const,
          itemId: slot.target.id,
          operationId: slot.operationId,
        };
      if (
        receipt?.projection !== "FULL" ||
        !["APPLIED", "NO_CHANGE"].includes(receipt.receipt.outcome) ||
        receipt.receipt.operationId !== slot.operationId ||
        receipt.receipt.tripId !== context.tripId ||
        receipt.receipt.actorAccountId !== context.accountId ||
        !receipt.receipt.targetVector.some(
          (v) => v.kind === "ITEM" && v.id === slot.target.id,
        )
      )
        throw Error("CORE_RECEIPT_SCOPE_MISMATCH");
      await deps.core.enqueue(context, expected);
      await deps.core.applyReceipt(context, receipt.receipt);
      const finalized = await deps.transport.finalizeSourceSlot(context, plan.planId, {
        captureVersion: 2,
        slotId: slot.slotId,
        operationId: slot.operationId,
        intentSha256: receipt.receipt.intentSha256,
        domainReceiptId: receipt.domainReceiptId,
        receiptSha256: receipt.receipt.receiptSha256,
      });
      current();
      await assertAccountRequestContext(context, deps.getAccountId);
      if (finalized.state !== "COMPLETE")
        return {
          status: "OWNING_ADMISSION_PENDING" as const,
          reasons: [finalized.errorCode],
        };
      await deps.core.refresh(context, deps.transport);
      current();
      await assertAccountRequestContext(context, deps.getAccountId);
      return {
        status: "SERVER_ACCEPTED" as const,
        itemId: slot.target.id,
        operationId: slot.operationId,
      };
    },
  };
}

// Read retained bytes through the existing account-scoped inbox, never via UI filesystem access.
export async function readUniversalP1ReviewOriginal(
  model: CaptureJobReadModel,
  result: UniversalImportResult,
  token: string,
  deps: {
    getAccountId(): Promise<string>;
    isCurrent(): boolean;
    hash(bytes: Uint8Array): Promise<string>;
    readCapture(
      id: string,
    ): Promise<{ capture: { accountId: string; payloadId: string }; bytes: Uint8Array }>;
  },
) {
  const current = async () => {
    if (!deps.isCurrent() || (await deps.getAccountId()) !== result.accountId)
      throw Error("UNIVERSAL_CAPTURE_STALE");
  };
  await current();
  assertUniversalCaptureResult(model, result);
  const candidates = result.candidates.filter(
    (c) => c.token === token && ["P1", "P2", "P3", "P4", "P5"].includes(c.kind),
  );
  if (candidates.length !== 1) throw Error("OWNING_REVIEW_REQUIRED");
  const aliases = new Set(candidates[0].fields.map((f) => f.sourceId));
  const sources = result.sourceBindings.filter((s) => aliases.has(s.alias));
  if (sources.length !== 1) throw Error("SOURCE_RELATION_QUALIFICATION_REQUIRED");
  const source = sources[0],
    input = model.inputs.find((i) => i.id === source.inputId);
  if (
    !input?.captureId ||
    !input.payloadId ||
    input.state !== "ACCEPTED" ||
    input.contentByteCount === null ||
    input.contentByteCount > 65536
  )
    throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
  const retained = await deps.readCapture(input.captureId);
  await current();
  if (
    retained.capture.accountId !== result.accountId ||
    retained.capture.payloadId !== input.payloadId ||
    retained.bytes.length !== input.contentByteCount ||
    retained.bytes.length > 65536 ||
    (await deps.hash(retained.bytes)) !== source.originalSha256 ||
    source.originalSha256 !== input.contentSha256 ||
    source.submittedSha256 !== source.originalSha256
  )
    throw Error("IMPORT_EVIDENCE_INVALID");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    retained.bytes,
  );
  await current();
  return text;
}
