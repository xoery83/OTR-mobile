import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const projectRef = "tuqigdxrvrerfewsxqgm";
const tripId = "10000000-0000-4000-8000-000000009180";
const peerMemberId = "12000000-0000-4000-8000-000000009182";
const supabaseUrl = process.env.OTR_DEV_SUPABASE_URL;
const publishableKey = process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.OTR_DEV_SUPABASE_SECRET_KEY;
const apiUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
const email = process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL;
const password = process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD;
const peerEmail = process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL;
const peerPassword = process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD;

if (
  ![
    supabaseUrl,
    publishableKey,
    secretKey,
    apiUrl,
    email,
    password,
    peerEmail,
    peerPassword,
  ].every(Boolean)
)
  throw new Error("Hosted Dev compatibility environment is incomplete.");
if (new URL(supabaseUrl).hostname !== `${projectRef}.supabase.co`)
  throw new Error("Compatibility smoke may target only the approved Dev project.");
const backend = new URL(apiUrl);
if (backend.protocol !== "http:" || backend.port !== "8787" || backend.pathname !== "/")
  throw new Error("Compatibility smoke must use the existing LAN Dev Backend.");

const auth = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const service = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
async function signIn(identityEmail, identityPassword) {
  const result = await auth.auth.signInWithPassword({
    email: identityEmail,
    password: identityPassword,
  });
  if (result.error || !result.data.user || !result.data.session)
    throw new Error("Hosted Dev acceptance sign-in failed.");
  return { userId: result.data.user.id, token: result.data.session.access_token };
}
const signedIn = await signIn(email, password);
const peerSignedIn = await signIn(peerEmail, peerPassword);
const token = signedIn.token;

async function api(method, path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "Idempotency-Key": randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      `${method} ${path} failed (${response.status}/${value?.error?.code ?? "UNKNOWN"}).`,
    );
  return value;
}

const get = (path) => api("GET", path);
const post = (path, body) => api("POST", path, body);
const put = (path, body) => api("PUT", path, body);
const requireCheck = (condition, message) => {
  if (!condition) throw new Error(message);
};
const myJourney = (response) =>
  response.journeys.find((journey) => journey.journeyId === tripId);
const canonicalEditable = (expense, participation) => ({
  title: expense.title,
  description: expense.description,
  category: expense.category,
  occurredAt: expense.occurredAt,
  payerMemberId: expense.payerMemberId,
  original: expense.original,
  businessStatus: expense.businessStatus,
  settlementParticipation: participation,
  participants: expense.participants,
  splits: expense.splits,
  valuation: expense.valuation
    ? {
        policy: expense.valuation.policy,
        original: expense.valuation.original,
        settlement: expense.valuation.settlement,
        rateSnapshotId: expense.valuation.rateSnapshotId,
        paymentRecordId: expense.valuation.paymentRecordId,
        reason: expense.valuation.reason,
      }
    : null,
  baseRevision: expense.revision,
  auditReason: "Stage 9 settlement participation compatibility smoke",
});

const existingFixture = await service.from("trips").select("id").eq("id", tripId);
if (existingFixture.error) throw existingFixture.error;
requireCheck(existingFixture.data.length === 0, "Compatibility fixture already exists.");
const tripWrite = await service.from("trips").insert({
  id: tripId,
  name: "Stage 9 Settlement Participation Compatibility",
  destination: "Synthetic",
  start_date: "2026-09-14",
  end_date: "2026-09-15",
  created_by: signedIn.userId,
});
if (tripWrite.error) throw tripWrite.error;
const generatedOwner = await service
  .from("journey_members")
  .select("id")
  .eq("trip_id", tripId)
  .eq("user_id", signedIn.userId)
  .single();
if (generatedOwner.error) throw generatedOwner.error;
const ownerMemberId = generatedOwner.data.id;
const fixtureWrites = [
  await service.from("journey_members").upsert(
    {
      id: peerMemberId,
      trip_id: tripId,
      user_id: peerSignedIn.userId,
      display_name: "Stage 9 Compatibility Member",
      role: "group_member",
      status: "linked",
      linked_at: "2026-09-14T00:00:00Z",
    },
    { onConflict: "trip_id,user_id" },
  ),
  await service.from("ledger_settings").upsert({
    journey_id: tripId,
    settlement_currency: "NZD",
    settlement_scale: 2,
    valuation_policy: "REFERENCE_RATE",
  }),
];
for (const write of fixtureWrites) if (write.error) throw write.error;

