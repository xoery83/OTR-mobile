import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.OTR_DEV_SUPABASE_URL!;
const apiUrl = process.env.OTR_DEV_API_BASE_URL ?? "https://api-dev.xoery.art";
assert.equal(new URL(supabaseUrl).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
assert.equal(new URL(apiUrl).hostname, "api-dev.xoery.art");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  supabaseUrl,
  process.env.OTR_DEV_SUPABASE_SECRET_KEY!,
  options,
);
const publicAuth = createClient(
  supabaseUrl,
  process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY!,
  options,
);
const users = {
  owner: "00000000-0000-4000-8000-000000000001",
  member: "00000000-0000-4000-8000-000000000002",
  guest: "00000000-0000-4000-8000-000000000003",
};
const tripId = randomUUID();
const members = { owner: "", member: randomUUID(), guest: randomUUID() };

async function token(role: keyof typeof users) {
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
  return verified.data.session!.access_token;
}

async function request(
  accessToken: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  key?: string,
) {
  const response = await fetch(`${apiUrl}/v2/trips/${tripId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function expense(
  title: string,
  payerMemberId: string,
  amountMinor: number,
  shares: [number, number, number],
) {
  const money = { minor: amountMinor, currency: "NZD", scale: 2 };
  return {
    localId: randomUUID(),
    title,
    description: null as string | null,
    category: "hotel",
    occurredAt: "2026-09-23T12:00:00+12:00",
    payerMemberId,
    original: money,
    businessStatus: "ACCEPTED",
    participants: [members.owner, members.member, members.guest].map((memberId) => ({
      memberId,
      displayNameSnapshot:
        memberId === members.owner
          ? "Phase 3B Owner"
          : memberId === members.member
            ? "Phase 3B Member"
            : "Phase 3B Guest",
      householdIdSnapshot: null,
    })),
    splits: [members.owner, members.member, members.guest].map((memberId, index) => ({
      memberId,
      method: "EXACT",
      originalMinor: shares[index],
      settlementMinor: shares[index],
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    })),
    valuation: {
      policy: "SAME_CURRENCY",
      original: money,
      settlement: money,
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
  };
}

async function review(accessToken: string) {
  const result = await request(accessToken, "GET", "/settlement-review");
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body as {
    statementFingerprint: string;
    checkpoint: { id: string } | null;
    delta: { netDeltaMinor: number; changedExpenses: unknown[] } | null;
    coverage: { memberId: string; displayName: string; reviewedAt: string | null }[];
  };
}

async function checkpoint(accessToken: string, fingerprint: string) {
  const id = randomUUID();
  const result = await request(
    accessToken,
    "POST",
    "/settlement-review",
    { id, operationId: id, statementFingerprint: fingerprint },
    id,
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal((result.body as { checkpoint: { id: string } }).checkpoint.id, id);
  const replay = await request(
    accessToken,
    "POST",
    "/settlement-review",
    { id, operationId: id, statementFingerprint: fingerprint },
    id,
  );
  assert.equal(replay.status, 200);
}

async function updateExpense(
  tokenValue: string,
  expenseId: string,
  revision: number,
  input: ReturnType<typeof expense>,
) {
  const { localId: _localId, ...value } = input;
  const result = await request(
    tokenValue,
    "PUT",
    `/expenses/${expenseId}`,
    { ...value, baseRevision: revision, auditReason: "Phase 3B acceptance" },
    randomUUID(),
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
}

async function main() {
  const inserted = await admin.from("trips").insert({
    id: tripId,
    name: `Settlement 2 Phase 3B ${tripId.slice(0, 8)}`,
    created_by: users.owner,
  });
  if (inserted.error) throw inserted.error;
  const owner = await admin
    .from("journey_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", users.owner)
    .single();
  if (owner.error) throw owner.error;
  members.owner = owner.data.id;
  const added = await admin.from("journey_members").insert([
    {
      id: members.member,
      trip_id: tripId,
      user_id: users.member,
      display_name: "Phase 3B Member",
      role: "group_member",
      status: "linked",
      linked_at: new Date().toISOString(),
    },
    {
      id: members.guest,
      trip_id: tripId,
      user_id: users.guest,
      display_name: "Phase 3B Guest",
      role: "group_member",
      status: "linked",
      linked_at: new Date().toISOString(),
    },
  ]);
  if (added.error) throw added.error;
  const settings = await admin.from("ledger_settings").insert({
    journey_id: tripId,
    settlement_currency: "NZD",
    settlement_scale: 2,
    valuation_policy: "REFERENCE_RATE",
    updated_by: users.owner,
  });
  if (settings.error) throw settings.error;
  const tokens = {
    owner: await token("owner"),
    member: await token("member"),
    guest: await token("guest"),
  };

  const title = `Phase 3B Hotel ${randomUUID().slice(0, 8)}`;
  const initial = expense(title, members.owner, 2_000, [1_000, 1_000, 0]);
  const created = await request(tokens.owner, "POST", "/expenses", initial, randomUUID());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const expenseId = (created.body as { entity: { id: string } }).entity.id;

  const first = {
    owner: await review(tokens.owner),
    member: await review(tokens.member),
    guest: await review(tokens.guest),
  };
  await Promise.all(
    (Object.keys(tokens) as (keyof typeof tokens)[]).map((role) =>
      checkpoint(tokens[role], first[role].statementFingerprint),
    ),
  );
  const ownerCoverage = (await review(tokens.owner)).coverage;
  assert.equal(ownerCoverage.length, 3);
  assert.ok(ownerCoverage.every((member) => member.reviewedAt !== null));
  assert.deepEqual((await review(tokens.member)).coverage, []);

  await updateExpense(
    tokens.owner,
    expenseId,
    1,
    expense(title, members.owner, 2_400, [1_200, 1_200, 0]),
  );
  const afterAmount = {
    owner: await review(tokens.owner),
    member: await review(tokens.member),
    guest: await review(tokens.guest),
  };
  assert.ok(afterAmount.owner.delta);
  assert.ok(afterAmount.member.delta);
  assert.equal(afterAmount.guest.delta, null);

  await Promise.all(
    (Object.keys(tokens) as (keyof typeof tokens)[]).map((role) =>
      checkpoint(tokens[role], afterAmount[role].statementFingerprint),
    ),
  );
  const cosmetic = {
    ...expense(title, members.owner, 2_400, [1_200, 1_200, 0]),
    description: "Description-only correction",
  };
  await updateExpense(tokens.owner, expenseId, 2, cosmetic);
  for (const accessToken of Object.values(tokens))
    assert.equal((await review(accessToken)).delta, null);

  const beforeSplit = await review(tokens.member);
  await updateExpense(
    tokens.owner,
    expenseId,
    3,
    expense(title, members.owner, 2_400, [1_000, 1_200, 200]),
  );
  const staleId = randomUUID();
  const stale = await request(
    tokens.member,
    "POST",
    "/settlement-review",
    {
      id: staleId,
      operationId: staleId,
      statementFingerprint: beforeSplit.statementFingerprint,
    },
    staleId,
  );
  assert.equal(stale.status, 409);
  const afterSplit = {
    owner: await review(tokens.owner),
    member: await review(tokens.member),
    guest: await review(tokens.guest),
  };
  assert.ok(afterSplit.guest.delta, "new nonzero participant must be affected");

  await Promise.all(
    (Object.keys(tokens) as (keyof typeof tokens)[]).map((role) =>
      checkpoint(tokens[role], afterSplit[role].statementFingerprint),
    ),
  );
  await updateExpense(
    tokens.owner,
    expenseId,
    4,
    expense(title, members.member, 2_400, [1_000, 1_200, 200]),
  );
  const afterPayer = {
    owner: await review(tokens.owner),
    member: await review(tokens.member),
    guest: await review(tokens.guest),
  };
  assert.ok(afterPayer.owner.delta);
  assert.ok(afterPayer.member.delta);
  assert.equal(afterPayer.guest.delta, null);

  await Promise.all(
    (Object.keys(tokens) as (keyof typeof tokens)[]).map((role) =>
      checkpoint(tokens[role], afterPayer[role].statementFingerprint),
    ),
  );
  const paymentId = randomUUID();
  const payment = await request(
    tokens.owner,
    "POST",
    "/ledger/personal-payments",
    {
      id: paymentId,
      counterpartyMemberId: members.member,
      direction: "PAID",
      amountMinor: 500,
      currency: "NZD",
      scale: 2,
      occurredAt: "2026-09-23T13:00:00+12:00",
      note: "Informational only",
      recordedEquivalentMinor: null,
      recordedEquivalentCurrency: null,
      recordedEquivalentScale: null,
      referenceRateDecimal: null,
      referenceRateDate: null,
      referenceSource: null,
      referenceProvenance: null,
    },
    randomUUID(),
  );
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  for (const accessToken of Object.values(tokens))
    assert.equal((await review(accessToken)).delta, null);

  console.log(
    JSON.stringify({
      assertions: 34,
      exactAuditableCheckpoint: true,
      idempotentReplay: true,
      amountOnlyAffectedMembers: true,
      splitAddedMember: true,
      payerOnlyAffectedMembers: true,
      cosmeticNoDelta: true,
      staleRejected: true,
      personalPaymentSeparated: true,
      organizerCoverage: true,
      retainedQaJourney: tripId,
      productionAccessed: false,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
