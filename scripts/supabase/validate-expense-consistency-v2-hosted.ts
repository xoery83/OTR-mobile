import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { applyPendingReferenceValuations } from "../../backend/src/supabaseGateway";
import {
  expenseConflictChainResponseSchema,
  expenseConflictChainResolutionResponseSchema,
} from "../../src/data/api/ledgerMutationContracts";
import {
  ledgerBootstrapResponseSchema,
  ledgerChangesResponseSchema,
} from "../../src/data/api/ledgerReadContracts";

const url = process.env.OTR_DEV_SUPABASE_URL!;
assert.equal(new URL(url).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(url, process.env.OTR_DEV_SUPABASE_SECRET_KEY!, options);
const auth = createClient(url, process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY!, options);
const tripId = randomUUID();
const ownerUser = "00000000-0000-4000-8000-000000000001";
const memberUser = "00000000-0000-4000-8000-000000000002";
let ownerToken: string;
let memberToken: string;
let ownerMember: string;
let sequence = 0;
const passed: string[] = [];
async function checked(query: PromiseLike<{ data: any; error: any }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function token(role: string) {
  const data = await checked(
    db.auth.admin.generateLink({ type: "magiclink", email: `${role}@otr.invalid` }),
  );
  const verified = await checked(
    auth.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" }),
  );
  return verified.session.access_token;
}
async function request(
  method: string,
  path: string,
  body?: unknown,
  key = randomUUID(),
  accessToken = ownerToken,
) {
  const response = await fetch(`https://api-dev.xoery.art/v2/trips/${tripId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Idempotency-Key": key,
      "Content-Type": "application/json",
      "X-Review-Protocol": "2",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
function ok(result: any, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body;
}
function expense(currency = "NZD") {
  const original = { minor: 10000, currency, scale: 2 };
  return {
    title: "Expense consistency isolated fixture",
    description: null,
    category: "food",
    occurredAt: "2026-07-12T00:00:00Z",
    economicDate: "2026-07-12",
    payerMemberId: ownerMember,
    original,
    businessStatus: currency === "NZD" ? "ACCEPTED" : "RATE_REQUIRED",
    settlementParticipation: "INCLUDED",
    participants: [
      {
        memberId: ownerMember,
        displayNameSnapshot: "Fixture Owner",
        householdIdSnapshot: null,
      },
    ],
    splits: [
      {
        memberId: ownerMember,
        method: "EQUAL_PERSON",
        originalMinor: 10000,
        settlementMinor: currency === "NZD" ? 10000 : null,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation:
      currency === "NZD"
        ? {
            policy: "SAME_CURRENCY",
            original,
            settlement: original,
            rateSnapshotId: null,
            paymentRecordId: null,
            reason: null,
          }
        : null,
  };
}
function command(intent: any, revision: number, base: any = null, key = randomUUID()) {
  return {
    auditReason: "Isolated Hosted Dev acceptance",
    envelope: {
      commandId: key,
      intentVersion: 2,
      intentSequence: ++sequence,
      predecessorOperationId: null,
      observedServerRevision: revision,
      observedBase: base,
      patchOrIntent: intent,
      causalBaseReceipt: null,
      boundExecutionRevision: revision,
      idempotencyKey: key,
    },
  };
}
async function send(id: string | null, input: any, accessToken = ownerToken) {
  const type = input.envelope.patchOrIntent.type;
  const result = await request(
    type === "CREATE" || type === "RESTORE" || type === "APPLY_VALUATION"
      ? "POST"
      : type === "DELETE"
        ? "DELETE"
        : "PUT",
    `/expenses${id ? `/${id}` : ""}${type === "RESTORE" ? "/restore" : type === "APPLY_VALUATION" ? "/valuations" : ""}`,
    input,
    input.envelope.idempotencyKey,
    accessToken,
  );
  return result;
}
async function chain(id: string) {
  return expenseConflictChainResponseSchema.parse(
    ok(await request("GET", `/expenses/${id}/conflicts`)),
  );
}
function resolution(value: any, primary: any, covered: string[], choice: string) {
  return {
    contractVersion: 2,
    commandId: primary.commandId,
    intentType: primary.commandType,
    submittedIntent: primary.submittedIntent,
    observedBaseRevision: primary.observedBaseRevision,
    currentServerRevision: value.canonical.revision,
    coveredConflictIds: covered,
    expectedChainDigest: value.chainDigest,
    choice,
    reason: "Isolated Hosted Dev chain closure",
  };
}
async function counts(id: string) {
  const [e, a, o] = await Promise.all([
    checked(db.from("expenses").select("revision,business_status").eq("id", id).single()),
    checked(db.from("expense_audit_events").select("id").eq("expense_id", id)),
    checked(
      db
        .from("expense_conflict_outcomes_v2")
        .select("conflict_id")
        .in(
          "conflict_id",
          (await chain(id)).conflicts.map((c) => c.conflictId),
        ),
    ),
  ]);
  return { e, audits: a.length, outcomes: o.length };
}
async function main() {
  await checked(
    db.from("trips").insert({
      id: tripId,
      name: `Expense Consistency v2 ${tripId.slice(0, 8)}`,
      created_by: ownerUser,
    }),
  );
  ownerMember = (
    await checked(
      db
        .from("journey_members")
        .select("id")
        .eq("trip_id", tripId)
        .eq("user_id", ownerUser)
        .single(),
    )
  ).id;
  await checked(
    db.from("journey_members").insert({
      id: randomUUID(),
      trip_id: tripId,
      user_id: memberUser,
      display_name: "Fixture Member",
      role: "group_member",
      status: "linked",
      linked_at: new Date().toISOString(),
    }),
  );
  await checked(
    db.from("ledger_settings").insert({
      journey_id: tripId,
      settlement_currency: "NZD",
      settlement_scale: 2,
      valuation_policy: "REFERENCE_RATE",
      updated_by: ownerUser,
    }),
  );
  [ownerToken, memberToken] = await Promise.all([token("owner"), token("member")]);
  await checked(
    db.from("ledger_rate_quotes").insert({
      id: randomUUID(),
      journey_id: tripId,
      quote_currency: "EUR",
      base_currency: "NZD",
      decimal_rate: "1.9608",
      effective_date: "2026-07-10",
      economic_date: "2026-07-12",
      reference_date: "2026-07-10",
      policy_version: "ECB_DAILY_V1",
      observed_at: new Date().toISOString(),
      expires_at: "2026-10-29T00:00:00Z",
      provider: "ECB",
      provider_reference:
        "https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12",
      source_reference:
        "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    }),
  );
  const base = ok(
    await send(null, command({ type: "CREATE", expense: expense("EUR") }, 0)),
  ).entity;
  const id = base.id;
  await applyPendingReferenceValuations(db, tripId);
  const auto = (await chain(id)).canonical;
  assert.equal(auto.revision, 2);
  assert.equal(auto.valuation?.referenceEvidence?.automatic, true);
  const merge = ok(
    await send(
      id,
      command(
        { type: "UPDATE", patch: { descriptive: { title: "Merged title" } } },
        1,
        base,
      ),
    ),
  );
  assert.equal(merge.entity.revision, 3);
  assert.equal(merge.entity.valuation.id, auto.valuation!.id);
  assert.deepEqual(merge.entity.splits, auto.splits);
  passed.push(
    "typed descriptive three-way merge preserves automatic valuation and derived splits",
  );
  const financial = command(
    {
      type: "UPDATE",
      patch: { financial: { original: { minor: 12000, currency: "EUR", scale: 2 } } },
    },
    1,
    base,
  );
  assert.equal((await send(id, financial)).status, 409);
  const forged = command(
    { type: "UPDATE", patch: { descriptive: { description: "Forged evidence" } } },
    99,
    { ...base, revision: 99 },
  );
  assert.equal((await send(id, forged)).status, 409);
  const deleted = command({ type: "DELETE" }, 1, base);
  assert.equal((await send(id, deleted)).status, 409);
  passed.push("financial divergence and unverified client history remain OPEN conflicts");
  const before = await chain(id);
  assert.equal(before.conflicts.filter((c) => c.lifecycle === "OPEN").length, 3);
  const primary = before.conflicts.find(
    (c) => c.commandId === deleted.envelope.commandId,
  )!;
  assert.equal(primary.submittedIntent!.type, "DELETE");
  const covered = before.conflicts
    .filter((c) => c.commandId !== forged.envelope.commandId)
    .map((c) => c.conflictId);
  const input = resolution(before, primary, covered, "CONFIRM_DELETE");
  assert.equal(
    (
      await request("POST", `/expenses/${id}/conflict-resolution`, {
        ...input,
        expectedChainDigest: "a".repeat(64),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("POST", `/expenses/${id}/conflict-resolution`, {
        ...input,
        currentServerRevision: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "POST",
        `/expenses/${id}/conflict-resolution`,
        input,
        randomUUID(),
        memberToken,
      )
    ).status,
    403,
  );
  passed.push("chain/revision drift and permission reject");
  const resolutionKey = randomUUID();
  const applied = expenseConflictChainResolutionResponseSchema.parse(
    ok(
      await request("POST", `/expenses/${id}/conflict-resolution`, input, resolutionKey),
    ),
  );
  assert.equal(applied.canonical.businessStatus, "DELETED");
  assert.equal(applied.resolutionReceipt.commandType, "DELETE");
  assert.equal(applied.openConflictIds.length, 1);
  assert.equal(
    applied.conflictOutcomes.filter((c) => c.lifecycle === "SUPERSEDED").length,
    1,
  );
  assert.equal(
    applied.conflictOutcomes.filter((c) => c.lifecycle === "RESOLVED").length,
    1,
  );
  const countBefore = await counts(id);
  const replay = ok(
    await request("POST", `/expenses/${id}/conflict-resolution`, input, resolutionKey),
  );
  assert.deepEqual(replay, applied);
  assert.deepEqual(await counts(id), countBefore);
  passed.push(
    "covered/uncovered multi-conflict closure, DELETE round-trip and response-loss exact replay without duplicate mutation/revision/audit",
  );
  assert.equal(
    (
      await send(
        id,
        command(
          { type: "UPDATE", patch: { descriptive: { title: "Cannot revive" } } },
          4,
        ),
      )
    ).status,
    409,
  );
  const restored = ok(
    await send(id, command({ type: "RESTORE", businessStatus: "ACCEPTED" }, 4)),
  );
  assert.equal(restored.receipt.commandType, "RESTORE");
  assert.equal(restored.entity.deletedAt, null);
  assert.equal(restored.entity.businessStatus, "ACCEPTED");
  const oldRestore = command({ type: "RESTORE", businessStatus: "ACCEPTED" }, 4);
  ok(await send(id, command({ type: "DELETE" }, 5)));
  assert.equal((await send(id, oldRestore)).status, 409);
  const restoreChain = await chain(id);
  const restoreConflict = restoreChain.conflicts.find(
    (c) => c.commandId === oldRestore.envelope.commandId,
  )!;
  const restoreApplied = ok(
    await request(
      "POST",
      `/expenses/${id}/conflict-resolution`,
      resolution(
        restoreChain,
        restoreConflict,
        [restoreConflict.conflictId],
        "CONFIRM_RESTORE",
      ),
    ),
  );
  assert.equal(restoreApplied.resolutionReceipt.commandType, "RESTORE");
  assert.equal(restoreApplied.canonical.businessStatus, "ACCEPTED");
  passed.push(
    "UPDATE cannot resurrect tombstone; direct and conflicting RESTORE preserve typed lifecycle",
  );
  const legacyInput = { ...expense(), localId: randomUUID() };
  const legacy = ok(await request("POST", "/expenses", legacyInput), 201).entity;
  const staleLegacy = {
    ...legacyInput,
    baseRevision: 1,
    auditReason: "Legacy strict CAS",
    title: "Legacy stale title",
  };
  ok(
    await send(
      legacy.id,
      command(
        { type: "UPDATE", patch: { descriptive: { description: "Newer server" } } },
        1,
      ),
    ),
  );
  assert.equal((await request("PUT", `/expenses/${legacy.id}`, staleLegacy)).status, 409);
  passed.push("v40 legacy full-aggregate remains strict CAS");
  const frozen = ok(
    await send(null, command({ type: "CREATE", expense: expense() }, 0)),
  ).entity;
  await checked(
    db
      .from("settlements")
      .insert({
        id: randomUUID(),
        journey_id: tripId,
        settlement_currency: "NZD",
        settlement_scale: 2,
        status: "FINALIZED",
        through_timestamp: "2026-07-13T00:00:00Z",
        input_digest: randomUUID(),
        algorithm_version: "fixture-only",
        created_by: ownerUser,
      })
      .select("id")
      .single(),
  ).then(async (s) => {
    await checked(
      db.from("settlement_inputs").insert({
        settlement_id: s.id,
        journey_id: tripId,
        expense_id: frozen.id,
        expense_revision: 1,
        valuation_snapshot_id: frozen.valuation.id,
      }),
    );
  });
  assert.equal((await send(frozen.id, command({ type: "DELETE" }, 1))).status, 409);
  passed.push("frozen Settlement input rejects; no Settlement Confirm executed");
  const bootstrap = ledgerBootstrapResponseSchema.parse(
    ok(await request("GET", "/ledger/bootstrap")),
  );
  const pulled = ledgerChangesResponseSchema.parse(
    ok(
      await request(
        "GET",
        `/ledger/changes?cursor=${encodeURIComponent(bootstrap.cursor ?? "")}`,
      ),
    ),
  );
  for (const feed of [bootstrap, pulled]) {
    const metadata = feed.expenseConflictChains!.find((c) => c.expenseId === id)!;
    const authoritative = await chain(id);
    assert.equal(metadata.chainDigest, authoritative.chainDigest);
    assert.deepEqual(
      [...metadata.openConflictIds].sort(),
      authoritative.conflicts
        .filter((c) => c.lifecycle === "OPEN")
        .map((c) => c.conflictId)
        .sort(),
    );
  }
  passed.push(
    "bootstrap and empty pull expose authoritative OPEN chain metadata; optional additions accepted by current v40 schemas",
  );
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        project: "tuqigdxrvrerfewsxqgm",
        fixtureTripId: tripId,
        expenseId: id,
        passed,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({ status: "FAIL", fixtureTripId: tripId, message: error.message }),
  );
  process.exitCode = 1;
});