const occurredAt = "2026-09-14T11:59:00.000Z";
const fixtureExpense = (title, settlementParticipation) => ({
  localId: randomUUID(),
  title,
  description: null,
  category: "food",
  occurredAt,
  payerMemberId: ownerMemberId,
  original: { minor: 200, currency: "NZD", scale: 2 },
  businessStatus: "ACCEPTED",
  ...(settlementParticipation ? { settlementParticipation } : {}),
  participants: [
    {
      memberId: ownerMemberId,
      displayNameSnapshot: "Stage 9 Compatibility Owner",
      householdIdSnapshot: null,
    },
    {
      memberId: peerMemberId,
      displayNameSnapshot: "Stage 9 Compatibility Member",
      householdIdSnapshot: null,
    },
  ],
  splits: [ownerMemberId, peerMemberId].map((memberId) => ({
    memberId,
    method: "EQUAL_PERSON",
    originalMinor: 100,
    settlementMinor: 100,
    weightUnits: null,
    percentageUnits: null,
    roundingAdjustmentMinor: 0,
  })),
  valuation: {
    policy: "SAME_CURRENCY",
    original: { minor: 200, currency: "NZD", scale: 2 },
    settlement: { minor: 200, currency: "NZD", scale: 2 },
    rateSnapshotId: null,
    paymentRecordId: null,
    reason: null,
  },
});
const historical = await post(
  `/v2/trips/${tripId}/expenses`,
  fixtureExpense("Stage 1-8 implicit participation fixture"),
);
requireCheck(
  historical.entity.settlementParticipation === "INCLUDED",
  "A create without participation did not default to INCLUDED.",
);
const rootPreview = await post(`/v2/trips/${tripId}/settlements/preview`, {
  throughTimestamp: "2026-09-14T12:00:00.000Z",
});
requireCheck(rootPreview.state === "PREVIEW_READY", "Root preview failed.");
await post(`/v2/trips/${tripId}/settlements`, {
  throughTimestamp: rootPreview.throughTimestamp,
  inputDigest: rootPreview.inputDigest,
});

const baseline = await get(`/v2/trips/${tripId}/ledger/bootstrap`);
requireCheck(
  baseline.expenses.length > 0,
  "The Stage 1-8 fixture has no historical Expense.",
);
requireCheck(
  baseline.expenses.every((expense) => expense.settlementParticipation === "INCLUDED"),
  "A historical Stage 1-8 Expense did not default to INCLUDED.",
);
const root = baseline.settlements.find((settlement) => settlement.kind === "ROOT");
requireCheck(root, "The Stage 7 root Settlement is missing.");
const cleanPreview = await post(
  `/v2/trips/${tripId}/settlements/${root.id}/adjustments/preview`,
  {},
);
requireCheck(cleanPreview.state === "PREVIEW_UNCHANGED", "Stage 7 fixture is not clean.");

const owner = baseline.members.find((member) => member.id === baseline.actor.memberId);
const peer = baseline.members.find((member) => member.id !== baseline.actor.memberId);
requireCheck(owner && peer, "Two Hosted Dev members are required.");
const marker = `Stage 9 participation ${randomUUID().slice(0, 8)}`;
const expenseInput = (title, settlementParticipation) =>
  fixtureExpense(title, settlementParticipation);

const beforeMyLedger = myJourney(await get("/v2/me/ledger?period=ALL"));
requireCheck(beforeMyLedger, "The test Journey is absent from My Ledger.");
const includedCreate = await post(
  `/v2/trips/${tripId}/expenses`,
  expenseInput(`${marker} included`),
);
const excludedCreate = await post(
  `/v2/trips/${tripId}/expenses`,
  expenseInput(`${marker} excluded`, "EXCLUDED"),
);
requireCheck(
  includedCreate.entity.settlementParticipation === "INCLUDED" &&
    excludedCreate.entity.settlementParticipation === "EXCLUDED",
  "Create/default participation contract failed.",
);

const afterCreate = await get(`/v2/trips/${tripId}/ledger/bootstrap`);
const included = afterCreate.expenses.find(
  (expense) => expense.id === includedCreate.entity.id,
);
let excluded = afterCreate.expenses.find(
  (expense) => expense.id === excludedCreate.entity.id,
);
requireCheck(included && excluded, "Bootstrap dropped a compatibility Expense.");
requireCheck(
  included.settlementParticipation === "INCLUDED" &&
    excluded.settlementParticipation === "EXCLUDED" &&
    included.participants.length === 2 &&
    excluded.participants.length === 2 &&
    included.splits.length === 2 &&
    excluded.splits.length === 2,
  "Bootstrap coerced participation or lost split evidence.",
);

