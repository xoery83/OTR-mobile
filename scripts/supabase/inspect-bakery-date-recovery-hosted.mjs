import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const url = process.env.OTR_DEV_SUPABASE_URL;
assert.equal(new URL(url).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
const service = createClient(url, process.env.OTR_DEV_SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const expenseId = "310f467f-7ade-529b-a85c-1151451102ea";
const settlementId = "60702abe-988f-48f3-acbb-7485a60eaed0";
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const read = async (query) => {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
};

const settlement = await read(
  service.from("settlements").select("*").eq("id", settlementId).single(),
);
const input = await read(
  service
    .from("settlement_inputs")
    .select("*")
    .eq("settlement_id", settlementId)
    .eq("expense_id", expenseId)
    .single(),
);
const frozenValuation = await read(
  service
    .from("settlement_valuation_snapshots")
    .select("*")
    .eq("id", input.valuation_snapshot_id)
    .single(),
);
const transfers = await read(
  service
    .from("settlement_transfers")
    .select("id")
    .eq("settlement_id", settlementId)
    .order("id"),
);
const payments = await read(
  service
    .from("settlement_payments")
    .select("*")
    .in(
      "transfer_id",
      transfers.map((transfer) => transfer.id),
    )
    .order("id"),
);
const expense = await read(
  service.from("expenses").select("*").eq("id", expenseId).single(),
);
const valuations = await read(
  service
    .from("settlement_valuation_snapshots")
    .select("*")
    .eq("expense_id", expenseId)
    .order("created_at"),
);
const rates = await read(
  service
    .from("exchange_rate_snapshots")
    .select("*")
    .eq("expense_id", expenseId)
    .order("created_at"),
);
const audits = await read(
  service
    .from("expense_audit_events")
    .select("expense_revision,event_type,metadata,created_at")
    .eq("expense_id", expenseId)
    .order("expense_revision"),
);
const quotes = await read(
  service
    .from("ledger_rate_quotes")
    .select(
      "economic_date,reference_date,decimal_rate,provider,provider_reference,policy_version",
    )
    .eq("journey_id", expense.journey_id)
    .eq("economic_date", "2026-07-25")
    .eq("quote_currency", "ISK")
    .eq("base_currency", "CNY"),
);
const failures = await read(
  service.from("ledger_auto_valuation_failures").select("*").eq("expense_id", expenseId),
);
const attempts = await read(
  service
    .from("ledger_rate_quote_attempts")
    .select("status,attempt_count,next_retry_at,last_attempt_at")
    .eq("journey_id", expense.journey_id)
    .eq("economic_date", "2026-07-25")
    .eq("quote_currency", "ISK")
    .eq("base_currency", "CNY"),
);
const demands = await read(
  service.rpc("ledger_list_settlement_auto_reference_demands", {
    target_journey: expense.journey_id,
    max_requests: 4,
  }),
);
console.log(
  JSON.stringify(
    {
      frozen: {
        settlementStatus: settlement.status,
        settlementSha256: digest(settlement),
        inputRevision: input.expense_revision,
        inputSha256: digest(input),
        valuationSha256: digest(frozenValuation),
        paymentCount: payments.length,
        paymentSha256: digest(payments),
      },
      current: {
        revision: expense.revision,
        economicDate: expense.economic_date,
        status: expense.business_status,
        money: [
          expense.original_amount_minor,
          expense.original_currency,
          expense.original_currency_scale,
        ],
        valuations: valuations.map((valuation) => ({
          id: valuation.id,
          revision: valuation.expense_revision,
          policy: valuation.policy,
          active: valuation.is_active,
          settlementMinor: valuation.settlement_amount_minor,
          decimalRate: valuation.decimal_rate,
          rateSnapshotId: valuation.rate_snapshot_id,
        })),
        rates: rates.map((rate) => ({
          id: rate.id,
          decimalRate: rate.decimal_rate,
          effectiveDate: rate.effective_date,
          source: rate.source,
          provenance: rate.provenance,
        })),
        audits,
        quotes,
        failures,
        attempts,
        scannerSeesBakery: demands.some((demand) => demand.expense_id === expenseId),
      },
    },
    null,
    2,
  ),
);
