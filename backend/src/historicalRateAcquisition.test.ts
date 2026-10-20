import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  acquirePendingRateQuotes,
  applyPendingReferenceValuations,
} from "./supabaseGateway";
import { RateProviderError } from "./rateQuoteProvider";

const demand = {
  journey_id: "10000000-0000-4000-8000-000000000001",
  economic_date: "2026-07-12",
  quote_currency: "EUR",
  base_currency: "NZD",
  policy_version: "ECB_DAILY_V1",
};
const candidate = {
  decimalRate: "1.9808",
  referenceDate: "2026-07-10",
  provider: "ECB",
  providerReference:
    "https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12",
  sourceReference: "https://www.ecb.europa.eu/",
};

function fakeService(demands = [demand]) {
  const upsert = vi.fn(async () => ({ error: null }));
  const match = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ match }));
  const from = vi.fn((table: string) => {
    if (table === "ledger_rate_quotes") return { upsert };
    if (table === "ledger_rate_quote_attempts") return { update };
    throw new Error(`Unexpected table ${table}`);
  });
  const rpc = vi.fn(async (name: string) => ({
    data: name === "ledger_resolve_personal_payment_fx_projections_1c" ? 0 : demands,
    error: null,
  }));
  return { client: { from, rpc } as unknown as SupabaseClient, upsert, update, rpc };
}

describe("historical rate acquisition", () => {
  it("persists a candidate with both dates without touching Expense or accepted snapshots", async () => {
    const service = fakeService();
    const fetch = vi.fn(async () => candidate);
    expect(await acquirePendingRateQuotes(service.client, { fetch })).toBe(1);
    expect(fetch).toHaveBeenCalledOnce();
    expect(service.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        economic_date: "2026-07-12",
        reference_date: "2026-07-10",
        decimal_rate: "1.9808",
        provider: "ECB",
      }),
      expect.any(Object),
    );
    expect(service.client.from).toHaveBeenCalledWith("ledger_rate_quotes");
    expect(service.client.from).not.toHaveBeenCalledWith("expenses");
    expect(service.client.from).not.toHaveBeenCalledWith("exchange_rate_snapshots");
  });

  it("records a bounded retry and does not persist an invalid candidate", async () => {
    const service = fakeService();
    const fetch = vi.fn(async () => ({ ...candidate, referenceDate: "2026-07-03" }));
    expect(await acquirePendingRateQuotes(service.client, { fetch })).toBe(1);
    expect(service.upsert).not.toHaveBeenCalled();
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "NO_REFERENCE_WITHIN_POLICY" }),
    );
    expect(service.rpc).toHaveBeenCalledWith(
      "ledger_mark_personal_payment_fx_demand_1c",
      expect.objectContaining({ failure_category_value: "NO_REFERENCE_WITHIN_POLICY" }),
    );
  });

  it("keeps a temporary provider failure retryable without editing the payment", async () => {
    const service = fakeService();
    const fetch = vi.fn(async () => {
      throw new RateProviderError("TEMPORARY_FAILURE", "offline");
    });
    expect(await acquirePendingRateQuotes(service.client, { fetch })).toBe(1);
    expect(service.upsert).not.toHaveBeenCalled();
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "TEMPORARY_FAILURE" }),
    );
    expect(service.rpc).toHaveBeenCalledWith(
      "ledger_mark_personal_payment_fx_demand_1c",
      expect.objectContaining({ failure_category_value: "TEMPORARY_FAILURE" }),
    );
  });

  it("does nothing when all demands are already cached or leased", async () => {
    const service = fakeService([]);
    const fetch = vi.fn(async () => candidate);
    expect(await acquirePendingRateQuotes(service.client, { fetch })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("counts Personal Payment FX and automatic reference work without changing the scan calls", async () => {
    const service = fakeService([]);
    service.rpc.mockImplementation(async (name: string) => ({
      data: name === "ledger_resolve_personal_payment_fx_projections_1c" ? 2 : [],
      error: null,
    }));
    const paymentCount = vi.fn();
    const autoDemandCount = vi.fn();
    expect(
      await acquirePendingRateQuotes(
        service.client,
        { fetch: vi.fn() },
        undefined,
        true,
        paymentCount,
      ),
    ).toBe(0);
    expect(
      await applyPendingReferenceValuations(service.client, undefined, autoDemandCount),
    ).toBe(0);
    expect(paymentCount).toHaveBeenCalledWith(2);
    expect(autoDemandCount).toHaveBeenCalledWith(0);
    expect(service.rpc.mock.calls.map(([name]) => name)).toEqual([
      "ledger_claim_rate_demands",
      "ledger_resolve_personal_payment_fx_projections_1c",
      "ledger_list_auto_reference_demands",
    ]);
  });

  it("can fill the shared quote cache without changing Personal Payment state", async () => {
    const service = fakeService();
    const fetch = vi.fn(async () => candidate);
    expect(
      await acquirePendingRateQuotes(service.client, { fetch }, [demand], false),
    ).toBe(1);
    expect(service.upsert).toHaveBeenCalledOnce();
    expect(service.rpc).not.toHaveBeenCalled();
  });
});
