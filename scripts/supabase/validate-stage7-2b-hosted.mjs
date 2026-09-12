import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const env = process.env;
const supabaseUrl = env.OTR_DEV_SUPABASE_URL;
const publishableKey = env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY;
const secretKey = env.OTR_DEV_SUPABASE_SECRET_KEY;
const apiUrl = env.EXPO_PUBLIC_OTR_API_BASE_URL;
const ownerEmail = env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL;
const ownerPassword = env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD;
const memberEmail = env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL;
const memberPassword = env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD;
for (const value of [
  supabaseUrl,
  publishableKey,
  secretKey,
  apiUrl,
  ownerEmail,
  ownerPassword,
  memberEmail,
  memberPassword,
]) {
  if (!value)
    throw new Error("Stage 7.2B Hosted Dev acceptance environment is incomplete.");
}
if (!supabaseUrl.includes("tuqigdxrvrerfewsxqgm.supabase.co"))
  throw new Error("Stage 7.2B acceptance may target only the approved Dev project.");

const tripId = "10000000-0000-4000-8000-000000007210";
let ownerMemberId = "12000000-0000-4000-8000-000000007211";
const memberMemberId = "12000000-0000-4000-8000-000000007212";
const cutoff = "2026-09-13T12:00:00.000Z";
const service = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const auth = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function signIn(email, password) {
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session)
    throw error ?? new Error("Dev sign-in failed.");
  return { token: data.session.access_token, userId: data.user.id };
}

async function api(token, path, body, idempotencyKey) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  return { status: response.status, value };
}

function requireStatus(result, status, label) {
  if (result.status !== status)
    throw new Error(
      `${label}: expected ${status}, received ${result.status} ${JSON.stringify(result.value)}`,
    );
  return result.value;
}

