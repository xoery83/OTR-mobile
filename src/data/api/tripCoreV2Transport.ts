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
import type { ImportHash } from "../../domain/trip/flightImportReview";
import {
  validateCoreReadCollection,
  type CoreReadManifest,
  type CoreReadPage,
} from "../../domain/trip/tripCoreV2Read";
import type { CoreSyncTransport } from "../sync/tripCoreV2SyncWorker";
export type CoreReadTransport = {
  collection(
    ctx: AccountRequestContext,
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
// Transport only. Accepted apply, queue ownership and retry stay in existing data layers.
export function createCoreV2Transport(
  getAccountId: () => Promise<string>,
  hash: ImportHash,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
): CoreSyncTransport & CoreReadTransport & CoreCandidatePublicationTransport {
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
    async collection(ctx) {
      await assertAccountRequestContext(ctx, getAccountId);
      const bundle = await api(ctx, 65 * 1048576).get(
        path(ctx) + "/collection",
        z.strictObject({
          manifest: z.unknown(),
          pages: z.array(z.unknown()).min(1).max(100),
        }),
        headers,
      );
      const validated = await validateCoreReadCollection(
        bundle.manifest,
        bundle.pages,
        ctx.accountId,
        ctx.tripId,
        hash,
      );
      await assertAccountRequestContext(ctx, getAccountId);
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
    async capabilities(ctx) {
      await assertAccountRequestContext(ctx, getAccountId);
      const result = await api(ctx).get(
        path(ctx) + "/capabilities",
        coreCapabilitiesSchema,
        headers,
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
