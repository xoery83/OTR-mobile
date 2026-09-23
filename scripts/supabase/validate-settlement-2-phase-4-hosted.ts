import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.OTR_DEV_SUPABASE_URL!;
const apiUrl = "https://api-dev.xoery.art";
assert.equal(new URL(supabaseUrl).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
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
};
const tripId = randomUUID();
const memberId = randomUUID();

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
  idempotencyKey?: string,
) {
  const response = await fetch(`${apiUrl}/v2/trips/${tripId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Review-Protocol": "2",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function expense(localId: string, ownerMemberId: string, amount: number) {
  const original = { minor: amount, currency: "NZD", scale: 2 };
  return {
    localId,
    title: amount === 2_000 ? "Phase 4 immutable hotel" : "Phase 4 corrected hotel",
    description: null,
    category: "hotel",
    occurredAt: "2026-09-23T12:00:00+12:00",
    payerMemberId: ownerMemberId,
    original,
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    participants: [
      {
        memberId: ownerMemberId,
        displayNameSnapshot: "Phase 4 Owner",
        householdIdSnapshot: null,
      },
      {
        memberId,
        displayNameSnapshot: "Phase 4 Member",
        householdIdSnapshot: null,
      },
    ],
    splits: [ownerMemberId, memberId].map((participantId) => ({
      memberId: participantId,
      method: "EXACT",
      originalMinor: amount / 2,
      settlementMinor: amount / 2,
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

async function count(table: string) {
  const result = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("journey_id", tripId);
  if (result.error) throw result.error;
  return result.count;
}

async function main() {
  const inserted = await admin.from("trips").insert({
    id: tripId,
    name: `Settlement 2 Phase 4 ${tripId.slice(0, 8)}`,
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
  const added = await admin.from("journey_members").insert({
    id: memberId,
    trip_id: tripId,
    user_id: users.member,
    display_name: "Phase 4 Member",
    role: "group_member",
    status: "linked",
    linked_at: new Date().toISOString(),
  });
  if (added.error) throw added.error;
  const settings = await admin.from("ledger_settings").insert({
    journey_id: tripId,
    settlement_currency: "NZD",
    settlement_scale: 2,
    valuation_policy: "REFERENCE_RATE",
    updated_by: users.owner,
  });
  if (settings.error) throw settings.error;

  const ownerToken = await token("owner");
  const memberToken = await token("member");
  const sourceInput = expense(randomUUID(), owner.data.id, 2_000);
  const created = await request(
    ownerToken,
    "POST",
    "/expenses",
    sourceInput,
    randomUUID(),
  );
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const sourceId = (created.body as { entity: { id: string } }).entity.id;
  const rootPreview = await request(ownerToken, "POST", "/settlements/preview", {
    throughTimestamp: "2026-09-23T23:59:59+12:00",
  });
  assert.equal(rootPreview.status, 200, JSON.stringify(rootPreview.body));
  const rootInput = rootPreview.body as {
    throughTimestamp: string;
    inputDigest: string;
  };
  const finalized = await request(
    ownerToken,
    "POST",
    "/settlements",
    rootInput,
    randomUUID(),
  );
  assert.equal(finalized.status, 201, JSON.stringify(finalized.body));
  const root = (finalized.body as { entity: { id: string; inputDigest: string } }).entity;

  const findingId = randomUUID();
  const finding = await request(
    memberToken,
    "POST",
    "/review-findings",
    {
      id: findingId,
      targetType: "EXPENSE",
      expenseId: sourceId,
      sourceRevision: 1,
      note: "The finalized amount is wrong",
      operationId: findingId,
    },
    findingId,
  );
  assert.equal(finding.status, 201, JSON.stringify(finding.body));

  const successorId = randomUUID();
  const correction = {
    sourceExpenseId: sourceId,
    successor: expense(successorId, owner.data.id, 2_600),
    reason: "Correct the finalized hotel amount",
  };
  const denied = await request(
    memberToken,
    "POST",
    `/settlements/${root.id}/corrections`,
    correction,
  );
  assert.equal(denied.status, 403);
  const preview = await request(
    ownerToken,
    "POST",
    `/settlements/${root.id}/corrections`,
    correction,
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const previewBody = preview.body as {
    state: string;
    expectedHeadId: string | null;
    inputDigest: string;
    zeroTransfer: boolean;
    sourceExpenseId: string;
    successorExpenseId: string;
    balances: { deltaMinor: number }[];
  };
  assert.equal(previewBody.state, "PREVIEW_READY");
  assert.equal(previewBody.sourceExpenseId, sourceId);
  assert.equal(previewBody.successorExpenseId, successorId);
  assert.ok(previewBody.balances.some((balance) => balance.deltaMinor !== 0));
  const confirmation = {
    ...correction,
    expectedHeadId: previewBody.expectedHeadId,
    inputDigest: previewBody.inputDigest,
    allowZeroTransfer: previewBody.zeroTransfer,
  };
  const key = randomUUID();
  const confirmed = await request(
    ownerToken,
    "POST",
    `/settlements/${root.id}/corrections/confirm`,
    confirmation,
    key,
  );
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
  const confirmedBody = confirmed.body as {
    entity: {
      id: string;
      correctionSourceExpenseId: string;
      correctionSuccessorExpenseId: string;
    };
    successorExpenseId: string;
    idempotentReplay: boolean;
  };
  assert.equal(confirmedBody.successorExpenseId, successorId);
  assert.equal(confirmedBody.entity.correctionSourceExpenseId, sourceId);
  assert.equal(confirmedBody.entity.correctionSuccessorExpenseId, successorId);
  assert.equal(confirmedBody.idempotentReplay, false);
  const replay = await request(
    ownerToken,
    "POST",
    `/settlements/${root.id}/corrections/confirm`,
    confirmation,
    key,
  );
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal((replay.body as { idempotentReplay: boolean }).idempotentReplay, true);

  const [source, successor, link, rootAfter, findingAfter, sourceProjection] =
    await Promise.all([
      admin.from("expenses").select("id,original_minor").eq("id", sourceId).single(),
      admin.from("expenses").select("id,original_minor").eq("id", successorId).single(),
      admin
        .from("expense_correction_successors")
        .select("source_expense_id,successor_expense_id,correction_settlement_id")
        .eq("source_expense_id", sourceId)
        .single(),
      admin.from("ledger_settlements").select("input_digest").eq("id", root.id).single(),
      admin
        .from("ledger_review_findings")
        .select("lifecycle,resolution_context")
        .eq("id", findingId)
        .single(),
      admin.rpc("ledger_adjustment_source_7_2b", { target_root: root.id }),
    ]);
  for (const result of [
    source,
    successor,
    link,
    rootAfter,
    findingAfter,
    sourceProjection,
  ])
    if (result.error) throw result.error;
  assert.ok(source.data);
  assert.ok(successor.data);
  assert.ok(link.data);
  assert.ok(rootAfter.data);
  assert.ok(findingAfter.data);
  assert.equal(source.data.original_minor, 2_000);
  assert.equal(successor.data.original_minor, 2_600);
  assert.equal(link.data.successor_expense_id, successorId);
  assert.equal(link.data.correction_settlement_id, confirmedBody.entity.id);
  assert.equal(rootAfter.data.input_digest, root.inputDigest);
  assert.equal(findingAfter.data.lifecycle, "RESOLVED");
  assert.equal(findingAfter.data.resolution_context.successorExpenseId, successorId);
  assert.ok(
    sourceProjection.data.some((item: { id: string }) => item.id === successorId) &&
      !sourceProjection.data.some((item: { id: string }) => item.id === sourceId),
  );
  assert.equal(await count("settlement_payments"), 0);
  assert.equal(await count("personal_settlement_payment_records"), 0);
  assert.equal(await count("ledger_settlement_review_checkpoints"), 0);

  console.log(
    JSON.stringify({ status: "ok", assertions: 25, tripId, sourceId, successorId }),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
