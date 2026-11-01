import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createCoreV2Transport } from "./tripCoreV2Transport";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));

it("reads the formal opaque authorized-version through normal scoped Auth", async () => {
  const account = randomUUID(),
    trip = randomUUID();
  const fetch = vi.fn(async () =>
    Response.json({
      version: "otr.core.authorized-trip-version/1",
      actorAccountId: account,
      tripId: trip,
      token: "a".repeat(64),
    }),
  );
  const transport = createCoreV2Transport(
    async () => account,
    async () => "b".repeat(64),
    {
      baseUrl: "https://local.invalid",
      fetchImplementation: fetch,
    },
    async () => ({ userId: account, token: "synthetic-normal" }),
  );
  const context = await captureAccountRequestContext(trip, async () => account);
  expect(typeof transport.authorizedVersion).toBe("function");
  const version = await transport.authorizedVersion(context, 1);
  expect(version.token).toBe("a".repeat(64));
  expect(fetch).toHaveBeenCalledOnce();
});
it("uses the exact route, contract and ordinary-order headers with a bounded normal bearer request", async () => {
  const account = randomUUID(),
    trip = randomUUID();
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      version: "otr.core.authorized-trip-version/1",
      actorAccountId: account,
      tripId: trip,
      token: "a".repeat(64),
    }),
  );
  const transport = createCoreV2Transport(
    async () => account,
    async () => "b".repeat(64),
    {
      baseUrl: "https://local.invalid",
      fetchImplementation: fetch,
    },
    async () => ({ userId: account, token: "synthetic-normal" }),
  );
  const context = await captureAccountRequestContext(trip, async () => account);
  await transport.authorizedVersion(context, 1);
  expect(fetch.mock.calls[0][0]).toBe(
    `https://local.invalid/v2/trips/${trip}/core/authorized-version`,
  );
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: "GET",
    headers: {
      Authorization: "Bearer synthetic-normal",
      "X-OTR-Core-Contract-Version": "2",
      "X-OTR-Ordinary-Order-Version": "1",
    },
  });
  await transport.authorizedVersion(context);
  expect(
    (fetch.mock.calls[1][1]?.headers as Record<string, string>)[
      "X-OTR-Ordinary-Order-Version"
    ],
  ).toBeUndefined();
});
it.each(["actorAccountId", "tripId"] as const)(
  "rejects a foreign %s even when its token is well formed",
  async (key) => {
    const account = randomUUID(),
      trip = randomUUID();
    const transport = createCoreV2Transport(
      async () => account,
      async () => "b".repeat(64),
      {
        baseUrl: "https://local.invalid",
        fetchImplementation: async () =>
          Response.json({
            version: "otr.core.authorized-trip-version/1",
            actorAccountId: account,
            tripId: trip,
            token: "a".repeat(64),
            [key]: randomUUID(),
          }),
      },
      async () => ({ userId: account, token: "synthetic-normal" }),
    );
    const context = await captureAccountRequestContext(trip, async () => account);
    await expect(transport.authorizedVersion(context)).rejects.toThrow(
      "CORE_AUTHORIZED_VERSION_SCOPE_MISMATCH",
    );
  },
);
it.each(["bad-token", "unknown-field"])(
  "rejects malformed %s wire data instead of caching it",
  async (malformed) => {
    const account = randomUUID(),
      trip = randomUUID();
    const transport = createCoreV2Transport(
      async () => account,
      async () => "b".repeat(64),
      {
        baseUrl: "https://local.invalid",
        fetchImplementation: async () =>
          Response.json({
            version: "otr.core.authorized-trip-version/1",
            actorAccountId: account,
            tripId: trip,
            token: malformed === "bad-token" ? "a" : "a".repeat(64),
            ...(malformed === "unknown-field" ? { globalRevision: 123 } : {}),
          }),
      },
      async () => ({ userId: account, token: "synthetic-normal" }),
    );
    const context = await captureAccountRequestContext(trip, async () => account);
    await expect(transport.authorizedVersion(context)).rejects.toMatchObject({
      kind: "validation",
    });
  },
);
it("fences a late real authenticated response across Account A→B→A", async () => {
  const { advanceAccountGeneration } = await import("../auth/accountGeneration");
  const account = randomUUID(),
    trip = randomUUID();
  const transport = createCoreV2Transport(
    async () => account,
    async () => "b".repeat(64),
    {
      baseUrl: "https://local.invalid",
      fetchImplementation: async () => {
        advanceAccountGeneration();
        advanceAccountGeneration();
        return Response.json({
          version: "otr.core.authorized-trip-version/1",
          actorAccountId: account,
          tripId: trip,
          token: "a".repeat(64),
        });
      },
    },
    async () => ({ userId: account, token: "synthetic-normal" }),
  );
  const context = await captureAccountRequestContext(trip, async () => account);
  await expect(transport.authorizedVersion(context)).rejects.toThrow();
});
it("retains HTTP401 when normal token refresh fails instead of labeling it a network fallback", async () => {
  const account = randomUUID(),
    trip = randomUUID();
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ error: { code: "INVALID_SESSION" } }, { status: 401 }),
  );
  const transport = createCoreV2Transport(
    async () => account,
    async () => "b".repeat(64),
    {
      baseUrl: "https://local.invalid",
      fetchImplementation: fetch,
    },
    async (input) => {
      if (input?.forceRefresh) throw Error("REFRESH_UNAVAILABLE");
      return { userId: account, token: "synthetic-normal" };
    },
  );
  const context = await captureAccountRequestContext(trip, async () => account);
  await expect(transport.authorizedVersion(context)).rejects.toMatchObject({
    kind: "http",
    status: 401,
    code: "CORE_AUTH_REFRESH_UNAVAILABLE",
  });
  expect(fetch).toHaveBeenCalledOnce();
});
it("retains the first HTTP401 when pending forceRefresh exceeds the existing 300ms request boundary", async () => {
  const account = randomUUID(),
    trip = randomUUID();
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ error: { code: "INVALID_SESSION" } }, { status: 401 }),
  );
  const provider = vi.fn(async (input?: { forceRefresh?: boolean }) => {
    if (input?.forceRefresh)
      return new Promise<{ userId: string; token: string }>(() => {});
    return { userId: account, token: "synthetic-normal" };
  });
  const transport = createCoreV2Transport(
    async () => account,
    async () => "b".repeat(64),
    {
      baseUrl: "https://local.invalid",
      fetchImplementation: fetch,
      timeoutMs: 300,
    },
    provider,
  );
  const context = await captureAccountRequestContext(trip, async () => account);
  await expect(transport.authorizedVersion(context)).rejects.toMatchObject({
    kind: "http",
    status: 401,
    code: "CORE_AUTH_REFRESH_UNAVAILABLE",
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(provider.mock.calls.map(([input]) => !!input?.forceRefresh)).toEqual([
    false,
    true,
  ]);
});
it("keeps a later fetch timeout as timeout after successful normal refresh", async () => {
  const account = randomUUID(),
    trip = randomUUID();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementationOnce(async () =>
      Response.json({ error: { code: "INVALID_SESSION" } }, { status: 401 }),
    )
    .mockImplementationOnce(async () => new Promise<Response>(() => {}));
  const provider = vi.fn(async (input?: { forceRefresh?: boolean }) => ({
    userId: account,
    token: input?.forceRefresh ? "synthetic-refreshed" : "synthetic-normal",
  }));
  const transport = createCoreV2Transport(
    async () => account,
    async () => "b".repeat(64),
    {
      baseUrl: "https://local.invalid",
      fetchImplementation: fetch,
      timeoutMs: 300,
    },
    provider,
  );
  const context = await captureAccountRequestContext(trip, async () => account);
  await expect(transport.authorizedVersion(context)).rejects.toMatchObject({
    kind: "timeout",
    status: undefined,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(provider.mock.calls.map(([input]) => !!input?.forceRefresh)).toEqual([
    false,
    true,
  ]);
});
