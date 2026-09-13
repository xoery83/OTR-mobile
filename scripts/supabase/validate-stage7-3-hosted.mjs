import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const env = process.env;
const tripId = "10000000-0000-4000-8000-000000007210";
const required = [
  env.OTR_DEV_SUPABASE_URL,
  env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
  env.EXPO_PUBLIC_OTR_API_BASE_URL,
  env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL,
  env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD,
  env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL,
  env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD,
];
if (required.some((value) => !value))
  throw new Error("Stage 7.3 Hosted Dev acceptance environment is incomplete.");
if (!env.OTR_DEV_SUPABASE_URL.includes("tuqigdxrvrerfewsxqgm.supabase.co"))
  throw new Error("Stage 7.3 acceptance may target only the approved Dev project.");

const auth = createClient(
  env.OTR_DEV_SUPABASE_URL,
  env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function signIn(email, password) {
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("Dev sign-in failed.");
  const bootstrap = await api(
    data.session.access_token,
    `/v2/trips/${tripId}/ledger/bootstrap`,
  );
  return {
    token: data.session.access_token,
    memberId: bootstrap.actor.memberId,
  };
}

async function api(token, path, body) {
  const response = await fetch(`${env.EXPO_PUBLIC_OTR_API_BASE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(body === undefined ? {} : { "Idempotency-Key": randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}

const owner = await signIn(
  env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL,
  env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD,
);
const member = await signIn(
  env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL,
  env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD,
);
const identities = new Map([
  [owner.memberId, owner],
  [member.memberId, member],
]);
let bootstrap = await api(owner.token, `/v2/trips/${tripId}/ledger/bootstrap`);
let createdAdjustmentId = null;
const physicalContent = env.STAGE73_PHYSICAL_CONTENT === "1";
if (env.STAGE73_CREATE_ZERO_ADJUSTMENT === "1" || physicalContent) {
  const root = bootstrap.settlements.find((row) => row.kind === "ROOT");
  if (!root) throw new Error("Stage 7.3 root Settlement is missing.");
  const minor = physicalContent ? 300 : 200;
  const ownerName = physicalContent
    ? "张伟（超长姓名用于真机分页与动态字体测试）🚀🧾"
    : "Stage 7.2B Owner";
  if (physicalContent) {
    if (!env.OTR_DEV_SUPABASE_SECRET_KEY)
      throw new Error("Physical acceptance requires the Dev service key.");
    const service = createClient(
      env.OTR_DEV_SUPABASE_URL,
      env.OTR_DEV_SUPABASE_SECRET_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const renamed = await service
      .from("journey_members")
      .update({ display_name: ownerName })
      .eq("trip_id", tripId)
      .eq("id", owner.memberId);
    if (renamed.error) throw renamed.error;
  }
  await api(owner.token, `/v2/trips/${tripId}/expenses`, {
    localId: randomUUID(),
    title: `Stage 7.3 history invalidation ${new Date().toISOString()}`,
    description: null,
    category: "food",
    occurredAt: "2026-09-13T11:00:00.000Z",
    payerMemberId: owner.memberId,
    original: { minor, currency: "NZD", scale: 2 },
    businessStatus: "ACCEPTED",
    participants: [
      {
        memberId: owner.memberId,
        displayNameSnapshot: ownerName,
        householdIdSnapshot: null,
      },
    ],
    splits: [
      {
        memberId: owner.memberId,
        method: "EQUAL_PERSON",
        originalMinor: minor,
        settlementMinor: minor,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: {
      policy: "SAME_CURRENCY",
      original: { minor, currency: "NZD", scale: 2 },
      settlement: { minor, currency: "NZD", scale: 2 },
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
  });
  const preview = await api(
    owner.token,
    `/v2/trips/${tripId}/settlements/${root.id}/adjustments/preview`,
    {},
  );
  if (preview.state !== "PREVIEW_READY" || !preview.zeroTransfer)
    throw new Error("History invalidation did not produce a zero-transfer Adjustment.");
  const created = await api(
    owner.token,
    `/v2/trips/${tripId}/settlements/${root.id}/adjustments`,
    {
      expectedHeadId: preview.expectedHeadId,
      inputDigest: preview.inputDigest,
      reason: physicalContent
        ? "=1+1 真机公式防护、中文、超长文本、emoji 🚀🧾✅"
        : "Stage 7.3 export history invalidation",
      allowZeroTransfer: true,
    },
  );
  createdAdjustmentId = created.entity.id;
  bootstrap = await api(owner.token, `/v2/trips/${tripId}/ledger/bootstrap`);
}
let completed = 0;
for (const transfer of bootstrap.settlements.flatMap((row) => row.transfers)) {
  if (transfer.confirmedRemaining.minor === 0) continue;
  const payer = identities.get(transfer.fromMemberId);
  const recipient = identities.get(transfer.toMemberId);
  if (!payer || !recipient)
    throw new Error("Acceptance transfer does not belong to the two test identities.");
  const paid = await api(
    payer.token,
    `/v2/trips/${tripId}/transfers/${transfer.id}/payments`,
    {
      localId: randomUUID(),
      baseTransferRevision: transfer.revision,
      payment: transfer.confirmedRemaining,
      assertedDischarge: transfer.confirmedRemaining,
      repaymentValuation: null,
      feeTreatment: null,
      paidAt: new Date().toISOString(),
      evidenceAssetId: null,
      notes: null,
      reportingAuthority: "PAYER",
      reason: null,
    },
  );
  await api(
    recipient.token,
    `/v2/trips/${tripId}/transfer-payments/${paid.paymentId}/confirm`,
    { basePaymentRevision: 1, authority: "RECIPIENT", reason: null },
  );
  completed += 1;
}

bootstrap = await api(owner.token, `/v2/trips/${tripId}/ledger/bootstrap`);
const transfers = bootstrap.settlements.flatMap((row) => row.transfers);
if (
  transfers.some(
    (transfer) =>
      transfer.status !== "SETTLED" ||
      transfer.confirmedRemaining.minor !== 0 ||
      transfer.awaitingAmount.minor !== 0,
  )
) {
  throw new Error("Stage 7.3 acceptance lineage is not fully settled.");
}
console.log(
  JSON.stringify({
    journeyId: tripId,
    identities: identities.size,
    completedTransfers: completed,
    settlements: bootstrap.settlements.length,
    transfers: transfers.length,
    fullySettled: true,
    createdAdjustmentId,
    physicalContent,
  }),
);
