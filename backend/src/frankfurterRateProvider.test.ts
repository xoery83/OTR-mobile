import { describe, expect, it, vi } from "vitest";

import { createFrankfurterRateProvider } from "./frankfurterRateProvider";
import { historicalRatePolicyVersion } from "./rateQuoteProvider";

const request = {
  economicDate: "2026-07-15",
  quoteCurrency: "EUR",
  settlementCurrency: "NZD",
  policyVersion: historicalRatePolicyVersion as typeof historicalRatePolicyVersion,
} as const;
const body =
  '{"date":"2026-07-15","base":"EUR","quote":"NZD","rate":1.980800000000000001}';

describe("Frankfurter ECB adapter", () => {
  it("requests the pinned source and preserves the raw decimal token", async () => {
    const fetch = vi.fn(async (_url: URL | RequestInfo) => new Response(body));
    const result = await createFrankfurterRateProvider(fetch).fetch(request);
    expect(result.decimalRate).toBe("1.980800000000000001");
    expect(result.referenceDate).toBe("2026-07-15");
    expect(fetch.mock.calls[0][0].toString()).toContain(
      "/v2/providers/ecb/rate/EUR/NZD?date=2026-07-15",
    );
  });

  it("classifies unsupported, timeout, rate limit and temporary errors", async () => {
    const fetch = vi.fn(async () => new Response(body));
    await expect(
      createFrankfurterRateProvider(fetch).fetch({ ...request, quoteCurrency: "AED" }),
    ).rejects.toMatchObject({ category: "UNSUPPORTED" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      createFrankfurterRateProvider(async () => {
        throw new Error("timeout");
      }).fetch(request),
    ).rejects.toMatchObject({ category: "TEMPORARY_FAILURE" });
    await expect(
      createFrankfurterRateProvider(async () => new Response("", { status: 429 })).fetch(
        request,
      ),
    ).rejects.toMatchObject({ category: "RATE_LIMITED" });
    await expect(
      createFrankfurterRateProvider(async () => new Response("", { status: 503 })).fetch(
        request,
      ),
    ).rejects.toMatchObject({ category: "TEMPORARY_FAILURE" });
  });

  it("rejects malformed, duplicate, reversed and exponent responses", async () => {
    for (const content of [
      "not JSON",
      "[]",
      body.replace('"base":"EUR"', '"base":"NZD"'),
      body.replace('"rate":1.980800000000000001', '"rate":1e-6'),
      body.replace('"rate":1.980800000000000001', '"rate":1,"rate":2'),
    ])
      await expect(
        createFrankfurterRateProvider(async () => new Response(content)).fetch(request),
      ).rejects.toThrow();
  });

  it("returns a newest-first exact-decimal ECB snapshot bundle and caches it", async () => {
    const requestedUrls: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(input.toString());
      return new Response(
        `[{"date":"2026-09-23","base":"EUR","quote":"EUR","rate":1.0},` +
          `{"date":"2026-09-23","base":"EUR","quote":"ISK","rate":143.500000000000001},` +
          `{"date":"2026-09-24","base":"EUR","quote":"EUR","rate":1.0},` +
          `{"date":"2026-09-24","base":"EUR","quote":"ISK","rate":143.6}]`,
      );
    });
    const provider = createFrankfurterRateProvider(
      fetch,
      () => new Date("2026-09-24T05:00:00.000Z"),
    );
    const result = await provider.fetchReferenceSnapshots();
    expect(result.snapshots.map((snapshot) => snapshot.referenceDate)).toEqual([
      "2026-09-24",
      "2026-09-23",
    ]);
    expect(result.snapshots[1].rates.ISK).toBe("143.500000000000001");
    expect(requestedUrls[0]).toContain(
      "/v2/providers/ecb/rates?from=2026-07-26&to=2026-09-24",
    );
    await provider.fetchReferenceSnapshots();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed snapshot rows and duplicate currency dates", async () => {
    const now = () => new Date("2026-09-24T05:00:00.000Z");
    for (const content of [
      `[{"date":"2026-09-24","base":"USD","quote":"EUR","rate":1.0}]`,
      `[{"date":"2026-09-24","base":"EUR","quote":"EUR","rate":1.0},` +
        `{"date":"2026-09-24","base":"EUR","quote":"EUR","rate":1.0}]`,
      `[{"date":"2026-09-24","base":"EUR","quote":"EUR","rate":1e0}]`,
    ])
      await expect(
        createFrankfurterRateProvider(
          async () => new Response(content),
          now,
        ).fetchReferenceSnapshots(),
      ).rejects.toThrow();
  });
});
