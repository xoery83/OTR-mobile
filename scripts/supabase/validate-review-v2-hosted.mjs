import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.OTR_DEV_SUPABASE_URL;
const apiUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
assert.equal(new URL(supabaseUrl).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
assert.equal(new URL(apiUrl).hostname, "api-dev.xoery.art");
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  supabaseUrl,
  process.env.OTR_DEV_SUPABASE_SECRET_KEY,
  authOptions,
);
const publicAuth = createClient(
  supabaseUrl,
  process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
  authOptions,
);
const trip = "10000000-0000-4000-8000-000000000001";
const ownerMember = "12000000-0000-4000-8000-000000000001";
const memberMember = "12000000-0000-4000-8000-000000000002";
const guestMember = "12000000-0000-4000-8000-000000000003";

async function session(role) {
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

async function api(token, method, path, body, key, protocol = true) {
  const response = await fetch(`${apiUrl}/v2/trips/${trip}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(protocol ? { "X-Review-Protocol": "2" } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function status(result, expected, label) {
  assert.equal(result.status, expected, `${label}: ${JSON.stringify(result.body)}`);
  return result.body;
}

function expense(title) {
  const money = { minor: 2000, currency: "NZD", scale: 2 };
  return {
    localId: randomUUID(),
    title,
    description: null,
    category: "food",
    occurredAt: new Date().toISOString(),
    payerMemberId: memberMember,
    original: money,
    businessStatus: "ACCEPTED",
    participants: [ownerMember, memberMember, guestMember].map((memberId) => ({
      memberId,
      displayNameSnapshot:
        memberId === ownerMember
          ? "Owner"
          : memberId === memberMember
            ? "Member"
            : "Guest",
      householdIdSnapshot: null,
    })),
    splits: [ownerMember, memberMember, guestMember].map((memberId) => ({
      memberId,
      method: "EXACT",
      originalMinor: memberId === guestMember ? 0 : 1000,
      settlementMinor: memberId === guestMember ? 0 : 1000,
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

const [owner, member, guest] = await Promise.all(
  ["owner", "member", "guest"].map(session),
);
const path = "/ledger/review";
const initial = [
  status(await api(owner, "GET", path), 200, "owner read"),
  status(await api(member, "GET", path), 200, "member read"),
  status(await api(guest, "GET", path), 200, "guest read"),
];
for (const projection of initial) assert.equal(projection.reviewProtocol, 2);
status(
  await api(owner, "GET", path, undefined, undefined, false),
  426,
  "old Review gate",
);
const oldBootstrap = status(
  await api(owner, "GET", "/ledger/bootstrap", undefined, undefined, false),
  200,
  "old bootstrap",
);
assert.ok(!("reviewFindings" in oldBootstrap));
assert.ok(!("reviewActions" in oldBootstrap));

const title = `Review 2.0 acceptance ${randomUUID().slice(0, 8)}`;
const created = [];
for (let i = 0; i < 2; i++) {
  const result = status(
    await api(owner, "POST", "/expenses", expense(title), randomUUID()),
    201,
    `create duplicate ${i + 1}`,
  );
  created.push(result.entity?.id ?? result.entity?.serverId ?? result.serverId);
}
const refreshed = status(
  await api(owner, "POST", "/ledger/review/refresh", {}),
  200,
  "refresh",
);
assert.equal(refreshed.reviewProtocol, 2);
const ownerNow = status(await api(owner, "GET", path), 200, "owner after refresh");
const memberNow = status(await api(member, "GET", path), 200, "member after refresh");
const guestNow = status(await api(guest, "GET", path), 200, "guest after refresh");
const finding = memberNow.findings.find(
  (item) => created.includes(item.expenseId) && item.lifecycle === "ACTIVE",
);
assert.ok(finding, "member must see the new active finding");
const observedExpenseId = finding.expenseId;
assert.ok(ownerNow.findings.some((item) => item.id === finding.id));
assert.ok(!guestNow.findings.some((item) => item.id === finding.id));
assert.equal(finding.personalDecision, "NEEDS_REVIEW");

const actionPath = `/review-findings/${finding.id}/actions`;
const key = randomUUID();
const reason = `Member private ${randomUUID()}`;
const payload = {
  action: "DISMISSED",
  baseRevision: finding.revision,
  decisionRevision: finding.decisionRevision ?? 0,
  reason,
  operationId: key,
};
status(await api(guest, "POST", actionPath, payload, key), 403, "guest forbidden");
const acted = status(
  await api(member, "POST", actionPath, payload, key),
  200,
  "member action",
);
const replayed = status(
  await api(member, "POST", actionPath, payload, key),
  200,
  "idempotent replay",
);
assert.equal(acted.action.id, replayed.action.id);
const memberFinal = status(await api(member, "GET", path), 200, "member final");
const ownerFinal = status(await api(owner, "GET", path), 200, "owner final");
assert.equal(
  memberFinal.findings.find((item) => item.id === finding.id).personalDecision,
  "DISMISSED",
);
assert.equal(
  ownerFinal.findings.find((item) => item.id === finding.id).personalDecision,
  "NEEDS_REVIEW",
);
assert.ok(memberFinal.actions.some((item) => item.reason === reason));
assert.ok(!ownerFinal.actions.some((item) => item.reason === reason));
const counts = (projection) => {
  const active = projection.findings.filter(
    (item) =>
      item.lifecycle === "ACTIVE" &&
      item.layer === "HEURISTIC" &&
      item.rulesetVersion !== "ledger-review-v1",
  );
  return {
    pending: active.filter((item) => item.personalDecision === "NEEDS_REVIEW").length,
    reviewed: active.filter((item) => item.personalDecision !== "NEEDS_REVIEW").length,
  };
};
assert.equal(counts(memberFinal).pending, counts(memberNow).pending - 1);
assert.equal(counts(memberFinal).reviewed, counts(memberNow).reviewed + 1);

const updateExpense = async (newTitle, baseRevision, label) => {
  const { localId: _localId, ...fields } = expense(newTitle);
  return status(
    await api(
      owner,
      "PUT",
      `/expenses/${observedExpenseId}`,
      {
        ...fields,
        baseRevision,
        auditReason: `Review 2.0 ${label}`,
      },
      randomUUID(),
    ),
    200,
    label,
  );
};
await updateExpense(`${title} corrected`, 1, "resolve duplicate");
status(await api(owner, "POST", "/ledger/review/refresh", {}), 200, "refresh resolved");
const resolved = status(await api(member, "GET", path), 200, "member resolved");
const old = resolved.findings.find((item) => item.id === finding.id);
assert.ok(old && old.lifecycle !== "ACTIVE", "old Finding must remain as history");
assert.equal(old.personalDecision, "DISMISSED");
assert.ok(resolved.actions.some((item) => item.id === acted.action.id));

await updateExpense(title, 2, "reopen duplicate");
status(await api(owner, "POST", "/ledger/review/refresh", {}), 200, "refresh reopened");
const reopened = status(await api(member, "GET", path), 200, "member reopened");
const next = reopened.findings.find(
  (item) =>
    item.expenseId === observedExpenseId &&
    item.lifecycle === "ACTIVE" &&
    item.id !== finding.id,
);
assert.ok(next, "reappearing issue must have a new Finding generation");
assert.equal(next.personalDecision, "NEEDS_REVIEW");
const concurrent = await Promise.all(
  [owner, member].map((token) => {
    const operationId = randomUUID();
    return api(
      token,
      "POST",
      `/review-findings/${next.id}/actions`,
      {
        action: "ACKNOWLEDGED",
        baseRevision: next.revision,
        decisionRevision: 0,
        operationId,
      },
      operationId,
    );
  }),
);
concurrent.forEach((result, i) => status(result, 200, `concurrent actor ${i}`));
const ownerConcurrent = status(await api(owner, "GET", path), 200, "owner concurrent");
const memberConcurrent = status(await api(member, "GET", path), 200, "member concurrent");
assert.equal(
  ownerConcurrent.findings.find((item) => item.id === next.id).personalDecision,
  "ACKNOWLEDGED",
);
assert.equal(
  memberConcurrent.findings.find((item) => item.id === next.id).personalDecision,
  "ACKNOWLEDGED",
);
const dismissKey = randomUUID();
status(
  await api(
    member,
    "POST",
    `/review-findings/${next.id}/actions`,
    {
      action: "DISMISSED",
      baseRevision: next.revision,
      decisionRevision: 1,
      operationId: dismissKey,
    },
    dismissKey,
  ),
  200,
  "dismiss without reason",
);
const memberDismissed = status(
  await api(member, "GET", path),
  200,
  "member no-reason dismiss",
);
assert.equal(
  memberDismissed.findings.find((item) => item.id === next.id).personalDecision,
  "DISMISSED",
);
assert.equal(
  ownerConcurrent.findings.find((item) => item.id === next.id).lifecycle,
  "ACTIVE",
);
console.log(
  JSON.stringify({
    result: "PASS",
    createdExpenses: created,
    findingId: finding.id,
    initialFindings: initial.map((item) => item.findings.length),
    finalFindings: [ownerFinal, memberFinal, guestNow].map(
      (item) => item.findings.length,
    ),
    oldClientGate: 426,
    guestAction: 403,
    memberDecision: "DISMISSED",
    ownerDecision: "NEEDS_REVIEW",
    privateReasonIsolated: true,
    idempotentReplay: true,
    oldLifecycle: old.lifecycle,
    newFindingId: next.id,
    newDecision: next.personalDecision,
    pendingCountReduced: true,
    reviewedCountIncreased: true,
    concurrentAck: true,
    optionalNoReasonAckAndDismiss: true,
  }),
);
