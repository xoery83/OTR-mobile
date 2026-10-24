import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createUniversalOriginalSourceTransport } from "./universalOriginalSourceTransport";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
vi.mock("expo/fetch", () => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock("../auth/sessionAccessToken", () => ({
  sessionAccessToken: vi.fn<typeof fetch>(),
}));
async function setup(fetcher: typeof fetch) {
  const accountId = randomUUID(),
    getAccount = async () => accountId,
    context = await captureAccountRequestContext(randomUUID(), getAccount);
  const t = createUniversalOriginalSourceTransport(getAccount, {
    baseUrl: "https://api.example",
    fetchImplementation: fetcher,
    tokenProvider: async () => ({ token: "synthetic", userId: accountId }),
  });
  return { t, context };
}
it("sends exactly one normal-auth scoped request and preserves a null result as not found", async () => {
  const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response("null", { headers: { "Content-Type": "application/json" } }),
    ),
    { t, context } = await setup(fetcher);
  expect(await t.lookup(context, { operation_id: "fixed" })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(
    `https://api.example/v2/trips/${context.tripId}/universal-source-originals/result`,
  );
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
    Authorization: "Bearer synthetic",
  });
});
it("does not automatically redispatch a rejected or ambiguous write", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response("", { status: 401 })),
    { t, context } = await setup(fetcher);
  await expect(t.acquire(context, {})).rejects.toThrow("SOURCE_AUTH_REQUIRED");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("withholds a response after Account generation changes", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => {
      advanceAccountGeneration();
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    }),
    { t, context } = await setup(fetcher);
  await expect(t.lookup(context, {})).rejects.toThrow();
});

afterEach(() => vi.unstubAllEnvs());
it("rejects Source result before network when the explicit QA read allocation is invalid", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_QA_READ_BUDGET", "invalid");
  const fetcher = vi.fn<typeof fetch>();
  const { t, context } = await setup(fetcher);
  await expect(t.lookup(context, {})).rejects.toThrow("QA_READ_BUDGET_CLOSED");
  expect(fetcher).not.toHaveBeenCalled();
});
