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
const users = {
  owner: "00000000-0000-4000-8000-000000000001",
  member: "00000000-0000-4000-8000-000000000002",
  guest: "00000000-0000-4000-8000-000000000003",
};
const tripId = randomUUID();
const members = {
  owner: randomUUID(),
  member: randomUUID(),
  guest: randomUUID(),
};

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
  return { status: response.status, body: await response.json() };
}

function expectStatus(result, expected, label) {
  assert.equal(result.status, expected, `${label}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function journeyCounts() {
  const tables = [
    "settlements",
    "settlement_inputs",
    "settlement_member_balances",
    "settlement_transfers",
    "settlement_payments",
    "settlement_payment_discharges",
  ];
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => {
        const result = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("journey_id", tripId);
        if (result.error) throw result.error;
        return [table, result.count ?? 0];
      }),
    ),
  );
}

const insertedTrip = await admin.from("trips").insert({
  id: tripId,
  name: `Settlement 2 Phase 1B ${tripId.slice(0, 8)}`,
  created_by: users.owner,
});
if (insertedTrip.error) throw insertedTrip.error;
const insertedMembers = await admin.from("journey_members").insert([
  {
    id: members.owner,
    trip_id: tripId,
    user_id: users.owner,
    display_name: "Phase 1B Owner",
    role: "owner",
    status: "linked",
    linked_at: new Date().toISOString(),
  },
  {
    id: members.member,
    trip_id: tripId,
    user_id: users.member,
    display_name: "Phase 1B Member",
    role: "group_member",
    status: "linked",
    linked_at: new Date().toISOString(),
  },
  {
    id: members.guest,
    trip_id: tripId,
    user_id: users.guest,
    display_name: "Phase 1B Guest",
    role: "group_member",
    status: "linked",
    linked_at: new Date().toISOString(),
  },
]);
if (insertedMembers.error) throw insertedMembers.error;
const settings = await admin.from("ledger_settings").insert({
  journey_id: tripId,
  settlement_currency: "NZD",
  settlement_scale: 2,
  valuation_policy: "REFERENCE_RATE",
  updated_by: users.owner,
});
if (settings.error) throw settings.error;

const [owner, member, guest] = await Promise.all([
  token("owner"),
  token("member"),
  token("guest"),
]);
const before = await journeyCounts();
const endpoint = "/ledger/personal-payments";
const paidId = randomUUID();
const receivedId = randomUUID();
const organizerReadId = randomUUID();
const paid = {
  id: paidId,
  counterpartyMemberId: members.member,
  direction: "PAID",
  amountMinor: 30_000,
  currency: "NZD",
  scale: 2,
  occurredAt: "2026-09-22T10:00:00+12:00",
  note: "Independent payer record",
  recordedEquivalentMinor: 17_250,
  recordedEquivalentCurrency: "AUD",
  recordedEquivalentScale: 2,
  referenceRateDecimal: "0.575",
  referenceRateDate: "2026-09-21",
  referenceSource: "acceptance metadata",
  referenceProvenance: { informational: true },
};
const paidKey = randomUUID();
const createdPaid = expectStatus(
  await api(owner, "POST", endpoint, paid, paidKey),
  201,
  "owner create PAID",
);
assert.equal(createdPaid.record.ownerUserId, users.owner);
assert.equal(createdPaid.record.ownerMemberId, members.owner);
assert.equal(createdPaid.record.recordedEquivalentMinor, 17_250);
assert.equal(createdPaid.record.referenceRateDecimal, "0.575");
assert.equal(
  expectStatus(await api(owner, "POST", endpoint, paid, paidKey), 200, "create replay")
    .idempotentReplay,
  true,
);
assert.equal(
  expectStatus(
    await api(member, "GET", `${endpoint}/${paidId}`),
    200,
    "counterparty read",
  ).record.id,
  paidId,
);
expectStatus(await api(guest, "GET", `${endpoint}/${paidId}`), 404, "unrelated read");

const received = {
  id: receivedId,
  counterpartyMemberId: members.owner,
  direction: "RECEIVED",
  amountMinor: 29_500,
  currency: "NZD",
  scale: 2,
  occurredAt: "2026-09-22T10:01:00+12:00",
};
expectStatus(
  await api(member, "POST", endpoint, received, randomUUID()),
  201,
  "member create independent RECEIVED",
);
expectStatus(
  await api(
    member,
    "POST",
    endpoint,
    {
      id: organizerReadId,
      counterpartyMemberId: members.guest,
      direction: "PAID",
      amountMinor: 5_000,
      currency: "NZD",
      scale: 2,
      occurredAt: "2026-09-22T10:02:00+12:00",
    },
    randomUUID(),
  ),
  201,
  "member create organizer-only read record",
);
expectStatus(
  await api(owner, "GET", `${endpoint}/${organizerReadId}`),
  200,
  "organizer read",
);
expectStatus(
  await api(
    owner,
    "PATCH",
    `${endpoint}/${organizerReadId}`,
    {
      counterpartyMemberId: members.guest,
      direction: "PAID",
      amountMinor: 5_000,
      currency: "NZD",
      scale: 2,
      occurredAt: "2026-09-22T10:02:00+12:00",
      baseRevision: 1,
    },
    randomUUID(),
  ),
  403,
  "organizer cannot edit another owner record",
);
expectStatus(
  await api(
    owner,
    "POST",
    endpoint,
    { ...paid, id: randomUUID(), ownerUserId: users.member },
    randomUUID(),
  ),
  400,
  "organizer cannot impersonate",
);

const updateKey = randomUUID();
const update = {
  counterpartyMemberId: members.guest,
  direction: "PAID",
  amountMinor: 30_100,
  currency: "NZD",
  scale: 2,
  occurredAt: "2026-09-22T10:03:00+12:00",
  note: "Counterparty changed without revoking history",
  recordedEquivalentMinor: 17_250,
  recordedEquivalentCurrency: "AUD",
  recordedEquivalentScale: 2,
  referenceRateDecimal: "0.575",
  referenceRateDate: "2026-09-21",
  referenceSource: "acceptance metadata",
  referenceProvenance: { informational: true },
  baseRevision: 1,
};
const updated = expectStatus(
  await api(owner, "PATCH", `${endpoint}/${paidId}`, update, updateKey),
  200,
  "owner update",
);
assert.equal(updated.record.revision, 2);
assert.equal(updated.record.recordedEquivalentMinor, 17_250);
assert.equal(
  expectStatus(
    await api(owner, "PATCH", `${endpoint}/${paidId}`, update, updateKey),
    200,
    "update replay",
  ).idempotentReplay,
  true,
);
expectStatus(
  await api(owner, "PATCH", `${endpoint}/${paidId}`, update, randomUUID()),
  409,
  "stale update",
);
expectStatus(
  await api(owner, "DELETE", `${endpoint}/${paidId}`, { baseRevision: 1 }, randomUUID()),
  409,
  "stale delete",
);
const deleteKey = randomUUID();
const deleted = expectStatus(
  await api(owner, "DELETE", `${endpoint}/${paidId}`, { baseRevision: 2 }, deleteKey),
  200,
  "soft delete",
);
assert.equal(deleted.record.revision, 3);
assert.ok(deleted.record.deletedAt);
assert.equal(
  expectStatus(
    await api(owner, "DELETE", `${endpoint}/${paidId}`, { baseRevision: 2 }, deleteKey),
    200,
    "delete replay",
  ).idempotentReplay,
  true,
);

const removed = await admin
  .from("journey_members")
  .update({ status: "unlinked" })
  .eq("id", members.member);
if (removed.error) throw removed.error;
assert.equal(
  expectStatus(
    await api(member, "GET", `${endpoint}/${paidId}`),
    200,
    "removed historical read",
  ).record.deletedAt,
  deleted.record.deletedAt,
);
expectStatus(
  await api(member, "POST", endpoint, { ...received, id: randomUUID() }, randomUUID()),
  403,
  "removed create forbidden",
);
expectStatus(
  await api(
    member,
    "PATCH",
    `${endpoint}/${receivedId}`,
    { ...received, baseRevision: 1 },
    randomUUID(),
  ),
  403,
  "removed update forbidden",
);
expectStatus(
  await api(
    member,
    "DELETE",
    `${endpoint}/${receivedId}`,
    { baseRevision: 1 },
    randomUUID(),
  ),
  403,
  "removed delete forbidden",
);

const laterId = randomUUID();
expectStatus(
  await api(
    owner,
    "POST",
    endpoint,
    {
      id: laterId,
      counterpartyMemberId: members.guest,
      direction: "PAID",
      amountMinor: 100,
      currency: "NZD",
      scale: 2,
      occurredAt: "2026-09-22T10:04:00+12:00",
    },
    randomUUID(),
  ),
  201,
  "later unrelated create",
);
expectStatus(
  await api(member, "GET", `${endpoint}/${laterId}`),
  404,
  "removed user cannot read later unrelated record",
);

const history = expectStatus(
  await api(member, "GET", `${endpoint}?includeDeleted=true`),
  200,
  "removed historical list",
);
assert.ok(history.payments.some((record) => record.id === paidId && record.deletedAt));
assert.ok(!history.payments.some((record) => record.id === laterId));
const dedicatedChanges = expectStatus(
  await api(member, "GET", `${endpoint}/changes`),
  200,
  "historical-safe changes",
);
assert.ok(dedicatedChanges.changes.some((change) => change.entityId === paidId));
assert.ok(dedicatedChanges.cursor);
const bootstrap = expectStatus(
  await api(owner, "GET", "/ledger/bootstrap"),
  200,
  "bootstrap projection",
);
assert.ok(bootstrap.personalPayments.some((record) => record.id === paidId));
const genericChanges = expectStatus(
  await api(owner, "GET", "/ledger/changes"),
  200,
  "generic change projection",
);
assert.ok(
  genericChanges.changes.some(
    (change) =>
      change.entityType === "PERSONAL_SETTLEMENT_PAYMENT" &&
      change.entityId === paidId &&
      change.isTombstone,
  ),
);

const rows = await admin
  .from("personal_settlement_payment_records")
  .select("id,amount_minor,direction")
  .eq("journey_id", tripId);
if (rows.error) throw rows.error;
assert.ok(rows.data.some((row) => row.id === paidId && row.amount_minor === 30_100));
assert.ok(rows.data.some((row) => row.id === receivedId && row.amount_minor === 29_500));
assert.deepEqual(await journeyCounts(), before);

console.log(
  JSON.stringify({
    assertions: 34,
    tripId,
    records: rows.data.length,
    historicalRead: true,
    canonicalAndLegacyUnchanged: true,
  }),
);
