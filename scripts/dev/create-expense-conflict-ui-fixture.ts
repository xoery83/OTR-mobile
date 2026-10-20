import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const url = process.env.OTR_DEV_SUPABASE_URL!;
assert.equal(new URL(url).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
const db = createClient(url, process.env.OTR_DEV_SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function main() {
  const email = `expense-phase4-${randomUUID().slice(0, 8)}@otr.invalid`;
  const password = randomBytes(24).toString("base64url");
  const tripId = randomUUID();
  const user = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Expense Fixture" },
  });
  if (user.error) throw new Error(user.error.message);
  const profile = await db
    .from("profiles")
    .insert({ id: user.data.user.id, display_name: "Expense Fixture" });
  if (profile.error) throw new Error(profile.error.message);
  const trip = await db.from("trips").insert({
    id: tripId,
    name: "Expense Conflict Formal UI",
    start_date: "2026-09-29",
    end_date: "2026-10-03",
    created_by: user.data.user.id,
  });
  if (trip.error) throw new Error(trip.error.message);
  const member = await db
    .from("journey_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.data.user.id)
    .single();
  if (member.error) throw new Error(member.error.message);
  const memberId = member.data.id;
  const settings = await db.from("ledger_settings").insert({
    journey_id: tripId,
    settlement_currency: "NZD",
    settlement_scale: 2,
    valuation_policy: "REFERENCE_RATE",
    updated_by: user.data.user.id,
  });
  if (settings.error) throw new Error(settings.error.message);
  const auth = createClient(url, process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await auth.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(signed.error.message);
  let sequence = 0;
  async function request(method: string, path: string, body: any, key = randomUUID()) {
    const r = await fetch(`https://api-dev.xoery.art/v2/trips/${tripId}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${signed.data.session!.access_token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  }
  function wire(intent: any, revision: number, key = randomUUID()) {
    return {
      auditReason: "Isolated formal UI fixture",
      envelope: {
        commandId: key,
        intentVersion: 2,
        intentSequence: ++sequence,
        predecessorOperationId: null,
        observedServerRevision: revision,
        observedBase: null,
        patchOrIntent: intent,
        causalBaseReceipt: null,
        boundExecutionRevision: revision,
        idempotencyKey: key,
      },
    };
  }
  const original = { minor: 3200, currency: "NZD", scale: 2 };
  const expense = {
    title: "Deletion awaiting decision",
    description: null,
    category: "food",
    occurredAt: "2026-09-20T10:00:00Z",
    economicDate: "2026-09-20",
    payerMemberId: memberId,
    original,
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    participants: [
      { memberId, displayNameSnapshot: "Expense Fixture", householdIdSnapshot: null },
    ],
    splits: [
      {
        memberId,
        method: "EQUAL_PERSON",
        originalMinor: 3200,
        settlementMinor: 3200,
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
  const fixtures = [];
  for (const title of [
    "Deletion awaiting decision",
    "Shared amount needs review",
    "Revision drift review",
  ]) {
    const create = wire({ type: "CREATE", expense: { ...expense, title } }, 0);
    const created = await request(
      "POST",
      "/expenses",
      create,
      create.envelope.idempotencyKey,
    );
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const id = created.body.entity.id;
    const advance = wire(
      {
        type: "UPDATE",
        patch: { descriptive: { description: "Newer shared revision" } },
      },
      1,
    );
    assert.equal(
      (await request("PUT", `/expenses/${id}`, advance, advance.envelope.idempotencyKey))
        .status,
      200,
    );
    const patch = wire(
      {
        type: "UPDATE",
        patch: { financial: { original: { ...original, minor: 4500 } } },
      },
      1,
    );
    const conflict = await request(
      "PUT",
      `/expenses/${id}`,
      patch,
      patch.envelope.idempotencyKey,
    );
    assert.equal(conflict.status, 409);
    const deletion = wire({ type: "DELETE" }, 1);
    const deleteConflict = await request(
      "DELETE",
      `/expenses/${id}`,
      deletion,
      deletion.envelope.idempotencyKey,
    );
    assert.equal(deleteConflict.status, 409);
    fixtures.push({
      id,
      title,
      deleteConflictId: deleteConflict.body.error.conflictId,
      financialConflictId: conflict.body.error.conflictId,
    });
  }
  const fixture = {
    project: "tuqigdxrvrerfewsxqgm",
    tripId,
    userId: user.data.user.id,
    memberId,
    email,
    password,
    fixtures,
  };
  writeFileSync(
    "/private/tmp/otr-expense-phase4-ui-fixture.json",
    JSON.stringify(fixture, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      { status: "READY", tripId, userId: fixture.userId, fixtures },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
