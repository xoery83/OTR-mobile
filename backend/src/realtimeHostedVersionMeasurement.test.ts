import { expect, it, vi } from "vitest";
import { createCoreV2Transport } from "../../src/data/api/tripCoreV2Transport";
import { measureHostedVersion } from "../../scripts/trip/realtime-hosted-version.mjs";

const context = {
  accountId: "11111111-1111-4111-8111-111111111111",
  tripId: "22222222-2222-4222-8222-222222222222",
  generation: 0,
};
it("measures at most three normal reads without exposing identity or opaque token", async () => {
  const read = vi.fn(async () => ({
    actorAccountId: context.accountId,
    tripId: context.tripId,
    token: "a".repeat(64),
  }));
  const result = await measureHostedVersion(context, read);
  expect(read).toHaveBeenCalledTimes(3);
  expect(result.samples.map((x) => x.unchangedFromPrevious)).toEqual([null, true, true]);
  expect(JSON.stringify(result)).not.toContain(context.accountId);
  expect(JSON.stringify(result)).not.toContain("a".repeat(64));
});
it("stops on the first failed or mismatched read rather than counting a PASS", async () => {
  const read = vi.fn(async () => {
    throw Error("DENIED");
  });
  await expect(measureHostedVersion(context, read)).rejects.toThrow("DENIED");
  expect(read).toHaveBeenCalledOnce();
  await expect(
    measureHostedVersion(context, async () => ({
      actorAccountId: context.tripId,
      tripId: context.tripId,
      token: "b".repeat(64),
    })),
  ).rejects.toThrow("SCOPE_MISMATCH");
});

it("uses the real normal transport for exactly three read-only version fetches", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      version: "otr.core.authorized-trip-version/1",
      actorAccountId: context.accountId,
      tripId: context.tripId,
      token: "a".repeat(64),
    }),
  );
  const transport = createCoreV2Transport(
    async () => context.accountId,
    async () => "b".repeat(64),
    { baseUrl: "https://api-dev.xoery.art", fetchImplementation: fetch },
    async (request) => {
      if (request?.forceRefresh) throw Error("FRESH_NORMAL_LOGIN_REQUIRED");
      return { userId: context.accountId, token: "synthetic-normal" };
    },
  );
  const result = await measureHostedVersion(context, (ctx) =>
    transport.authorizedVersion(ctx),
  );
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.every((call) => call.length === 2)).toBe(true);
  expect(result.samples).toHaveLength(3);
});
it("a real HTTP401 and refused refresh stop measurement after one fetch", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 }),
  );
  const transport = createCoreV2Transport(
    async () => context.accountId,
    async () => "b".repeat(64),
    { baseUrl: "https://api-dev.xoery.art", fetchImplementation: fetch },
    async (request) => {
      if (request?.forceRefresh) throw Error("FRESH_NORMAL_LOGIN_REQUIRED");
      return { userId: context.accountId, token: "synthetic-normal" };
    },
  );
  await expect(
    measureHostedVersion(context, (ctx) => transport.authorizedVersion(ctx)),
  ).rejects.toMatchObject({ kind: "http", status: 401 });
  expect(fetch).toHaveBeenCalledOnce();
});
