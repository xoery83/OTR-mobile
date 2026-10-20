import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  batch1,
  batch2,
  projectRef,
} from "./manifests/hosted-dev-personal-payment-fx-slice-d.mjs";

const url = process.env.OTR_DEV_SUPABASE_URL;
const apiUrl = process.env.OTR_DEV_API_BASE_URL ?? "https://api-dev.xoery.art";
assert.equal(new URL(url).hostname, `${projectRef}.supabase.co`);
assert.equal(new URL(apiUrl).hostname, "api-dev.xoery.art");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.OTR_DEV_SUPABASE_SECRET_KEY, options);
const publicAuth = createClient(
  url,
  process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
  options,
);
const cohort = [...batch1, ...batch2];
const ids = cohort.map(({ paymentId }) => paymentId);
const deletedIds = [
  "403ac8e6-125a-476a-846c-00a0b06a762e",
  "6c1ed23a-4aeb-4af9-bfa8-a5f797ef95d8",
  "7242747b-1542-48e5-954c-32f6d4312746",
  "9ec2b22a-68aa-482a-9fb8-5c284183632c",
  "c952ee3a-2342-44ae-bcb9-4184730880e8",
  "df2eeeab-501c-429a-b778-13507273d2e7",
  "e9f488fd-1ee5-4668-970f-258166aa6160",
];
const currentIds = [
  "253d7f31-8d8a-43f1-b088-0f4ddd17a36d",
  "2d168788-18cb-42d4-aca6-c1fdb9474452",
  "34ab865f-ff0a-4105-aa52-49fe238d7f9f",
  "3b4ecf61-7d02-40b4-a484-2523a148184b",
  "45d2871d-a8f0-457b-a651-4b94671748fa",
  "68b54fbf-da33-4fd8-b2a1-0a50884c145e",
  "8acdf30e-3379-477e-b941-d0164e670fe9",
  "adfea31c-7fd0-4652-9d42-873a3d458e24",
  "f59f3162-56a1-4851-80bd-3a190bb20457",
  "f7db5aec-7910-4cea-ad12-87142573fa39",
  "fe02695c-8445-4f75-895e-ffc9a552de2a",
];

async function select(table, columns, configure) {
  let query = admin.from(table).select(columns);
  if (configure) query = configure(query);
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

async function projectionCounts() {
  const projections = await select(
    "personal_settlement_payment_fx_projections",
    "id,payment_id,revision,state,failure_category,target_currency",
    (query) => query.in("payment_id", ids),
  );
  const projectionIds = projections.map(({ id }) => id);
  const audits = await select(
    "personal_settlement_payment_fx_projection_audit_events",
    "id",
    (query) => query.in("payment_id", ids),
  );
  const changes = await select("ledger_changes", "sequence", (query) =>
    query
      .eq("entity_type", "PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION")
      .in("entity_id", projectionIds),
  );
  return { projections, audits: audits.length, changes: changes.length };
}

assert.equal(batch1.length, 28);
assert.equal(batch2.length, 11);
const payments = await select(
  "personal_settlement_payment_records",
  "id,journey_id,owner_user_id,revision,updated_at,economic_date,economic_date_source",
  (query) => query.in("id", ids),
);
assert.equal(payments.length, 39);
for (const expected of cohort) {
  const payment = payments.find(({ id }) => id === expected.paymentId);
  assert.equal(payment.revision, expected.expectedRevision);
  assert.equal(payment.economic_date_source, "LEGACY_DERIVED_UTC");
}
const counted = await projectionCounts();
assert.equal(counted.projections.length, 39);

const untouchedDeleted = await select(
  "personal_settlement_payment_records",
  "id,economic_date_source",
  (query) => query.in("id", deletedIds),
);
assert.equal(untouchedDeleted.length, 7);
assert.ok(
  untouchedDeleted.every(({ economic_date_source }) => economic_date_source == null),
);
assert.equal(
  (
    await select("personal_settlement_payment_fx_projections", "id", (query) =>
      query.in("payment_id", deletedIds),
    )
  ).length,
  0,
);
const untouchedCurrent = await select(
  "personal_settlement_payment_records",
  "id,economic_date_source",
  (query) => query.in("id", currentIds),
);
assert.equal(untouchedCurrent.length, 11);
assert.ok(
  untouchedCurrent.every(({ economic_date_source }) => economic_date_source == null),
);
assert.equal(
  (
    await select("personal_settlement_payment_fx_projections", "id", (query) =>
      query.in("payment_id", currentIds),
    )
  ).length,
  22,
);

const attemptRows = await select(
  "ledger_rate_quote_attempts",
  "journey_id,economic_date,quote_currency,base_currency,policy_version,status,attempt_count,next_retry_at",
);
const groups = new Set();
for (const expected of batch2) {
  const projection = counted.projections.find(
    ({ payment_id, target_currency }) =>
      payment_id === expected.paymentId &&
      target_currency === expected.expectedTargetCurrency,
  );
  assert.ok(projection);
  const payment = await select(
    "personal_settlement_payment_records",
    "journey_id,economic_date,currency",
    (query) => query.eq("id", expected.paymentId).limit(1),
  );
  const row = payment[0];
  groups.add(
    `${row.journey_id}:${row.economic_date}:${row.currency}:${expected.expectedTargetCurrency}:ECB_DAILY_V1`,
  );
}
assert.equal(groups.size, 6);
const relevantAttempts = attemptRows.filter((row) =>
  groups.has(
    `${row.journey_id}:${row.economic_date}:${row.quote_currency}:${row.base_currency}:${row.policy_version}`,
  ),
);
assert.equal(relevantAttempts.length, 6);
for (const expected of batch2) {
  const payment = payments.find(({ id }) => id === expected.paymentId);
  const projection = counted.projections.find(
    ({ payment_id }) => payment_id === expected.paymentId,
  );
  if (payment.economic_date < "2026-09-24") assert.equal(projection.state, "CONFIRMED");
  else
    assert.ok(
      projection.state === "CONFIRMED" ||
        (projection.state === "PENDING" &&
          projection.failure_category === "NOT_YET_AVAILABLE"),
    );
}

const beforeReplay = await projectionCounts();
const replay = await admin.rpc("ledger_backfill_personal_payment_fx_1d", { cohort });
if (replay.error) throw replay.error;
assert.equal(replay.data.provenanceUpdated, 0);
assert.equal(replay.data.projectionsCreated, 0);
const afterReplay = await projectionCounts();
assert.deepEqual(afterReplay, beforeReplay);

async function token(userId) {
  const user = await admin.auth.admin.getUserById(userId);
  if (user.error) throw user.error;
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.data.user.email,
  });
  if (link.error) throw link.error;
  const verified = await publicAuth.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error) throw verified.error;
  return verified.data.session.access_token;
}

