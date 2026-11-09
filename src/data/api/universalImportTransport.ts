import { fetch as expoFetch } from "expo/fetch";
import { sha256 } from "@noble/hashes/sha256";
import { ApiClientError, createApiClient } from "./client";
import { sessionAccessToken } from "../auth/sessionAccessToken";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  universalMaterialReadySchema,
  universalBatchPrepareSchema,
  universalRetainedOriginalPrepareSchema,
  universalTaskResumeSchema,
  universalBatchPreparedSchema,
  type UniversalBatchPrepare,
  universalContextSchema,
  universalResultSchema,
  type UniversalExecutionContext,
} from "./universalImportContracts";

export function createUniversalImportTransport(
  getAccountId: () => Promise<string>,
  options: {
    baseUrl: string;
    fetchImplementation?: typeof fetch;
    tokenProvider?: typeof sessionAccessToken;
    assertCurrent?: () => void;
    signal?: AbortSignal;
  },
) {
  const origin = new URL(options.baseUrl);
  if (
    origin.origin !== options.baseUrl ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password
  )
    throw Error("UNIVERSAL_ORIGIN_INVALID");
  async function scoped<T>(
    context: AccountRequestContext,
    work: (api: ReturnType<typeof createApiClient>) => Promise<T>,
  ) {
    const check = () => {
      options.assertCurrent?.();
      assertAccountRequestGeneration(context);
    };
    const current = async () => {
      check();
      await assertAccountRequestContext(context, getAccountId);
      check();
    };
    await current();
    const api = createApiClient({
      baseUrl: origin.origin,
      fetchImplementation: options.fetchImplementation ?? expoFetch,
      signal: options.signal,
      timeoutMs: 90000,
      maxResponseBytes: 2097152,
      assertRequestCurrent: check,
      accessTokenProvider: async (forceRefresh, rejectedToken) => {
        await current();
        const session = await (options.tokenProvider ?? sessionAccessToken)({
          expectedUserId: context.accountId,
          forceRefresh,
          rejectedToken,
        });
        if (session.userId !== context.accountId)
          throw Error("UNIVERSAL_ACCOUNT_CHANGED");
        await current();
        return session.token;
      },
    });
    const result = await work(api);
    await current();
    return result;
  }
  async function read<T>(
    context: AccountRequestContext,
    batchId: string,
    phase: "CONTEXT" | "RESULTS",
    work: (api: ReturnType<typeof createApiClient>) => Promise<T>,
  ) {
    try {
      return await scoped(context, work);
    } catch (error) {
      try {
        const failure = error instanceof ApiClientError ? error : undefined;
        const requestId = universalContextSchema.shape.batchId.safeParse(
          failure?.requestId,
        );
        const category =
          failure?.kind === "http"
            ? failure.status === 503
              ? "HTTP_UNAVAILABLE"
              : "HTTP_FAILURE"
            : failure?.kind === "network"
              ? "NETWORK"
              : failure?.kind === "timeout"
                ? "TIMEOUT"
                : failure?.kind === "validation"
                  ? "VALIDATION"
                  : "UNKNOWN";
        const status = failure?.status;
        console.info(
          JSON.stringify({
            event: "universal_import_read_failed",
            method: "GET",
            phase,
            category,
            ...(typeof status === "number" &&
            Number.isInteger(status) &&
            status >= 100 &&
            status <= 599
              ? { status }
              : {}),
            ...(requestId.success ? { requestId: requestId.data } : {}),
            batchCorrelation: Array.from(
              sha256(
                new TextEncoder().encode(
                  `otr.import.batch-diagnostic/1\0${batchId.toLowerCase()}`,
                ),
              ),
              (byte) => byte.toString(16).padStart(2, "0"),
            ).join(""),
          }),
        );
      } catch {
        // Hashing/logging must not change the owning error or recovery decision.
      }
      throw error;
    }
  }
  function pin(context: AccountRequestContext, raw: UniversalExecutionContext) {
    const binding = universalContextSchema.parse(raw);
    if (
      binding.accountId !== context.accountId ||
      binding.actorId !== context.accountId ||
      binding.tripId !== context.tripId
    )
      throw Error("UNIVERSAL_CONTEXT_MISMATCH");
    return binding;
  }
  const path = (batchId: string) => `/v2/import-batches/${batchId}/interpretations`;
  return {
    async prepare(
      context: AccountRequestContext,
      raw: UniversalBatchPrepare | import("./universalImportContracts").UniversalRetainedOriginalPrepare,
    ) {
      const input = "retainedOriginals" in raw
        ? universalRetainedOriginalPrepareSchema.parse(raw)
        : universalBatchPrepareSchema.parse(raw);
      if (input.tripId !== context.tripId) throw Error("UNIVERSAL_CONTEXT_MISMATCH");
      return scoped(context, async (api) => {
        const result = await api.post(
          `${path(input.batchId)}/prepare`,
          input,
          universalBatchPreparedSchema,
          { "Idempotency-Key": input.batchId },
        );
        const b = pin(context, result.context);
        if (b.batchId !== input.batchId) throw Error("UNIVERSAL_CONTEXT_MISMATCH");
        return result;
      });
    },
    async resume(context: AccountRequestContext, raw: UniversalExecutionContext) {
      const b = pin(context, raw);
      return scoped(context, async (api) => {
        const result = await api.post(
          `${path(b.batchId)}/prepare`,
          universalTaskResumeSchema.parse({
            version: "otr.backend.universal-resume/1",
            tripId: b.tripId,
            batchId: b.batchId,
            taskId: b.taskId,
          }),
          universalBatchPreparedSchema,
          { "Idempotency-Key": b.taskId },
        );
        const accepted = pin(context, result.context);
        if (
          result.status !== "EXISTING" ||
          accepted.batchId !== b.batchId ||
          accepted.taskId !== b.taskId
        )
          throw Error("UNIVERSAL_CONTEXT_MISMATCH");
        return result;
      });
    },
    async context(context: AccountRequestContext, batchId: string) {
      // UUID validation before constructing a route; Native never authors a Task ID.
      const id = universalContextSchema.shape.batchId.parse(batchId);
      return read(context, id, "CONTEXT", async (api) => {
        const binding = pin(
          context,
          await api.get(
            `${path(id)}?tripId=${encodeURIComponent(context.tripId)}`,
            universalContextSchema,
          ),
        );
        if (binding.batchId !== id) throw Error("UNIVERSAL_CONTEXT_MISMATCH");
        return binding;
      });
    },
    async materialReady(context: AccountRequestContext, batchId: string) {
      const id = universalContextSchema.shape.batchId.parse(batchId);
      return read(context, id, "CONTEXT", async (api) => {
        const response = await api.get(
          `${path(id)}?tripId=${encodeURIComponent(context.tripId)}&materialReady=1`,
          universalMaterialReadySchema,
        );
        if (
          response.accountId !== context.accountId ||
          response.actorId !== context.accountId ||
          response.prepare.tripId !== context.tripId ||
          response.prepare.batchId !== id
        )
          throw Error("UNIVERSAL_CONTEXT_MISMATCH");
        return response;
      });
    },
    async result(context: AccountRequestContext, raw: UniversalExecutionContext) {
      const b = pin(context, raw);
      return read(context, b.batchId, "RESULTS", async (api) => {
        const r = await api.get(
          `${path(b.batchId)}/${b.taskId}?tripId=${b.tripId}`,
          universalResultSchema,
        );
        if (
          r.actorId !== b.actorId ||
          r.accountId !== b.accountId ||
          r.tripId !== b.tripId ||
          r.batchId !== b.batchId ||
          r.taskId !== b.taskId
        )
          throw Error("UNIVERSAL_RESULT_MISMATCH");
        return r;
      });
    },
    async execute(context: AccountRequestContext, raw: UniversalExecutionContext) {
      const b = pin(context, raw);
      return scoped(context, async (api) => {
        const r = await api.post(
          path(b.batchId),
          {
            version: "otr.backend.universal-interpretation/1",
            tripId: b.tripId,
            taskId: b.taskId,
          },
          universalResultSchema,
          { "Idempotency-Key": b.taskId },
        );
        if (
          r.actorId !== b.actorId ||
          r.accountId !== b.accountId ||
          r.tripId !== b.tripId ||
          r.batchId !== b.batchId ||
          r.taskId !== b.taskId
        )
          throw Error("UNIVERSAL_RESULT_MISMATCH");
        return r;
      });
    },
  };
}
