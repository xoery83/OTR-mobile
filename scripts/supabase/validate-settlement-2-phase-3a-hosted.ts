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
const otherTripId = randomUUID();
const members = { owner: "", member: randomUUID(), guest: randomUUID() };

async function token(role: keyof typeof users) {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: `${role === "owner" ? "owner" : role === "member" ? "member" : "guest"}@otr.invalid`,
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
  journeyId = tripId,
) {
  const response = await fetch(`${apiUrl}/v2/trips/${journeyId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Review-Protocol": "2",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function expense(title: string) {
  const money = { minor: 2_000, currency: "NZD", scale: 2 };
  return {
    localId: randomUUID(),
    title,
    description: null,
    category: "food",
    occurredAt: "2026-09-23T12:00:00+12:00",
    payerMemberId: members.owner,
    original: money,
    businessStatus: "ACCEPTED",
    participants: [members.owner, members.member, members.guest].map((memberId) => ({
      memberId,
      displayNameSnapshot:
        memberId === members.owner
          ? "Phase 3A Owner"
          : memberId === members.member
            ? "Phase 3A Member"
            : "Phase 3A Guest",
      householdIdSnapshot: null,
    })),
    splits: [
      {
        memberId: members.owner,
        method: "EXACT",
        originalMinor: 1_000,
        settlementMinor: 1_000,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
      {
        memberId: members.member,
        method: "EXACT",
        originalMinor: 1_000,
        settlementMinor: 1_000,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
      {
        memberId: members.guest,
        method: "EXACT",
        originalMinor: 0,
        settlementMinor: 0,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
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

async function setupTrip(id: string, createdBy: string) {
  const trip = await admin.from("trips").insert({
    id,
    name: `Settlement 2 Phase 3A ${id.slice(0, 8)}`,
    created_by: createdBy,
  });
  if (trip.error) throw trip.error;
}

async function main() {
  await setupTrip(tripId, users.owner);
  await setupTrip(otherTripId, users.member);
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
      display_name: "Phase 3A Member",
      role: "group_member",
      status: "linked",
      linked_at: new Date().toISOString(),
    },
    {
      id: members.guest,
      trip_id: tripId,
      user_id: users.guest,
      display_name: "Phase 3A Guest",
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
  const input = expense(`Phase 3A ${randomUUID().slice(0, 8)}`);
  const created = await request(tokens.owner, "POST", "/expenses", input, randomUUID());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const expenseId = (created.body as { entity: { id: string } }).entity.id;

  const findingId = randomUUID();
  const raise = {
    id: findingId,
    targetType: "EXPENSE_SHARE",
    expenseId,
    targetMemberId: members.member,
    sourceRevision: 1,
    note: "Please check my exact share",
    operationId: findingId,
  };
  const raised = await request(
    tokens.member,
    "POST",
    "/review-findings",
    raise,
    findingId,
  );
  assert.equal(raised.status, 201, JSON.stringify(raised.body));
  const replay = await request(
    tokens.member,
    "POST",
    "/review-findings",
    raise,
    findingId,
  );
  assert.equal(replay.status, 200);
  assert.equal((replay.body as { idempotentReplay: boolean }).idempotentReplay, true);

  const views = await Promise.all(
    (["owner", "member", "guest"] as const).map((role) =>
      request(tokens[role], "GET", "/ledger/review"),
    ),
  );
  for (const view of views) assert.equal(view.status, 200);
  const visible = (view: (typeof views)[number]) =>
    (view.body as { findings: Record<string, unknown>[] }).findings.find(
      (item) => item.id === findingId,
    );
  assert.ok(visible(views[0]));
  const memberFinding = visible(views[1]) as {
    origin: string;
    authorUserId: string;
    targetType: string;
    targetMemberId: string;
    targetSourceRevision: number;
    lifecycle: string;
    revision: number;
    decisionRevision: number;
  };
  assert.equal(memberFinding.origin, "HUMAN");
  assert.equal(memberFinding.authorUserId, users.member);
  assert.equal(memberFinding.targetType, "EXPENSE_SHARE");
  assert.equal(memberFinding.targetMemberId, members.member);
  assert.equal(memberFinding.targetSourceRevision, 1);
  assert.equal(memberFinding.lifecycle, "ACTIVE");
  assert.equal(visible(views[2]), undefined);

  const wrongJourney = await request(
    tokens.member,
    "POST",
    "/review-findings",
    { ...raise, id: randomUUID(), operationId: randomUUID() },
    randomUUID(),
    otherTripId,
  );
  assert.equal(wrongJourney.status, 409);
  const crossJourneyId = randomUUID();
  const crossJourney = await request(
    tokens.member,
    "POST",
    "/review-findings",
    { ...raise, id: crossJourneyId, operationId: crossJourneyId },
    crossJourneyId,
    otherTripId,
  );
  assert.equal(crossJourney.status, 404);

  const actionId = randomUUID();
  const acted = await request(
    tokens.member,
    "POST",
    `/review-findings/${findingId}/actions`,
    {
      action: "ACKNOWLEDGED",
      baseRevision: memberFinding.revision,
      decisionRevision: memberFinding.decisionRevision,
      operationId: actionId,
    },
    actionId,
  );
  assert.equal(acted.status, 200, JSON.stringify(acted.body));
  await request(tokens.owner, "POST", "/ledger/review/refresh", {});
  const acknowledged = await request(tokens.member, "GET", "/ledger/review");
  const afterAction = visible(acknowledged) as {
    lifecycle: string;
    personalDecision: string;
  };
  assert.equal(afterAction.lifecycle, "ACTIVE");
  assert.equal(afterAction.personalDecision, "ACKNOWLEDGED");

  const { localId: _localId, ...update } = input;
  const updated = await request(
    tokens.owner,
    "PUT",
    `/expenses/${expenseId}`,
    {
      ...update,
      description: "Source revision correction",
      baseRevision: 1,
      auditReason: "Phase 3A source revision acceptance",
    },
    randomUUID(),
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const resolved = visible(await request(tokens.member, "GET", "/ledger/review")) as {
    lifecycle: string;
    resolutionReason: string;
  };
  assert.equal(resolved.lifecycle, "RESOLVED_BY_EXPENSE_UPDATE");
  assert.equal(resolved.resolutionReason, "SOURCE_REVISION_CHANGED");

  console.log(
    JSON.stringify({
      assertions: 19,
      twoAccounts: true,
      unrelatedHidden: true,
      idempotentReplay: true,
      crossJourneyRejected: true,
      acknowledgeDoesNotResolve: true,
      systemRefreshPreservesHuman: true,
      sourceRevisionResolves: true,
      productionAccessed: false,
      retainedQaJourney: tripId,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