const scopes = new Map();
for (const payment of payments) {
  const key = `${payment.owner_user_id}:${payment.journey_id}`;
  const values = scopes.get(key) ?? [];
  values.push(payment.id);
  scopes.set(key, values);
}
let apiScopes = 0;
let ledgerBootstrapScopes = 0;
for (const [scope, paymentIds] of scopes) {
  const [userId, journeyId] = scope.split(":");
  const accessToken = await token(userId);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const listResponse = await fetch(
    `${apiUrl}/v2/trips/${journeyId}/ledger/personal-payments`,
    { headers },
  );
  assert.ok(
    listResponse.ok,
    `Personal Payment bootstrap ${journeyId}: ${listResponse.status}`,
  );
  const list = await listResponse.json();
  for (const paymentId of paymentIds) {
    assert.ok(
      list.payments.some(
        ({ id, economicDateSource }) =>
          id === paymentId && economicDateSource === "LEGACY_DERIVED_UTC",
      ),
    );
    assert.ok(list.projections.some(({ paymentId: id }) => id === paymentId));
  }
  const bootstrapResponse = await fetch(
    `${apiUrl}/v2/trips/${journeyId}/ledger/bootstrap`,
    { headers },
  );
  if (bootstrapResponse.ok) {
    const bootstrap = await bootstrapResponse.json();
    for (const paymentId of paymentIds) {
      assert.ok(bootstrap.personalPayments.some(({ id }) => id === paymentId));
      assert.ok(
        bootstrap.personalPaymentFxProjections.some(
          ({ paymentId: id }) => id === paymentId,
        ),
      );
    }
    ledgerBootstrapScopes += 1;
  } else assert.equal(bootstrapResponse.status, 403);

  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < 20; page += 1) {
    const endpoint = new URL(
      `${apiUrl}/v2/trips/${journeyId}/ledger/personal-payments/changes`,
    );
    if (cursor) endpoint.searchParams.set("cursor", cursor);
    const response = await fetch(endpoint, { headers });
    assert.ok(response.ok, `changes ${journeyId}: ${response.status}`);
    const body = await response.json();
    for (const change of body.changes)
      if (
        change.entityType === "PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION" &&
        change.aggregate
      )
        seen.add(change.aggregate.paymentId);
    cursor = body.cursor;
    if (!body.hasMore) break;
  }
  for (const paymentId of paymentIds) assert.ok(seen.has(paymentId));
  apiScopes += 1;
}

console.log(
  JSON.stringify(
    {
      payments: payments.length,
      projections: counted.projections.length,
      projectionAudits: counted.audits,
      projectionChanges: counted.changes,
      rateDemandGroups: groups.size,
      rateAttempts: relevantAttempts,
      fullReplay: replay.data,
      apiScopes,
      ledgerBootstrapScopes,
    },
    null,
    2,
  ),
);