function expense(payerMemberId, minor, title) {
  return {
    localId: randomUUID(),
    title,
    description: null,
    category: "food",
    occurredAt: "2026-09-13T10:00:00.000Z",
    payerMemberId,
    original: { minor, currency: "NZD", scale: 2 },
    businessStatus: "ACCEPTED",
    participants: [
      {
        memberId: ownerMemberId,
        displayNameSnapshot: "Stage 7.2B Owner",
        householdIdSnapshot: null,
      },
      {
        memberId: memberMemberId,
        displayNameSnapshot: "Stage 7.2B Member",
        householdIdSnapshot: null,
      },
    ],
    splits: [ownerMemberId, memberMemberId].map((memberId) => ({
      memberId,
      method: "EQUAL_PERSON",
      originalMinor: minor / 2,
      settlementMinor: minor / 2,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    })),
    valuation: {
      policy: "SAME_CURRENCY",
      original: { minor, currency: "NZD", scale: 2 },
      settlement: { minor, currency: "NZD", scale: 2 },
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
  };
}

async function createExpense(token, payerMemberId, minor, title) {
  return requireStatus(
    await api(
      token,
      `/v2/trips/${tripId}/expenses`,
      expense(payerMemberId, minor, title),
      randomUUID(),
    ),
    201,
    `create ${title}`,
  ).entity;
}

async function previewAdjustment(token, rootId) {
  return requireStatus(
    await api(token, `/v2/trips/${tripId}/settlements/${rootId}/adjustments/preview`, {}),
    200,
    "preview Adjustment",
  );
}

async function finalizeAdjustment(token, rootId, preview, reason, key = randomUUID()) {
  return api(
    token,
    `/v2/trips/${tripId}/settlements/${rootId}/adjustments`,
    {
      expectedHeadId: preview.expectedHeadId,
      inputDigest: preview.inputDigest,
      reason,
      allowZeroTransfer: preview.zeroTransfer,
    },
    key,
  );
}

const owner = await signIn(ownerEmail, ownerPassword);
const member = await signIn(memberEmail, memberPassword);
const existing = await service
  .from("settlements")
  .select("id")
  .eq("journey_id", tripId)
  .limit(1);
if (existing.error) throw existing.error;

if (!existing.data.length) {
  const tripWrite = await service.from("trips").upsert({
    id: tripId,
    name: "Stage 7.2B Acceptance",
    destination: "Synthetic",
    start_date: "2026-09-13",
    end_date: "2026-09-14",
    created_by: owner.userId,
  });
  if (tripWrite.error) throw tripWrite.error;
  const generatedOwner = await service
    .from("journey_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", owner.userId)
    .single();
  if (generatedOwner.error) throw generatedOwner.error;
  ownerMemberId = generatedOwner.data.id;
  const writes = [
    await service.from("journey_members").upsert(
      [
        {
          id: ownerMemberId,
          trip_id: tripId,
          user_id: owner.userId,
          display_name: "Stage 7.2B Owner",
          role: "owner",
          status: "linked",
          linked_at: "2026-09-13T00:00:00Z",
        },
        {
          id: memberMemberId,
          trip_id: tripId,
          user_id: member.userId,
          display_name: "Stage 7.2B Member",
          role: "group_member",
          status: "linked",
          linked_at: "2026-09-13T00:00:00Z",
        },
      ],
      { onConflict: "trip_id,user_id" },
    ),
    await service.from("ledger_settings").upsert({
      journey_id: tripId,
      settlement_currency: "NZD",
      settlement_scale: 2,
      valuation_policy: "REFERENCE_RATE",
    }),
  ];
  for (const write of writes) if (write.error) throw write.error;

  const rootPreview = requireStatus(
    await api(owner.token, `/v2/trips/${tripId}/settlements/preview`, {
      throughTimestamp: cutoff,
    }),
    200,
    "root preview",
  );
  const root = requireStatus(
    await api(
      owner.token,
      `/v2/trips/${tripId}/settlements`,
      { throughTimestamp: cutoff, inputDigest: rootPreview.inputDigest },
      randomUUID(),
    ),
    201,
    "root finalize",
  ).entity;

  await createExpense(owner.token, ownerMemberId, 10_000, "Owner paid 100");
  const firstPreview = await previewAdjustment(member.token, root.id);
  if (firstPreview.state !== "PREVIEW_READY" || firstPreview.transfers.length !== 1)
    throw new Error("Reader did not receive the expected first Adjustment preview.");
  const forbidden = await finalizeAdjustment(
    member.token,
    root.id,
    firstPreview,
    "Member must not finalize",
  );
  if (forbidden.status !== 403)
    throw new Error("Member Adjustment finalize was not forbidden.");

  const firstKey = randomUUID();
  const first = requireStatus(
    await finalizeAdjustment(
      owner.token,
      root.id,
      firstPreview,
      "Owner expense added",
      firstKey,
    ),
    201,
    "first Adjustment",
  ).entity;
  requireStatus(
    await finalizeAdjustment(
      owner.token,
      root.id,
      firstPreview,
      "Owner expense added",
      firstKey,
    ),
    200,
    "first Adjustment replay",
  );

  const firstTransfer = first.transfers[0];
  const paid = requireStatus(
    await api(
      member.token,
      `/v2/trips/${tripId}/transfers/${firstTransfer.id}/payments`,
      {
        localId: randomUUID(),
        baseTransferRevision: firstTransfer.revision,
        payment: { minor: 1_000, currency: "NZD", scale: 2 },
        assertedDischarge: { minor: 1_000, currency: "NZD", scale: 2 },
        repaymentValuation: null,
        feeTreatment: null,
        paidAt: "2026-09-13T10:30:00.000Z",
        evidenceAssetId: null,
        notes: null,
        reportingAuthority: "PAYER",
        reason: null,
      },
      randomUUID(),
    ),
    201,
    "Paid",
  );
  requireStatus(
    await api(
      owner.token,
      `/v2/trips/${tripId}/transfer-payments/${paid.paymentId}/confirm`,
      { basePaymentRevision: 1, authority: "RECIPIENT", reason: null },
      randomUUID(),
    ),
    200,
    "Received",
  );
  const afterPayment = await previewAdjustment(owner.token, root.id);
  if (afterPayment.state !== "PREVIEW_UNCHANGED")
    throw new Error("Payment/Discharge entered the Adjustment digest.");

  await createExpense(member.token, memberMemberId, 6_000, "Member paid 60");
  const secondPreview = await previewAdjustment(owner.token, root.id);
  const concurrent = await Promise.all([
    finalizeAdjustment(owner.token, root.id, secondPreview, "Concurrent A"),
    finalizeAdjustment(owner.token, root.id, secondPreview, "Concurrent B"),
  ]);
  if (
    concurrent.filter(({ status }) => status === 201).length !== 1 ||
    concurrent.filter(({ status }) => status === 409).length !== 1
  )
    throw new Error(
      `Concurrent finalize did not produce one successor and one stale result: ${concurrent.map(({ status }) => status)}`,
    );

  await Promise.all([
    createExpense(owner.token, ownerMemberId, 4_000, "Zero delta owner"),
    createExpense(member.token, memberMemberId, 4_000, "Zero delta member"),
  ]);
  const zeroPreview = await previewAdjustment(owner.token, root.id);
  if (zeroPreview.state !== "PREVIEW_READY" || !zeroPreview.zeroTransfer)
    throw new Error("Changed zero-delta input did not produce a zero-transfer preview.");
  requireStatus(
    await finalizeAdjustment(
      owner.token,
      root.id,
      zeroPreview,
      "Balanced evidence change",
    ),
    201,
    "zero-transfer Adjustment",
  );
}

const [ownerRead, memberRead] = await Promise.all([
  api(owner.token, `/v2/trips/${tripId}/ledger/bootstrap`),
  api(member.token, `/v2/trips/${tripId}/ledger/bootstrap`),
]);
const ownerBootstrap = requireStatus(ownerRead, 200, "owner bootstrap");
const memberBootstrap = requireStatus(memberRead, 200, "member bootstrap");
if (
  JSON.stringify(ownerBootstrap.settlements) !==
  JSON.stringify(memberBootstrap.settlements)
)
  throw new Error("Two authenticated clients did not converge on Settlement lineage.");
const root = ownerBootstrap.settlements.find((settlement) => settlement.kind === "ROOT");
const adjustments = ownerBootstrap.settlements.filter(
  (settlement) => settlement.kind === "ADJUSTMENT",
);
if (!root || root.adjustmentState !== "CURRENT" || adjustments.length !== 3)
  throw new Error("Final canonical Adjustment lineage is incomplete.");
if (adjustments.flatMap(({ transfers }) => transfers).length !== 2)
  throw new Error("Opposing historical Transfers were not retained independently.");
if (
  root.outstandingBalances.reduce((sum, balance) => sum + balance.amount.minor, 0) !== 0
)
  throw new Error("Outstanding lineage vector does not net to zero.");

console.log(
  JSON.stringify(
    {
      status: "ok",
      tripId,
      clients: 2,
      adjustmentCount: adjustments.length,
      transferCount: adjustments.flatMap(({ transfers }) => transfers).length,
      paymentCount: adjustments.flatMap(({ transfers }) =>
        transfers.flatMap(({ payments }) => payments),
      ).length,
      readiness: root.adjustmentState,
      outstanding: root.outstandingBalances.map(({ memberId, amount }) => ({
        memberId,
        minor: amount.minor,
      })),
    },
    null,
    2,
  ),
);
