import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  batch1,
  batch2,
  projectRef,
} from "./manifests/hosted-dev-personal-payment-fx-slice-d.mjs";

const number = process.argv[2];
assert.ok(["batch1", "batch2"].includes(number), "usage: ... batch1|batch2");
const cohort = number === "batch1" ? batch1 : batch2;
const url = process.env.OTR_DEV_SUPABASE_URL;
assert.equal(new URL(url).hostname, `${projectRef}.supabase.co`);
const db = createClient(url, process.env.OTR_DEV_SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ids = cohort.map(({ paymentId }) => paymentId);

async function rows(table, columns, filter) {
  let query = db.from(table).select(columns);
  if (filter) query = filter(query);
  const result = await query;
  if (result.error) throw result.error;
  return result.data.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function digest(payment) {
  return createHash("md5")
    .update(
      `${payment.amount_minor}:${payment.currency}:${payment.scale}:${payment.economic_date}:${payment.revision}`,
    )
    .digest("hex");
}

async function canonicalSnapshot(journeyIds) {
  const tables = [
    "settlement_valuation_snapshots",
    "settlements",
    "settlement_inputs",
    "settlement_member_balances",
    "settlement_transfers",
    "settlement_payments",
    "settlement_payment_discharges",
    "settlement_adjustment_deltas",
    "settlement_audit_events",
  ];
  const snapshot = {};
  for (const table of tables)
    snapshot[table] = await rows(table, "*", (query) =>
      query.in("journey_id", journeyIds),
    );
  return JSON.stringify(snapshot);
}

async function state() {
  const payments = await rows("personal_settlement_payment_records", "*", (query) =>
    query.in("id", ids),
  );
  const journeyIds = [...new Set(payments.map(({ journey_id }) => journey_id))];
  const settings = await rows(
    "ledger_settings",
    "journey_id,settlement_currency",
    (query) => query.in("journey_id", journeyIds),
  );
  const target = new Map(
    settings.map((row) => [row.journey_id, row.settlement_currency]),
  );
  const projections = await rows(
    "personal_settlement_payment_fx_projections",
    "*",
    (query) => query.in("payment_id", ids),
  );
  const projectionIds = projections.map(({ id }) => id);
  const audits = await rows(
    "personal_settlement_payment_fx_projection_audit_events",
    "*",
    (query) => query.in("payment_id", ids),
  );
  const paymentAudits = await rows(
    "personal_settlement_payment_audit_events",
    "*",
    (query) => query.in("record_id", ids),
  );
  const paymentChanges = await rows("ledger_changes", "*", (query) =>
    query.eq("entity_type", "PERSONAL_SETTLEMENT_PAYMENT").in("entity_id", ids),
  );
  const projectionChanges = projectionIds.length
    ? await rows("ledger_changes", "*", (query) =>
        query
          .eq("entity_type", "PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION")
          .in("entity_id", projectionIds),
      )
    : [];
  return {
    payments,
    target,
    projections,
    audits,
    paymentAudits,
    paymentChanges,
    projectionChanges,
    canonical: await canonicalSnapshot(journeyIds),
  };
}

function validateInputs(value) {
  assert.equal(value.payments.length, cohort.length);
  for (const expected of cohort) {
    const payment = value.payments.find(({ id }) => id === expected.paymentId);
    assert.ok(payment && !payment.deleted_at, `${expected.paymentId} must remain active`);
    assert.equal(payment.revision, expected.expectedRevision);
    assert.equal(digest(payment), expected.expectedInputDigest);
    assert.equal(value.target.get(payment.journey_id), expected.expectedTargetCurrency);
    assert.equal(
      payment.currency === expected.expectedTargetCurrency,
      expected.classification === "IDENTITY_SAFE",
    );
    assert.ok(
      payment.economic_date_source == null ||
        payment.economic_date_source === expected.economicDateSource,
    );
  }
}

const before = await state();
validateInputs(before);
const result = await db.rpc("ledger_backfill_personal_payment_fx_1d", { cohort });
if (result.error) throw result.error;
const after = await state();
validateInputs(after);

assert.equal(result.data.entries, cohort.length);
assert.equal(result.data.demandGroups, number === "batch1" ? 0 : 6);
assert.equal(
  after.projections.length - before.projections.length,
  result.data.projectionsCreated,
);
assert.equal(after.audits.length - before.audits.length, result.data.projectionsCreated);
assert.equal(
  after.projectionChanges.length - before.projectionChanges.length,
  result.data.projectionsCreated,
);
assert.equal(after.paymentAudits.length, before.paymentAudits.length);
assert.equal(after.paymentChanges.length, before.paymentChanges.length);
assert.equal(after.canonical, before.canonical);
for (const expected of cohort) {
  const oldPayment = before.payments.find(({ id }) => id === expected.paymentId);
  const payment = after.payments.find(({ id }) => id === expected.paymentId);
  assert.equal(payment.revision, oldPayment.revision);
  assert.equal(payment.updated_at, oldPayment.updated_at);
  assert.equal(payment.economic_date_source, expected.economicDateSource);
  const projection = after.projections.find(
    ({ payment_id, target_currency }) =>
      payment_id === expected.paymentId &&
      target_currency === expected.expectedTargetCurrency,
  );
  assert.ok(projection);
  assert.equal(projection.input_digest, expected.expectedInputDigest);
  if (expected.classification === "IDENTITY_SAFE") {
    assert.equal(projection.state, "CONFIRMED");
    assert.equal(projection.equivalent_minor, payment.amount_minor);
    assert.equal(projection.rate_quote_id, null);
  }
}

const replayBefore = await state();
const replay = await db.rpc("ledger_backfill_personal_payment_fx_1d", { cohort });
if (replay.error) throw replay.error;
const replayAfter = await state();
assert.equal(replay.data.provenanceUpdated, 0);
assert.equal(replay.data.projectionsCreated, 0);
assert.equal(replayAfter.audits.length, replayBefore.audits.length);
assert.equal(replayAfter.projectionChanges.length, replayBefore.projectionChanges.length);
assert.equal(replayAfter.paymentAudits.length, replayBefore.paymentAudits.length);
assert.equal(replayAfter.paymentChanges.length, replayBefore.paymentChanges.length);
assert.equal(replayAfter.canonical, replayBefore.canonical);

console.log(
  JSON.stringify(
    {
      batch: number,
      firstRun: result.data,
      replay: replay.data,
      projections: after.projections.map(({ payment_id, state, failure_category }) => ({
        paymentId: payment_id,
        state,
        failureCategory: failure_category,
      })),
    },
    null,
    2,
  ),
);
