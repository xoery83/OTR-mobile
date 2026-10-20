import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { applyPendingReferenceValuations } from "../../backend/src/supabaseGateway";
import { expenseConflictChainResponseSchema } from "../../src/data/api/ledgerMutationContracts";
import { ledgerBootstrapResponseSchema } from "../../src/data/api/ledgerReadContracts";

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
  console.log(JSON.stringify({ stage: "fixture_ready", tripId }));
  const base = ok(
    await send(null, command({ type: "CREATE", expense: expense("EUR") }, 0)),
  ).entity;
  await applyPendingReferenceValuations(db, tripId);
  const current = (await chain(base.id)).canonical;
  assert.equal(current.valuation?.policy, "REFERENCE_RATE");
  assert.equal(current.valuation?.referenceEvidence?.automatic, true);
  const binding = {
    revision: 1,
    serverRevision: 1,
    original: base.original,
    economicDate: base.economicDate,
    settlement: current.valuation!.settlement,
    decimalRate: current.valuation!.decimalRate!,
    referenceDate: "2026-07-10",
  };
  const intent = {
    type: "APPLY_VALUATION",
    valuation: {
      localValuationId: "phase5-value",
      localRateSnapshotId: "phase5-rate",
      policy: "MANUAL_AGREED",
      rateQuoteId: null,
      paymentRecordId: null,
      manualRate: binding.decimalRate,
      reason: "Isolated Phase 5: accept displayed rate",
      previewSettlement: binding.settlement,
      rateAcceptance: binding,
    },
  };
  const accepted = command(intent, 1, base);
  const first = ok(await send(base.id, accepted)); // Deliberately do not apply this response locally.
  assert.equal(first.entity.valuation.policy, "MANUAL_AGREED");
  assert.equal(first.entity.revision, 3);
  assert.equal(first.receipt.commandType, "APPLY_VALUATION");
  assert.equal(
    (await chain(base.id)).conflicts.filter((c: any) => c.lifecycle === "OPEN").length,
    0,
  );
  passed.push(
    "offline displayed intent + newer compatible automatic reference accepted without conflict",
  );
  async function counts(id: string) {
    const [e, a, v] = await Promise.all([
      checked(db.from("expenses").select("revision").eq("id", id).single()),
      checked(db.from("expense_audit_events").select("id").eq("expense_id", id)),
      checked(
        db.from("settlement_valuation_snapshots").select("id").eq("expense_id", id),
      ),
    ]);
    return { revision: e.revision, audits: a.length, valuations: v.length };
  }
  const after = await counts(base.id);
  assert.deepEqual(ok(await send(base.id, accepted)), first);
  assert.deepEqual(await counts(base.id), after);
  await applyPendingReferenceValuations(db, tripId);
  assert.deepEqual(await counts(base.id), after);
  assert.equal((await chain(base.id)).canonical.valuation?.policy, "MANUAL_AGREED");
  passed.push(
    "lost response same-key replay and automatic background scan preserve agreed rate; no extra valuation/revision/audit",
  );
  const invalidCases = [
    {
      name: "amount",
      patch: {
        financial: { original: { ...base.original, minor: 12000 } },
        participantSplit: {
          splits: [
            {
              memberId: ownerMember,
              method: "EQUAL_PERSON",
              originalMinor: 12000,
              weightUnits: null,
              percentageUnits: null,
            },
          ],
        },
      },
    },
    {
      name: "currency",
      patch: { financial: { original: { minor: 10000, currency: "USD", scale: 2 } } },
    },
    { name: "economic date", patch: { financial: { economicDate: "2026-07-11" } } },
  ];
  for (const test of invalidCases) {
    const original = ok(
      await send(null, command({ type: "CREATE", expense: expense("EUR") }, 0)),
    ).entity;
    await applyPendingReferenceValuations(db, tripId);
    const fresh = (await chain(original.id)).canonical;
    const changed = ok(
      await send(
        original.id,
        command({ type: "UPDATE", patch: test.patch }, fresh.revision, fresh),
      ),
    ).entity;
    await applyPendingReferenceValuations(db, tripId);
    const stable = await counts(original.id);
    const choice = command(intent, original.revision, original);
    const rejected = await send(original.id, choice);
    assert.equal(rejected.status, 409);
    assert.deepEqual(await counts(original.id), stable);
    assert.deepEqual((await chain(original.id)).canonical.original, changed.original);
    passed.push(`${test.name} drift invalidates old acceptance without mutation`);
  }
  const reference = ok(
    await send(null, command({ type: "CREATE", expense: expense("EUR") }, 0)),
  ).entity;
  await applyPendingReferenceValuations(db, tripId);
  const wrongRate = structuredClone(intent);
  wrongRate.valuation.manualRate = "1.96081";
  wrongRate.valuation.rateAcceptance.decimalRate = "1.96081";
  const rateRejected = await send(reference.id, command(wrongRate, 1, reference));
  assert.equal(rateRejected.status, 409);
  passed.push("displayed rate drift rejected even if rounded settlement money matches");
  const forbidden = await send(reference.id, command(intent, 1, reference), memberToken);
  assert.equal(forbidden.status, 403);
  passed.push("permission rejection leaves choice unapplied");
  const bootstrap = ledgerBootstrapResponseSchema.parse(
    ok(await request("GET", "/ledger/bootstrap")),
  );
  assert(
    bootstrap.expenses.some(
      (e: any) => e.id === base.id && e.valuation?.policy === "MANUAL_AGREED",
    ),
  );
  passed.push(
    "authoritative bootstrap retains agreed value and additive current-client read contract",
  );
  // Close only the deliberately rejected choices in this disposable fixture.
  for (const e of bootstrap.expenses) {
    const latest = await chain(e.id);
    const open = latest.conflicts.filter((c) => c.lifecycle === "OPEN");
    if (!open.length) continue;
    const primary = open[0]!;
    ok(
      await request("POST", `/expenses/${e.id}/conflict-resolution`, {
        contractVersion: 2,
        commandId: primary.commandId,
        intentType: primary.commandType,
        submittedIntent: primary.submittedIntent,
        observedBaseRevision: primary.observedBaseRevision,
        currentServerRevision: latest.canonical.revision,
        coveredConflictIds: open.map((c) => c.conflictId),
        expectedChainDigest: latest.chainDigest,
        choice: "KEEP_SERVER",
        reason: "Keep current fixture values; discard deliberately stale test choices.",
      }),
    );
  }
  const currencyPreview = ok(
    await request("POST", "/ledger/journey-currency/preview", {
      proposedCurrency: "USD",
    }),
  );
  ok(
    await request("POST", "/ledger/journey-currency/commit", {
      proposedCurrency: "USD",
      baseSettingsRevision: currencyPreview.settingsRevision,
      previewDigest: currencyPreview.previewDigest,
    }),
  );
  const currencyRejected = await send(reference.id, command(intent, 1, reference));
  assert.equal(currencyRejected.status, 409);
  passed.push("explicit Journey currency command invalidates the old displayed choice");
  console.log(
    JSON.stringify(
      {
        gate: "PHASE_5_HOSTED_DEV_PASS",
        project: "tuqigdxrvrerfewsxqgm",
        tripId,
        expenseId: base.id,
        after,
        passed,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({ gate: "PHASE_5_HOSTED_DEV_FAIL", tripId, message: error.message }),
  );
  process.exitCode = 1;
});
