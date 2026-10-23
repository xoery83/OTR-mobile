import { fetch as expoFetch } from "expo/fetch";
import { createApiClient } from "./client";
import { sessionAccessToken } from "../auth/sessionAccessToken";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
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
    async context(context: AccountRequestContext, batchId: string) {
      // UUID validation before constructing a route; Native never authors a Task ID.
      const id = universalContextSchema.shape.batchId.parse(batchId);
      return scoped(context, async (api) => {
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
    async result(context: AccountRequestContext, raw: UniversalExecutionContext) {
      const b = pin(context, raw);
      return scoped(context, async (api) => {
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
