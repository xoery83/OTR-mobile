import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { ledgerBootstrapResponseSchema } from "../../src/data/api/ledgerReadContracts";

const supabaseUrl = process.env.OTR_DEV_SUPABASE_URL!;
const apiUrl = "https://api-dev.xoery.art";
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
const ownerUserId = "00000000-0000-4000-8000-000000000001";
const tripId = randomUUID();
const memberId = randomUUID();
const occurredAt = "2026-09-23T12:00:00+12:00";

async function session(email: string) {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const verified = await publicAuth.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error) throw verified.error;
  return verified.data.session!;
}

async function request(
  token: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
) {
  const response = await fetch(`${apiUrl}/v2/trips/${tripId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Review-Protocol": "2",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function expense(
  localId: string,
  title: string,
  payerMemberId: string,
  amount: number,
  aShare: number,
  bShare: number,
  ownerMemberId: string,
  participation: "INCLUDED" | "EXCLUDED" = "INCLUDED",
) {
  const original = { minor: amount, currency: "NZD", scale: 2 };
  return {
    localId,
    title,
    description: null,
    category: "food",
    occurredAt,
    economicDate: "2026-09-23",
    payerMemberId,
    original,
    businessStatus: "ACCEPTED",
    settlementParticipation: participation,
    participants: [
      {
        memberId: ownerMemberId,
        displayNameSnapshot: "Synthetic Owner",
        householdIdSnapshot: null,
      },
      {
        memberId,
        displayNameSnapshot: "Review 2.0 Device Test Member",
        householdIdSnapshot: null,
      },
    ],
    splits: [
      {
        memberId: ownerMemberId,
        method: "EXACT",
        originalMinor: aShare,
        settlementMinor: aShare,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
      {
        memberId,
        method: "EXACT",
        originalMinor: bShare,
        settlementMinor: bShare,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
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

function update(input: ReturnType<typeof expense>, baseRevision: number, title: string) {
  const { localId: _localId, ...fields } = input;
  return { ...fields, title, baseRevision, auditReason: "Acceptance update" };
}

function balances(body: unknown) {
  return (
    body as {
      balances: {
        memberId: string;
        paidMinor: number;
        owedMinor: number;
        netMinor: number;
      }[];
    }
  ).balances;
}

function assertBalances(
  body: unknown,
  ownerMemberId: string,
  expected: [[number, number, number], [number, number, number]],
) {
  const byId = new Map(balances(body).map((item) => [item.memberId, item]));
  const owner = byId.get(ownerMemberId)!;
  const member = byId.get(memberId)!;
  assert.deepEqual([owner.paidMinor, owner.owedMinor, owner.netMinor], expected[0]);
  assert.deepEqual([member.paidMinor, member.owedMinor, member.netMinor], expected[1]);
}

async function main() {
  const ownerSession = await session("owner@otr.invalid");
  const memberSession = await session("review2-device-member-20260917@otr.invalid");
  assert.equal(ownerSession.user.id, ownerUserId);

  const trip = await admin.from("trips").insert({
    id: tripId,
    name: `Settlement Final Versions Acceptance ${tripId.slice(0, 8)}`,
    start_date: "2026-09-23",
    end_date: "2026-09-24",
    created_by: ownerUserId,
  });
  if (trip.error) throw trip.error;
  const owner = await admin
    .from("journey_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", ownerUserId)
    .single();
  if (owner.error) throw owner.error;
  const ownerMemberId = String(owner.data.id);
  const member = await admin.from("journey_members").insert({
    id: memberId,
    trip_id: tripId,
    user_id: memberSession.user.id,
    display_name: "Review 2.0 Device Test Member",
    role: "group_member",
    status: "linked",
    linked_at: new Date().toISOString(),
  });
  if (member.error) throw member.error;
  const settings = await admin.from("ledger_settings").insert({
    journey_id: tripId,
    settlement_currency: "NZD",
    settlement_scale: 2,
    valuation_policy: "REFERENCE_RATE",
    updated_by: ownerUserId,
  });
  if (settings.error) throw settings.error;

  const e1Input = expense(
    randomUUID(),
    "E1 owner paid 100",
    ownerMemberId,
    10_000,
    5_000,
    5_000,
    ownerMemberId,
  );
  const e2Input = expense(
    randomUUID(),
    "E2 member paid 60",
    memberId,
    6_000,
    2_000,
    4_000,
    ownerMemberId,
  );
  const e3Input = expense(
    randomUUID(),
    "E3 excluded 40",
    ownerMemberId,
    4_000,
    2_000,
    2_000,
    ownerMemberId,
    "EXCLUDED",
  );
  const e1 = await request(
    ownerSession.access_token,
    "POST",
    "/expenses",
    e1Input,
    randomUUID(),
  );
  const e2 = await request(
    memberSession.access_token,
    "POST",
    "/expenses",
    e2Input,
    randomUUID(),
  );
  const e3 = await request(
    ownerSession.access_token,
    "POST",
    "/expenses",
    e3Input,
    randomUUID(),
  );
  for (const result of [e1, e2, e3])
    assert.equal(result.status, 201, JSON.stringify(result.body));
  const e1Id = (e1.body as { entity: { id: string } }).entity.id;
  const e2Id = (e2.body as { entity: { id: string } }).entity.id;
  const e3Id = (e3.body as { entity: { id: string } }).entity.id;

  const memberDenied = await request(
    memberSession.access_token,
    "PUT",
    `/expenses/${e1Id}`,
    update(e1Input, 1, "E1 member edit denied"),
    randomUUID(),
  );
  assert.equal(memberDenied.status, 403, JSON.stringify(memberDenied.body));
  const memberEdit = await request(
    memberSession.access_token,
    "PUT",
    `/expenses/${e2Id}`,
    update(e2Input, 1, "E2 member paid 60 edited before Final"),
    randomUUID(),
  );
  assert.equal(memberEdit.status, 200, JSON.stringify(memberEdit.body));

  const findingId = randomUUID();
  const finding = await request(
    memberSession.access_token,
    "POST",
    "/review-findings",
    {
      id: findingId,
      targetType: "EXPENSE",
      expenseId: e1Id,
      sourceRevision: 1,
      note: "Check E1 before confirmation",
      operationId: findingId,
    },
    findingId,
  );
  assert.equal(finding.status, 201, JSON.stringify(finding.body));

  const v1Preview = await request(
    ownerSession.access_token,
    "POST",
    "/settlements/preview",
    {
      throughTimestamp: "2026-09-23T23:59:59+12:00",
    },
  );
  assert.equal(v1Preview.status, 200, JSON.stringify(v1Preview.body));
  assertBalances(v1Preview.body, ownerMemberId, [
    [10_000, 7_000, 3_000],
    [6_000, 9_000, -3_000],
  ]);
  assert.equal((v1Preview.body as { inputs: unknown[] }).inputs.length, 2);
  const v1 = await request(
    ownerSession.access_token,
    "POST",
    "/settlements",
    {
      throughTimestamp: (v1Preview.body as { throughTimestamp: string }).throughTimestamp,
      inputDigest: (v1Preview.body as { inputDigest: string }).inputDigest,
    },
    randomUUID(),
  );
  assert.equal(v1.status, 201, JSON.stringify(v1.body));
  const root = (
    v1.body as {
      entity: {
        id: string;
        inputDigest: string;
        transfers: { amount: { minor: number } }[];
      };
    }
  ).entity;
  assert.equal(root.transfers[0]?.amount.minor, 3_000);

  const protectedEdit = await request(
    ownerSession.access_token,
    "PUT",
    `/expenses/${e1Id}`,
    update(e1Input, 1, "E1 protected edit denied"),
    randomUUID(),
  );
  assert.equal(protectedEdit.status, 409, JSON.stringify(protectedEdit.body));
  const excludedEdit = await request(
    ownerSession.access_token,
    "PUT",
    `/expenses/${e3Id}`,
    update(e3Input, 1, "E3 excluded 40 metadata edited"),
    randomUUID(),
  );
  assert.equal(excludedEdit.status, 200, JSON.stringify(excludedEdit.body));

  const e4Input = expense(
    randomUUID(),
    "E4 created by B paid by A 30",
    ownerMemberId,
    3_000,
    1_500,
    1_500,
    ownerMemberId,
  );
  const e4 = await request(
    memberSession.access_token,
    "POST",
    "/expenses",
    e4Input,
    randomUUID(),
  );
  assert.equal(e4.status, 201, JSON.stringify(e4.body));
  const e4Id = (e4.body as { entity: { id: string } }).entity.id;
  const v2Preview = await request(
    ownerSession.access_token,
    "POST",
    `/settlements/${root.id}/adjustments/preview`,
    {},
  );
  assert.equal(v2Preview.status, 200, JSON.stringify(v2Preview.body));
  const v2p = v2Preview.body as {
    state: string;
    expectedHeadId: string | null;
    inputDigest: string;
    zeroTransfer: boolean;
    changedExpenses: { expenseId: string; change: string }[];
    balances: { memberId: string; currentMinor: number; deltaMinor: number }[];
  };
  assert.equal(v2p.state, "PREVIEW_READY");
  assert.deepEqual(v2p.changedExpenses, [{ expenseId: e4Id, change: "NEW" }]);
  assert.deepEqual(
    v2p.balances.map((item) => [item.memberId, item.currentMinor, item.deltaMinor]),
    [
      [ownerMemberId, 4_500, 1_500],
      [memberId, -4_500, -1_500],
    ].sort(),
  );
  const v2 = await request(
    ownerSession.access_token,
    "POST",
    `/settlements/${root.id}/adjustments`,
    {
      expectedHeadId: v2p.expectedHeadId,
      inputDigest: v2p.inputDigest,
      reason: "Confirm post-Final E4",
      allowZeroTransfer: v2p.zeroTransfer,
    },
    randomUUID(),
  );
  assert.equal(v2.status, 201, JSON.stringify(v2.body));
  const v2Entity = (
    v2.body as { entity: { id: string; inputDigest: string; lineageSequence: number } }
  ).entity;
  assert.equal(v2Entity.lineageSequence, 1);
  const v2Converged = await request(
    ownerSession.access_token,
    "POST",
    `/settlements/${root.id}/adjustments/preview`,
    {},
  );
  assert.equal(
    (v2Converged.body as { state: string; inputDigest: string }).state,
    "PREVIEW_UNCHANGED",
  );
  assert.equal(
    (v2Converged.body as { inputDigest: string }).inputDigest,
    v2Entity.inputDigest,
  );

  const successorId = randomUUID();
  const correction = {
    sourceExpenseId: e1Id,
    successor: expense(
      successorId,
      "E1 corrected successor 120",
      ownerMemberId,
      12_000,
      6_000,
      6_000,
      ownerMemberId,
    ),
    reason: "Correct E1 from 100 to 120",
  };
  const correctionPreview = await request(
    ownerSession.access_token,
    "POST",
    `/settlements/${root.id}/corrections`,
    correction,
  );
  assert.equal(correctionPreview.status, 200, JSON.stringify(correctionPreview.body));
  const cp = correctionPreview.body as {
    state: string;
    expectedHeadId: string | null;
    inputDigest: string;
    zeroTransfer: boolean;
    balances: { memberId: string; currentMinor: number; deltaMinor: number }[];
  };
  assert.equal(cp.state, "PREVIEW_READY");
  assert.deepEqual(
    cp.balances.map((item) => [item.memberId, item.currentMinor, item.deltaMinor]),
    [
      [ownerMemberId, 5_500, 1_000],
      [memberId, -5_500, -1_000],
    ].sort(),
  );
  const v3 = await request(
    ownerSession.access_token,
    "POST",
    `/settlements/${root.id}/corrections/confirm`,
    {
      ...correction,
      expectedHeadId: cp.expectedHeadId,
      inputDigest: cp.inputDigest,
      allowZeroTransfer: cp.zeroTransfer,
    },
    randomUUID(),
  );
  assert.equal(v3.status, 201, JSON.stringify(v3.body));
  const v3Entity = (
    v3.body as {
      entity: {
        id: string;
        inputDigest: string;
        lineageSequence: number;
        correctionSourceExpenseId: string;
        correctionSuccessorExpenseId: string;
      };
    }
  ).entity;
  assert.equal(v3Entity.lineageSequence, 2);
  assert.equal(v3Entity.correctionSourceExpenseId, e1Id);
  assert.equal(v3Entity.correctionSuccessorExpenseId, successorId);
  const v3Converged = await request(
    ownerSession.access_token,
    "POST",
    `/settlements/${root.id}/adjustments/preview`,
    {},
  );
  assert.equal(
    (v3Converged.body as { state: string; inputDigest: string }).state,
    "PREVIEW_UNCHANGED",
  );
  assert.equal(
    (v3Converged.body as { inputDigest: string }).inputDigest,
    v3Entity.inputDigest,
  );

  const e5Input = expense(
    randomUUID(),
    "E5 excluded after V3 50",
    memberId,
    5_000,
    2_500,
    2_500,
    ownerMemberId,
    "EXCLUDED",
  );
  const e5 = await request(
    ownerSession.access_token,
    "POST",
    "/expenses",
    e5Input,
    randomUUID(),
  );
  assert.equal(e5.status, 201, JSON.stringify(e5.body));
  const e5Id = (e5.body as { entity: { id: string } }).entity.id;
  const excludedPreview = await request(
    ownerSession.access_token,
    "POST",
    `/settlements/${root.id}/adjustments/preview`,
    {},
  );
  assert.equal(
    (excludedPreview.body as { state: string; inputDigest: string }).state,
    "PREVIEW_UNCHANGED",
  );
  assert.equal(
    (excludedPreview.body as { inputDigest: string }).inputDigest,
    v3Entity.inputDigest,
  );

  const personalPaymentId = randomUUID();
  const payment = await request(
    memberSession.access_token,
    "POST",
    "/ledger/personal-payments",
    {
      id: personalPaymentId,
      counterpartyMemberId: ownerMemberId,
      direction: "PAID",
      amountMinor: 123,
      currency: "NZD",
      scale: 2,
      occurredAt,
      note: "Must not change canonical Settlement",
      auditReason: null,
    },
    personalPaymentId,
  );
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  const paymentPreview = await request(
    ownerSession.access_token,
    "POST",
    `/settlements/${root.id}/adjustments/preview`,
    {},
  );
  assert.equal(
    (paymentPreview.body as { state: string; inputDigest: string }).state,
    "PREVIEW_UNCHANGED",
  );
  assert.equal(
    (paymentPreview.body as { inputDigest: string }).inputDigest,
    v3Entity.inputDigest,
  );

  const [
    settlements,
    inputs,
    correctionLink,
    findingRow,
    personalPayments,
    sourceProjection,
  ] = await Promise.all([
    admin
      .from("settlements")
      .select("id,settlement_kind,root_settlement_id,lineage_sequence,input_digest")
      .eq("journey_id", tripId)
      .order("lineage_sequence"),
    admin
      .from("settlement_inputs")
      .select("settlement_id,expense_id,normalized_snapshot")
      .eq("journey_id", tripId),
    admin
      .from("expense_correction_successors")
      .select("source_expense_id,successor_expense_id,correction_settlement_id")
      .eq("source_expense_id", e1Id)
      .single(),
    admin
      .from("ledger_review_findings")
      .select("id,origin,human_note,author_user_id,author_member_id")
      .eq("id", findingId)
      .single(),
    admin
      .from("personal_settlement_payment_records")
      .select("id")
      .eq("journey_id", tripId),
    admin.rpc("ledger_adjustment_source_7_2b", { target_root: root.id }),
  ]);
  for (const result of [
    settlements,
    inputs,
    correctionLink,
    findingRow,
    personalPayments,
    sourceProjection,
  ])
    if (result.error) throw result.error;
  assert.deepEqual(
    settlements.data?.map((row) => [row.settlement_kind, row.lineage_sequence]),
    [
      ["ROOT", 0],
      ["ADJUSTMENT", 1],
      ["ADJUSTMENT", 2],
    ],
  );
  assert.equal(inputs.data?.filter((row) => row.settlement_id === root.id).length, 2);
  assert.equal(inputs.data?.filter((row) => row.settlement_id === v2Entity.id).length, 3);
  assert.equal(inputs.data?.filter((row) => row.settlement_id === v3Entity.id).length, 3);
  assert.equal(
    inputs.data?.some((row) => row.expense_id === e5Id),
    false,
  );
  assert.equal(correctionLink.data?.successor_expense_id, successorId);
  assert.equal(findingRow.data?.human_note, "Check E1 before confirmation");
  assert.equal(findingRow.data?.author_user_id, memberSession.user.id);
  assert.equal(findingRow.data?.author_member_id, memberId);
  assert.equal(personalPayments.data?.length, 1);
  const leaves = (
    sourceProjection.data as { expenses: { id: string; original: { minor: number } }[] }
  ).expenses;
  assert.equal(
    leaves.reduce((sum, item) => sum + item.original.minor, 0),
    30_000,
  );
  assert.ok(
    leaves.some((item) => item.id === successorId) &&
      !leaves.some((item) => item.id === e1Id),
  );

  const bootstrap = await request(ownerSession.access_token, "GET", "/ledger/bootstrap");
  assert.equal(bootstrap.status, 200, JSON.stringify(bootstrap.body));
  const parsedBootstrap = ledgerBootstrapResponseSchema.parse(bootstrap.body);
  assert.equal(parsedBootstrap.settlements?.length, 3);
  const personalReview = await request(
    ownerSession.access_token,
    "GET",
    "/settlement-review",
  );
  assert.equal(personalReview.status, 200, JSON.stringify(personalReview.body));
  const personalStatement = (
    personalReview.body as {
      statement: { paidMinor: number; shareMinor: number; balanceMinor: number };
    }
  ).statement;
  assert.deepEqual(
    [
      personalStatement.paidMinor,
      personalStatement.shareMinor,
      personalStatement.balanceMinor,
    ],
    [15_000, 9_500, 5_500],
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        assertions: 49,
        tripId,
        tripName: `Settlement Final Versions Acceptance ${tripId.slice(0, 8)}`,
        ownerUserId,
        ownerMemberId,
        memberUserId: memberSession.user.id,
        memberId,
        expenses: { e1Id, e2Id, e3Id, e4Id, successorId, e5Id },
        versions: settlements.data,
        digests: {
          v1: root.inputDigest,
          v2: v2Entity.inputDigest,
          v3: v3Entity.inputDigest,
        },
        personalPaymentId,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
