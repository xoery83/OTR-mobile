import {
  coreUniversalP1PublishRequestSchema,
  coreUniversalP1PublishResultSchema,
} from "../../domain/trip/tripCoreV2SourceContract";
import { z } from "zod";
import { createAuthenticatedApiClient } from "./authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "./client";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  coreCapabilitiesSchema,
  validateCoreCommand,
  type CoreCommand,
} from "../../domain/trip/tripCoreV2Commands";
import { coreUuid, coreHash } from "../../domain/trip/tripCoreV2";
import { canonicalCoreJson, parseCoreJson } from "../../domain/trip/tripCoreV2Json";
import {
  validateCoreReceipt,
  type CoreReceiptProjection,
} from "../../domain/trip/tripCoreV2Receipt";
import {
  coreCandidatePublicationV2Schema,
  coreCandidatePublicationResultSchema,
  candidatePublicationRequestHash,
  type CoreCandidatePublicationV2,
  type CoreCandidatePublicationResult,
} from "../../domain/trip/tripCoreV2CandidatePublication";
import {
  coreSourcePrepareV2Schema,
  coreSourcePreparationResultV2Schema,
  coreSourceFinalizeV2Schema,
  coreSourceFinalizeResultV2Schema,
  coreSourcePlanReadV2Schema,
  type CoreSourcePlanReadV2,
  type CoreSourcePrepareV2,
  type CoreSourcePreparationResultV2,
  type CoreSourceFinalizeV2,
} from "../../domain/trip/tripCoreV2SourceContract";
import { coreHashValue } from "../../domain/trip/tripCoreV2Read";
import type { ImportHash } from "../../domain/trip/flightImportReview";
import {
  validateCoreReadCollection,
  type CoreReadManifest,
  type CoreReadPage,
} from "../../domain/trip/tripCoreV2Read";
import type { CoreSyncTransport } from "../sync/tripCoreV2SyncWorker";
export type CoreSourcePlanReadTransport = {
  sourcePlan(
    context: AccountRequestContext,
    planId: string,
  ): Promise<CoreSourcePlanReadV2 | null>;
};
export type CoreReadTransport = {
  collection(
    ctx: AccountRequestContext,
    ordinaryOrderVersion?: 1,
  ): Promise<{ manifest: CoreReadManifest; pages: CoreReadPage[] }>;
};
const redacted = z.strictObject({
  projection: z.literal("STATUS_ONLY"),
  domainReceiptId: coreUuid,
  receiptSha256: coreHash,
  operationId: coreUuid,
  outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"]),
  targetRevision: z.null(),
});
const full = z.strictObject({
  projection: z.literal("FULL"),
  domainReceiptId: coreUuid,
  receipt: z.unknown(),
});
export type CoreCandidatePublicationTransport = {
  publishSourceCandidates(
    ctx: AccountRequestContext,
    input: CoreCandidatePublicationV2,
  ): Promise<CoreCandidatePublicationResult>;
};
export type CoreSourcePlanTransport = {
  publishUniversalP1?(
    ctx: AccountRequestContext,
    input: import("zod").infer<typeof coreUniversalP1PublishRequestSchema>,
  ): Promise<import("zod").infer<typeof coreUniversalP1PublishResultSchema>>;

  prepareSourcePlan(
    ctx: AccountRequestContext,
    input: CoreSourcePrepareV2,
  ): Promise<CoreSourcePreparationResultV2>;
  finalizeSourceSlot(
    ctx: AccountRequestContext,
    planId: string,
    input: CoreSourceFinalizeV2,
  ): Promise<import("zod").infer<typeof coreSourceFinalizeResultV2Schema>>;
};
// Transport only. Accepted apply, queue ownership and retry stay in existing data layers.
export function createCoreV2Transport(
  getAccountId: () => Promise<string>,
  hash: ImportHash,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
): CoreSyncTransport &
  CoreReadTransport &
  CoreCandidatePublicationTransport &
  CoreSourcePlanTransport &
  CoreSourcePlanReadTransport {
  const api = (ctx: AccountRequestContext, maximum = 1048576) =>
    createAuthenticatedApiClient(
      {
        ...options,
        maxResponseBytes: maximum,
        parseBoundedResponseText: (text) => parseCoreJson(text, maximum),
      },
      tokenProvider,
      ctx,
    );
  const headers = { "X-OTR-Core-Contract-Version": "2" };
  const path = (ctx: AccountRequestContext) =>
    `/v2/trips/${coreUuid.parse(ctx.tripId)}/core`;
  async function validate(
    ctx: AccountRequestContext,
    input: unknown,
    operationId: string,
  ): Promise<CoreReceiptProjection> {
    await assertAccountRequestContext(ctx, getAccountId);
    const opaque = redacted.safeParse(input);
    if (opaque.success) {
      if (opaque.data.operationId !== operationId)
        throw new Error("CORE_RECEIPT_SCOPE_MISMATCH");
      return opaque.data;
    }
    const output = full.parse(input),
      r = await validateCoreReceipt(output.receipt, hash);
    if (
      r.actorAccountId !== ctx.accountId ||
      r.tripId !== ctx.tripId ||
      r.operationId !== operationId
    )
      throw new Error("CORE_RECEIPT_SCOPE_MISMATCH");
    return { projection: "FULL", domainReceiptId: output.domainReceiptId, receipt: r };
  }
  return {
    async publishUniversalP1(ctx, input) {
      await assertAccountRequestContext(ctx, getAccountId);
      const wire = coreUniversalP1PublishRequestSchema.parse(input),
        result = await api(ctx).post(
          path(ctx) + "/universal-p1-candidates",
          wire,
          coreUniversalP1PublishResultSchema,
          headers,
        );
      await assertAccountRequestContext(ctx, getAccountId);
      if (result.proposedPlan.sourceId !== wire.sourceId)
        throw Error("CORE_PUBLICATION_SCOPE_MISMATCH");
      return result;
    },
    async finalizeSourceOperation(ctx, input) {
      await assertAccountRequestContext(ctx, getAccountId);
      const wire = coreSourceFinalizeV2Schema.parse(input),
        result = await api(ctx).post(
          path(ctx) + "/universal-p1-source/finalize",
          wire,
          coreSourceFinalizeResultV2Schema,
          headers,
        );
      await assertAccountRequestContext(ctx, getAccountId);
      if (result.slotId !== wire.slotId)
        throw Error("CORE_SOURCE_FINALIZER_SCOPE_MISMATCH");
      return result;
    },
    async prepareSourcePlan(ctx, input) {
      await assertAccountRequestContext(ctx, getAccountId);
      const proposed = coreSourcePrepareV2Schema.parse(input);
      const result = await api(ctx).post(
        path(ctx) + "/source-plans/prepare",
        proposed,
        coreSourcePreparationResultV2Schema,
        headers,
      );
      await assertAccountRequestContext(ctx, getAccountId);
      if (
        result.plan.accountId !== ctx.accountId ||
        result.plan.tripId !== ctx.tripId ||
        result.plan.planId !== proposed.planId ||
        result.plan.sourceId !== proposed.sourceId ||
        result.plan.sourceRevision !== proposed.sourceRevision ||
        result.plan.mode !== proposed.mode ||
        result.plan.policyVersion !== proposed.policyVersion ||
        [...result.plan.candidateIds].sort().join("|") !==
          [...proposed.candidateIds].sort().join("|")
      )
        throw new Error("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
      for (const command of result.readyCommands) {
        validateCoreCommand(command);
        const slot = proposed.slots.find((s) => s.operationId === command.operationId);
        const saved = result.plan.slots.find(
          (s) => s.operationId === command.operationId,
        );
        if (
          !slot ||
          !saved ||
          command.tripId !== ctx.tripId ||
          command.target.id !== slot.target.id ||
          command.target.kind !== slot.target.kind ||
          command.command !== slot.command ||
          command.admission.sourceIntentId !== slot.slotId ||
          command.admission.mode !== proposed.mode ||
          command.admission.policyVersion !== proposed.policyVersion ||
          saved.slotId !== slot.slotId ||
          saved.candidateId !== slot.candidateId ||
          saved.target.existingId !== slot.target.id ||
          saved.state !== "READY" ||
          saved.intentSha256 !==
            (await coreHashValue("otr-trip-core-intent-v2", command, hash)) ||
          canonicalCoreJson(
            command.payload as import("../../domain/trip/tripCoreV2Json").Json,
          ) !== canonicalCoreJson(slot.payload) ||
          (slot.baseVector !== null &&
            canonicalCoreJson(command.baseVector) !== canonicalCoreJson(slot.baseVector))
        )
          throw new Error("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
      }
      if (
        new Set(result.readyCommands.map((c) => c.operationId)).size !==
          result.readyCommands.length ||
        result.reviewSlots.some(
          (s) => !proposed.slots.some((p) => p.slotId === s.slotId),
        ) ||
        result.plan.slots.some(
          (s) =>
            !proposed.slots.some(
              (p) =>
                p.slotId === s.slotId &&
                p.candidateId === s.candidateId &&
                p.operationId === s.operationId,
            ),
        )
      )
        throw new Error("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
      await assertAccountRequestContext(ctx, getAccountId);
      return result;
    },
    async sourcePlan(ctx, planId) {
      await assertAccountRequestContext(ctx, getAccountId);
      coreUuid.parse(planId);
      try {
        const value = await api(ctx).get(
          path(ctx) + "/source-plans/" + planId,
          coreSourcePlanReadV2Schema,
          headers,
        );
        await assertAccountRequestContext(ctx, getAccountId);
        if (
          value.plan.accountId !== ctx.accountId ||
          value.plan.tripId !== ctx.tripId ||
          value.plan.planId !== planId
        )
          throw Error("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
        return value;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) return null;
        throw error;
      }
    },
    async finalizeSourceSlot(ctx, planId, input) {
      await assertAccountRequestContext(ctx, getAccountId);
      const result = await api(ctx).post(
        path(ctx) + "/source-plans/" + coreUuid.parse(planId) + "/finalize",
        coreSourceFinalizeV2Schema.parse(input),
        coreSourceFinalizeResultV2Schema,
        headers,
      );
      await assertAccountRequestContext(ctx, getAccountId);
      if (result.slotId !== input.slotId)
        throw new Error("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
      return result;
    },
    async collection(ctx, ordinaryOrderVersion) {
      await assertAccountRequestContext(ctx, getAccountId);
      const bundle = await api(ctx, 65 * 1048576).get(
        path(ctx) + "/collection",
        z.strictObject({
          manifest: z.unknown(),
          pages: z.array(z.unknown()).min(1).max(100),
        }),
        ordinaryOrderVersion === 1
          ? { ...headers, "X-OTR-Ordinary-Order-Version": "1" }
          : headers,
      );
      const validated = await validateCoreReadCollection(
        bundle.manifest,
        bundle.pages,
        ctx.accountId,
        ctx.tripId,
        hash,
      );
      await assertAccountRequestContext(ctx, getAccountId);
      if (ordinaryOrderVersion === 1 && validated.manifest.ordinaryOrderVersion !== 1)
        throw new Error("CORE_READ_VERSION_MISMATCH");
      return { manifest: validated.manifest, pages: bundle.pages as CoreReadPage[] };
    },
    async publishSourceCandidates(ctx, input) {
      await assertAccountRequestContext(ctx, getAccountId);
      const publication = coreCandidatePublicationV2Schema.parse(input);
      if (
        publication.candidates.some(
          (c) =>
            c.accountId !== ctx.accountId ||
            c.tripId !== ctx.tripId ||
            c.sourceId !== publication.sourceId ||
            c.sourceRevision !== publication.sourceRevision ||
            c.runId !== publication.runId,
        )
      )
        throw new Error("CORE_PUBLICATION_SCOPE_MISMATCH");
      if (new TextEncoder().encode(canonicalCoreJson(publication)).length > 32768)
        throw new Error("CORE_REQUEST_LIMIT");
      const result = await api(ctx).post(
        path(ctx) + "/source-candidates/publish",
        publication,
        coreCandidatePublicationResultSchema,
        headers,
      );
      await assertAccountRequestContext(ctx, getAccountId);
      if (
        result.accountId !== ctx.accountId ||
        result.tripId !== ctx.tripId ||
        result.publicationId !== publication.publicationId ||
        result.sourceId !== publication.sourceId ||
        result.sourceRevision !== publication.sourceRevision ||
        result.runId !== publication.runId ||
        result.inputCatalogSha256 !== publication.inputCatalogSha256 ||
        result.requestSha256 !==
          (await candidatePublicationRequestHash(publication, hash)) ||
        result.candidates
          .map((c) => c.candidateId)
          .sort()
          .join("\0") !==
          publication.candidates
            .map((c) => c.candidateId)
            .sort()
            .join("\0")
      )
        throw new Error("CORE_PUBLICATION_SCOPE_MISMATCH");
      await assertAccountRequestContext(ctx, getAccountId);
      return result;
    },
    async capabilities(ctx, operationId) {
      await assertAccountRequestContext(ctx, getAccountId);
      if (operationId !== undefined) coreUuid.parse(operationId);
      const result = await api(ctx).get(
        path(ctx) +
          "/capabilities" +
          (operationId === undefined ? "" : "?operationId=" + operationId),
        coreCapabilitiesSchema,
        { ...headers, "X-OTR-Core-Authored-Flight": "1" },
      );
      await assertAccountRequestContext(ctx, getAccountId);
      return result;
    },
    async receipt(ctx, operationId) {
      await assertAccountRequestContext(ctx, getAccountId);
      coreUuid.parse(operationId);
      try {
        return await validate(
          ctx,
          await api(ctx).get(
            path(ctx) + "/operations/" + operationId,
            z.unknown(),
            headers,
          ),
          operationId,
        );
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) return null;
        throw error;
      }
    },
    async submit(ctx, input: CoreCommand) {
      await assertAccountRequestContext(ctx, getAccountId);
      const command = validateCoreCommand(input);
      if (command.tripId !== ctx.tripId) throw new Error("CORE_SCOPE_MISMATCH");
      return validate(
        ctx,
        await api(ctx).post(path(ctx) + "/commands", command, z.unknown(), headers),
        command.operationId,
      );
    },
  };
}