const list = await get(
  `/v2/trips/${tripId}/expenses?query=${encodeURIComponent(marker)}&limit=10`,
);
requireCheck(list.expenses.length === 2, "Spending/search did not return both Expenses.");
const analysis = await get(
  `/v2/trips/${tripId}/ledger/analysis?scope=GROUP&dimension=CATEGORY&query=${encodeURIComponent(marker)}`,
);
requireCheck(
  analysis.summary.expenseCount === 2 && analysis.summary.totalMinor === 400,
  "Ordinary analysis did not include both Expenses.",
);
const afterMyLedger = myJourney(await get("/v2/me/ledger?period=ALL"));
requireCheck(
  afterMyLedger.mySpendMinor - beforeMyLedger.mySpendMinor === 200 &&
    afterMyLedger.paidMinor - beforeMyLedger.paidMinor === 200 &&
    afterMyLedger.positionMinor - beforeMyLedger.positionMinor === 100,
  "My Ledger spending/debt participation semantics are incorrect.",
);

const adjustment = await post(
  `/v2/trips/${tripId}/settlements/${root.id}/adjustments/preview`,
  {},
);
requireCheck(
  adjustment.state === "PREVIEW_READY" &&
    adjustment.changedExpenses.length === 1 &&
    adjustment.changedExpenses[0].expenseId === included.id &&
    adjustment.inputs.some((input) => input.expenseId === included.id) &&
    !adjustment.inputs.some((input) => input.expenseId === excluded.id) &&
    adjustment.exclusions.some(
      (item) =>
        item.expenseId === excluded.id && item.reason === "EXCLUDED_FROM_SETTLEMENT",
    ),
  "Settlement preview included EXCLUDED debt or lost INCLUDED debt.",
);
const finalized = await post(`/v2/trips/${tripId}/settlements/${root.id}/adjustments`, {
  expectedHeadId: adjustment.expectedHeadId,
  inputDigest: adjustment.inputDigest,
  reason: "Stage 9 settlement participation compatibility smoke",
  allowZeroTransfer: adjustment.zeroTransfer,
});
requireCheck(
  finalized.entity.inputs.some((input) => input.expenseId === included.id) &&
    !finalized.entity.inputs.some((input) => input.expenseId === excluded.id) &&
    finalized.entity.adjustmentDeltas.every(
      (item) =>
        item.deltaMinor ===
        adjustment.balances.find((balance) => balance.memberId === item.memberId)
          ?.deltaMinor,
    ),
  "Settlement finalization did not preserve the preview participation vector.",
);

excluded = (
  await put(
    `/v2/trips/${tripId}/expenses/${excluded.id}`,
    canonicalEditable(excluded, "INCLUDED"),
  )
).entity;
const togglePreview = await post(
  `/v2/trips/${tripId}/settlements/${root.id}/adjustments/preview`,
  {},
);
requireCheck(
  togglePreview.state === "PREVIEW_READY" &&
    togglePreview.changedExpenses.length === 1 &&
    togglePreview.changedExpenses[0].expenseId === excluded.id &&
    togglePreview.inputs.some((input) => input.expenseId === excluded.id) &&
    togglePreview.balances.some((balance) => balance.deltaMinor !== 0),
  "Participation change did not create the exact Adjustment input/delta.",
);
excluded = (
  await put(
    `/v2/trips/${tripId}/expenses/${excluded.id}`,
    canonicalEditable(excluded, "EXCLUDED"),
  )
).entity;
const revertedPreview = await post(
  `/v2/trips/${tripId}/settlements/${root.id}/adjustments/preview`,
  {},
);
requireCheck(
  revertedPreview.state === "PREVIEW_UNCHANGED" &&
    revertedPreview.exclusions.some(
      (item) =>
        item.expenseId === excluded.id && item.reason === "EXCLUDED_FROM_SETTLEMENT",
    ),
  "Reverted EXCLUDED Expense still contaminated Adjustment input.",
);

let cursor = afterCreate.cursor;
let pulledExcluded = false;
for (let page = 0; page < 100; page += 1) {
  const changes = await get(
    `/v2/trips/${tripId}/ledger/changes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  pulledExcluded ||= changes.changes.some(
    (change) =>
      change.entityId === excluded.id &&
      change.aggregate?.settlementParticipation === "EXCLUDED",
  );
  cursor = changes.cursor;
  if (!changes.hasMore) break;
}
requireCheck(pulledExcluded, "Incremental pull dropped or coerced EXCLUDED.");

console.log(
  JSON.stringify({
    status: "ok",
    target: "approved-hosted-dev",
    historicalDefaultIncluded: true,
    createReadWrite: true,
    bootstrap: true,
    pull: true,
    spendingAndAnalysis: true,
    settlementPreview: true,
    settlementFinalization: true,
    participationAdjustment: true,
    includedUnchanged: true,
    excludedRestored: true,
  }),
);
