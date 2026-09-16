import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.OTR_DEV_SUPABASE_URL;
const apiUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
assert.equal(new URL(url).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
assert.equal(new URL(apiUrl).hostname, "api-dev.xoery.art");
assert.ok(
  process.env.REVIEW_TEST_PASSWORD,
  "Keychain-backed Dev test password is required",
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.OTR_DEV_SUPABASE_SECRET_KEY, options);
const publicAuth = createClient(
  url,
  process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
  options,
);
const trip = "10000000-0000-4000-8000-000000000001";
const ownerMember = "12000000-0000-4000-8000-000000000001";
const testMember = "8d040e39-745c-4d09-add2-a49040515294";

async function ownerSession() {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "owner@otr.invalid",
  });
  if (link.error) throw link.error;
  const result = await publicAuth.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (result.error) throw result.error;
  return result.data.session.access_token;
}

async function memberSession() {
  const result = await publicAuth.auth.signInWithPassword({
    email: "review2-device-member-20260917@otr.invalid",
    password: process.env.REVIEW_TEST_PASSWORD,
  });
  if (result.error) throw result.error;
  return result.data.session.access_token;
}

async function api(token, method, path, body) {
  const response = await fetch(`${apiUrl}/v2/trips/${trip}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Review-Protocol": "2",
      ...(body
        ? {
            "Content-Type": "application/json",
            "Idempotency-Key": body.operationId ?? randomUUID(),
          }
        : {}),
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

function expense(
  title,
  payer,
  memberMinor,
  { currency = "NZD", minor = 2000, date, description = null } = {},
) {
  const original = { minor, currency, scale: 2 };
  return {
    localId: randomUUID(),
    title,
    description,
    category: "food",
    occurredAt: date ?? "2026-09-16T10:00:00.000Z",
    payerMemberId: payer,
    original,
    businessStatus: "ACCEPTED",
    participants: [ownerMember, testMember].map((memberId) => ({
      memberId,
      displayNameSnapshot:
        memberId === ownerMember ? "Synthetic Owner" : "Review 2.0 Test Member",
      householdIdSnapshot: null,
    })),
    splits: [ownerMember, testMember].map((memberId) => ({
      memberId,
      method: "EXACT",
      originalMinor: memberId === testMember ? memberMinor : minor - memberMinor,
      settlementMinor: memberId === testMember ? memberMinor : minor - memberMinor,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    })),
    valuation: {
      policy: "SAME_CURRENCY",
      original,
      settlement: original,
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
  };
}

const [owner, member] = await Promise.all([ownerSession(), memberSession()]);
async function create(token, input) {
  const result = await api(token, "POST", "/expenses", input);
  return result.entity?.id ?? result.entity?.serverId ?? result.serverId;
}
async function pair(label, token, payer, memberMinor) {
  const title = `Review 2.0 ${label} ${randomUUID().slice(0, 8)}`;
  const ids = [
    await create(token, expense(title, payer, memberMinor)),
    await create(token, expense(title, payer, memberMinor)),
  ].sort();
  return { title, id: ids[1], ids };
}
async function refresh() {
  await api(owner, "POST", "/ledger/review/refresh", {});
}
async function read(token) {
  return api(token, "GET", "/ledger/review");
}
function active(projection, id, rule = "POSSIBLE_DUPLICATE") {
  return projection.findings.find(
    (f) => f.expenseId === id && f.findingType === rule && f.lifecycle === "ACTIVE",
  );
}
async function act(token, finding) {
  const operationId = randomUUID();
  return api(token, "POST", `/review-findings/${finding.id}/actions`, {
    action: "ACKNOWLEDGED",
    baseRevision: finding.revision,
    decisionRevision: finding.decisionRevision ?? 0,
    operationId,
  });
}
async function update(token, id, input, baseRevision) {
  const { localId: _localId, ...fields } = input;
  return api(token, "PUT", `/expenses/${id}`, {
    ...fields,
    baseRevision,
    auditReason: "Review 2.0 Hosted Dev acceptance",
  });
}

const ownerOnly = await pair("owner-only", member, testMember, 2000);
const creatorOnly = await pair("creator-only", member, ownerMember, 0);
const payerOnly = await pair("payer-only", owner, testMember, 0);
const splitOnly = await pair("split-only", owner, ownerMember, 1000);
await refresh();
const ownerView = await read(owner);
const memberView = await read(member);
for (const fixture of [ownerOnly, creatorOnly, payerOnly, splitOnly]) {
  assert.ok(active(ownerView, fixture.id), `Owner must see ${fixture.title}`);
  assert.ok(active(memberView, fixture.id), `Member must see ${fixture.title}`);
}
await act(owner, active(ownerView, ownerOnly.id));
await act(member, active(memberView, creatorOnly.id));
await act(member, active(memberView, payerOnly.id));
await act(member, active(memberView, splitOnly.id));

const changedSplit = expense(splitOnly.title, ownerMember, 0);
await update(owner, splitOnly.id, changedSplit, 1);
await refresh();
const afterRemoval = await read(member);
assert.ok(
  !active(afterRemoval, splitOnly.id),
  "Member must lose active split-only visibility",
);
assert.ok(active(await read(owner), splitOnly.id), "Owner must retain active visibility");

const cosmetic = expense(payerOnly.title, testMember, 0, {
  description: "Cosmetic note only",
});
const beforeCosmetic = active(await read(member), payerOnly.id);
await update(owner, payerOnly.id, cosmetic, 1);
await refresh();
const afterCosmetic = active(await read(member), payerOnly.id);
assert.equal(
  afterCosmetic?.id,
  beforeCosmetic?.id,
  "Cosmetic edit must preserve generation",
);
assert.equal(afterCosmetic?.personalDecision, "ACKNOWLEDGED");

const crossDateTitle = `Review 2.0 cross-date ${randomUUID().slice(0, 8)}`;
const dateA = await create(
  owner,
  expense(crossDateTitle, ownerMember, 0, { date: "2026-09-15T10:00:00.000Z" }),
);
const dateB = await create(
  owner,
  expense(crossDateTitle, ownerMember, 0, { date: "2026-09-16T10:00:00.000Z" }),
);
const crossCurrency = await create(
  owner,
  expense(`Review 2.0 CAD ${randomUUID().slice(0, 8)}`, ownerMember, 0, {
    currency: "CAD",
    minor: 1_000_000,
  }),
);
await refresh();
const negative = await read(owner);
assert.ok(!active(negative, dateA), "First cross-date Expense must not be duplicate");
assert.ok(!active(negative, dateB), "Second cross-date Expense must not be duplicate");
assert.ok(
  !active(negative, crossCurrency, "AMOUNT_OUTLIER"),
  "CAD must not use NZD cohort",
);

console.log(
  JSON.stringify({
    result: "PASS",
    account: "test-only Member",
    fixtures: {
      ownerOnly: ownerOnly.id,
      creatorOnly: creatorOnly.id,
      payerOnly: payerOnly.id,
      splitOnly: splitOnly.id,
      crossDate: [dateA, dateB],
      crossCurrency,
    },
    ownerNoSplit: true,
    creatorOnly: true,
    payerOnly: true,
    removedSplitVisibility: true,
    cosmeticGenerationStable: true,
    crossDateDuplicateExcluded: true,
    crossCurrencyOutlierExcluded: true,
  }),
);
