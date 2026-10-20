import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.OTR_DEV_SUPABASE_URL;
const apiUrl = process.env.OTR_DEV_API_BASE_URL ?? "https://api-dev.xoery.art";
assert.equal(new URL(supabaseUrl).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
assert.equal(new URL(apiUrl).hostname, "api-dev.xoery.art");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, process.env.OTR_DEV_SUPABASE_SECRET_KEY, options);
const publicAuth = createClient(
  supabaseUrl,
  process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
  options,
);
const ownerUserId = "00000000-0000-4000-8000-000000000001";
const memberUserId = "00000000-0000-4000-8000-000000000002";
const tripId = randomUUID();
const memberId = randomUUID();

async function token(role) {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: `${role}@otr.invalid`,
  });
  if (link.error) throw link.error;
  const verified = await publicAuth.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error) throw verified.error;
  assert.ok(verified.data.session?.access_token);
  return verified.data.session.access_token;
}

async function api(actor, method, path, body, operationId) {
  const response = await fetch(`${apiUrl}/v2/trips/${tripId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${actor}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(operationId ? { "Idempotency-Key": operationId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  assert.ok(
    response.ok,
    `${method} ${path}: ${response.status} ${JSON.stringify(value)}`,
  );
  return value;
}

async function createPayment(actor, values) {
  return api(
    actor,
    "POST",
    "/ledger/personal-payments",
    {
      id: randomUUID(),
      counterpartyMemberId: memberId,
      direction: "PAID",
      note: null,
      ...values,
    },
    randomUUID(),
  );
}

async function waitForProjection(actor, paymentId, predicate, label) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const value = await api(actor, "GET", `/ledger/personal-payments/${paymentId}`);
    const projection = value.projections.find(predicate);
    if (projection) return { record: value.record, projection };
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  assert.fail(`${label} did not converge within 120 seconds`);
}

await admin
  .from("trips")
  .insert({
    id: tripId,
    name: `Slice C Personal Payment FX ${tripId.slice(0, 8)}`,
    created_by: ownerUserId,
  })
  .then(({ error }) => {
    if (error) throw error;
  });
const ownerMember = await admin
  .from("journey_members")
  .select("id")
  .eq("trip_id", tripId)
  .eq("user_id", ownerUserId)
  .single();
if (ownerMember.error) throw ownerMember.error;
await admin
  .from("journey_members")
  .insert({
    id: memberId,
    trip_id: tripId,
    user_id: memberUserId,
    display_name: "Slice C Member",
    role: "group_member",
    status: "linked",
    linked_at: new Date().toISOString(),
  })
  .then(({ error }) => {
    if (error) throw error;
  });
await admin
  .from("ledger_settings")
  .insert({
    journey_id: tripId,
    settlement_currency: "NZD",
    settlement_scale: 2,
    valuation_policy: "REFERENCE_RATE",
    updated_by: ownerUserId,
  })
  .then(({ error }) => {
    if (error) throw error;
  });

const owner = await token("owner");
const sameCurrency = await createPayment(owner, {
  amountMinor: 1_234,
  currency: "NZD",
  scale: 2,
  occurredAt: "2026-09-24T00:30:00+12:00",
  economicDate: "2026-09-23",
  recordedEquivalentMinor: 999_999,
  recordedEquivalentCurrency: "NZD",
  recordedEquivalentScale: 2,
  referenceRateDecimal: "999",
  referenceRateDate: "2026-09-23",
  referenceSource: "untrusted acceptance input",
});
assert.equal(sameCurrency.record.economicDate, "2026-09-23");
assert.equal(sameCurrency.record.recordedEquivalentMinor, null);
assert.equal(sameCurrency.record.referenceRateDecimal, null);
assert.deepEqual(
  sameCurrency.projections.map((item) => [item.state, item.equivalentMinor]),
  [["CONFIRMED", 1_234]],
);

const firstUsd = await createPayment(owner, {
  amountMinor: 1_000,
  currency: "USD",
  scale: 2,
  occurredAt: "2026-09-22T12:00:00+12:00",
  economicDate: "2026-09-22",
});
assert.equal(firstUsd.record.revision, 1);
const firstUsdConfirmed = await waitForProjection(
  owner,
  firstUsd.record.id,
  (item) => item.targetCurrency === "NZD" && item.state === "CONFIRMED",
  "first USD projection",
);
assert.equal(firstUsdConfirmed.record.revision, 1);
assert.equal(firstUsdConfirmed.projection.provider, "ECB");
assert.ok(firstUsdConfirmed.projection.referenceDate <= "2026-09-22");

const cachedUsd = await createPayment(owner, {
  amountMinor: 500,
  currency: "USD",
  scale: 2,
  occurredAt: "2026-09-22T13:00:00+12:00",
  economicDate: "2026-09-22",
});
assert.equal(cachedUsd.projections[0].state, "CONFIRMED");
assert.equal(
  cachedUsd.projections[0].rateQuoteId,
  firstUsdConfirmed.projection.rateQuoteId,
);

const isk = await createPayment(owner, {
  amountMinor: 1_500,
  currency: "ISK",
  scale: 0,
  occurredAt: "2026-09-22T14:00:00+12:00",
  economicDate: "2026-09-22",
});
const iskConfirmed = await waitForProjection(
  owner,
  isk.record.id,
  (item) => item.targetCurrency === "NZD" && item.state === "CONFIRMED",
  "ISK projection",
);
assert.ok(Number.isSafeInteger(iskConfirmed.projection.equivalentMinor));

const weekend = await createPayment(owner, {
  amountMinor: 700,
  currency: "USD",
  scale: 2,
  occurredAt: "2026-09-20T12:00:00+12:00",
  economicDate: "2026-09-20",
});
const weekendConfirmed = await waitForProjection(
  owner,
  weekend.record.id,
  (item) => item.targetCurrency === "NZD" && item.state === "CONFIRMED",
  "weekend projection",
);
assert.ok(weekendConfirmed.projection.referenceDate < "2026-09-20");

const unsupported = await createPayment(owner, {
  amountMinor: 1_000,
  currency: "BHD",
  scale: 3,
  occurredAt: "2026-09-22T15:00:00+12:00",
  economicDate: "2026-09-22",
});
const unsupportedResult = await waitForProjection(
  owner,
  unsupported.record.id,
  (item) =>
    item.targetCurrency === "NZD" &&
    item.state === "UNAVAILABLE" &&
    item.failureCategory === "UNSUPPORTED",
  "unsupported currency projection",
);
assert.equal(unsupportedResult.record.revision, 1);

const updated = await api(
  owner,
  "PATCH",
  `/ledger/personal-payments/${firstUsd.record.id}`,
  {
    baseRevision: 1,
    counterpartyMemberId: memberId,
    direction: "PAID",
    amountMinor: 2_000,
    currency: "USD",
    scale: 2,
    occurredAt: "2026-09-22T12:00:00+12:00",
    economicDate: "2026-09-22",
    note: "edited once",
  },
  randomUUID(),
);
assert.equal(updated.record.revision, 2);
const updatedConfirmed = await waitForProjection(
  owner,
  firstUsd.record.id,
  (item) =>
    item.targetCurrency === "NZD" &&
    item.state === "CONFIRMED" &&
    item.sourcePaymentRevision === 2 &&
    item.originalAmountMinor === 2_000,
  "edited USD projection",
);
assert.equal(updatedConfirmed.record.revision, 2);

const beforeCurrencyChange = await api(
  owner,
  "GET",
  `/ledger/personal-payments/${isk.record.id}`,
);
const oldNzdProjectionId = beforeCurrencyChange.projections.find(
  (item) => item.targetCurrency === "NZD",
).id;
const preview = await api(owner, "POST", "/ledger/journey-currency/preview", {
  proposedCurrency: "USD",
});
await api(
  owner,
  "POST",
  "/ledger/journey-currency/commit",
  {
    proposedCurrency: "USD",
    baseSettingsRevision: preview.settingsRevision,
    previewDigest: preview.previewDigest,
  },
  randomUUID(),
);
const retargeted = await api(owner, "GET", `/ledger/personal-payments/${isk.record.id}`);
assert.ok(
  retargeted.projections.some(
    (item) => item.id === oldNzdProjectionId && item.targetCurrency === "NZD",
  ),
);
assert.ok(retargeted.projections.some((item) => item.targetCurrency === "USD"));

const changes = await api(owner, "GET", "/ledger/personal-payments/changes");
assert.ok(
  changes.changes.some(
    (item) => item.entityType === "PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION",
  ),
);
const bootstrap = await api(owner, "GET", "/ledger/bootstrap");
assert.ok(
  bootstrap.personalPaymentFxProjections.some(
    (item) => item.paymentId === firstUsd.record.id,
  ),
);

const canonicalTables = [
  "settlements",
  "settlement_inputs",
  "settlement_member_balances",
  "settlement_transfers",
  "settlement_payments",
  "settlement_payment_discharges",
];
for (const table of canonicalTables) {
  const result = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("journey_id", tripId);
  if (result.error) throw result.error;
  assert.equal(result.count, 0, `${table} must remain outside projection flow`);
}

console.log(
  JSON.stringify({
    tripId,
    assertions: 27,
    usdEquivalentMinor: updatedConfirmed.projection.equivalentMinor,
    iskEquivalentMinor: iskConfirmed.projection.equivalentMinor,
    weekendReferenceDate: weekendConfirmed.projection.referenceDate,
    paymentRevisionAfterResolver: updatedConfirmed.record.revision,
  }),
);
