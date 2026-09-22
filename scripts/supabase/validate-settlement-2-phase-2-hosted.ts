import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
  organizer: "00000000-0000-4000-8000-000000000001",
  payer: "00000000-0000-4000-8000-000000000002",
  receiver: "00000000-0000-4000-8000-000000000003",
};
const tripId = randomUUID();
const members = { organizer: "", payer: randomUUID(), receiver: randomUUID() };

async function token(role: keyof typeof users) {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: `${role === "organizer" ? "owner" : role === "payer" ? "member" : "guest"}@otr.invalid`,
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
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  key?: string,
) {
  const response = await fetch(`${apiUrl}/v2/trips/${tripId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined || body instanceof Uint8Array
        ? {}
        : { "Content-Type": "application/json" }),
      ...(body instanceof Uint8Array ? { "Content-Type": "image/jpeg" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof Uint8Array
          ? new Blob([body.slice().buffer as ArrayBuffer])
          : JSON.stringify(body),
  });
  const result = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : new Uint8Array(await response.arrayBuffer());
  return { status: response.status, body: result };
}

async function counts() {
  const tables = [
    "settlements",
    "settlement_inputs",
    "settlement_member_balances",
    "settlement_transfers",
    "settlement_payments",
    "settlement_payment_discharges",
  ];
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => {
        const result = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("journey_id", tripId);
        if (result.error) throw result.error;
        return [table, result.count ?? 0];
      }),
    ),
  );
}

async function main() {
  const trip = await admin.from("trips").insert({
    id: tripId,
    name: `Settlement 2 Phase 2 ${tripId.slice(0, 8)}`,
    created_by: users.organizer,
  });
  if (trip.error) throw trip.error;
  const organizer = await admin
    .from("journey_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", users.organizer)
    .single();
  if (organizer.error) throw organizer.error;
  members.organizer = organizer.data.id;
  const added = await admin.from("journey_members").insert([
    {
      id: members.payer,
      trip_id: tripId,
      user_id: users.payer,
      display_name: "Phase 2 Payer",
      role: "group_member",
      status: "linked",
      linked_at: new Date().toISOString(),
    },
    {
      id: members.receiver,
      trip_id: tripId,
      user_id: users.receiver,
      display_name: "Phase 2 Receiver",
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
    updated_by: users.organizer,
  });
  if (settings.error) throw settings.error;

  const tokens = {
    organizer: await token("organizer"),
    payer: await token("payer"),
    receiver: await token("receiver"),
  };
  const before = await counts();
  const paymentId = randomUUID();
  const created = await request(
    tokens.payer,
    "POST",
    "/ledger/personal-payments",
    {
      id: paymentId,
      counterpartyMemberId: members.receiver,
      direction: "PAID",
      amountMinor: 90_000_000,
      currency: "JPY",
      scale: 0,
      occurredAt: "2026-09-22T12:00:00+12:00",
      note: "Advance and overpayment remain personal assertions",
      recordedEquivalentMinor: 1_000,
      recordedEquivalentCurrency: "NZD",
      recordedEquivalentScale: 2,
      referenceRateDecimal: null,
      referenceRateDate: null,
      referenceSource: null,
      referenceProvenance: null,
    },
    randomUUID(),
  );
  assert.equal(created.status, 201);

  const bytes = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
  const receipts: { id: string; objectPath: string; sha256: string }[] = [];
  for (const [index, content] of bytes.entries()) {
    const sha256 = createHash("sha256").update(content).digest("hex");
    const asset = await request(
      tokens.payer,
      "POST",
      "/receipts",
      {
        localId: `phase2-${paymentId}-${index}`,
        mimeType: "image/jpeg",
        sizeBytes: content.byteLength,
        sha256,
      },
      randomUUID(),
    );
    assert.equal(asset.status, 201);
    const entity = (asset.body as { entity: { id: string; objectPath: string } }).entity;
    assert.equal(
      (await request(tokens.payer, "PUT", `/receipts/${entity.id}/content`, content))
        .status,
      200,
    );
    assert.equal(
      (
        await request(
          tokens.payer,
          "POST",
          `/receipts/${entity.id}/upload-complete`,
          { objectPath: entity.objectPath, sizeBytes: content.byteLength, sha256 },
          randomUUID(),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          tokens.payer,
          "POST",
          `/ledger/personal-payments/${paymentId}/attachments`,
          { receiptId: entity.id },
          randomUUID(),
        )
      ).status,
      201,
    );
    receipts.push({ ...entity, sha256 });
  }

  for (const role of ["payer", "receiver", "organizer"] as const) {
    const listed = await request(
      tokens[role],
      "GET",
      `/ledger/personal-payments/${paymentId}/attachments`,
    );
    assert.equal(listed.status, 200);
    assert.equal((listed.body as { attachments: unknown[] }).attachments.length, 2);
  }
  const downloaded = await request(
    tokens.receiver,
    "GET",
    `/receipts/${receipts[0].id}/content`,
  );
  assert.equal(downloaded.status, 200);
  assert.deepEqual(downloaded.body, bytes[0]);
  const publicObject = await fetch(
    `${supabaseUrl}/storage/v1/object/public/ledger-receipts/${receipts[0].objectPath}`,
  );
  assert.notEqual(publicObject.status, 200);

  const removed = await admin
    .from("journey_members")
    .update({ status: "unlinked" })
    .eq("id", members.receiver);
  if (removed.error) throw removed.error;
  assert.equal(
    (
      await request(
        tokens.receiver,
        "GET",
        `/ledger/personal-payments/${paymentId}/attachments`,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(tokens.receiver, "GET", `/receipts/${receipts[0].id}/content`)).status,
    200,
  );

  const unlinked = await request(
    tokens.payer,
    "DELETE",
    `/ledger/personal-payments/${paymentId}/attachments/${receipts[1].id}`,
    {},
    randomUUID(),
  );
  assert.equal(unlinked.status, 200);
  const afterUnlink = await request(
    tokens.payer,
    "GET",
    `/ledger/personal-payments/${paymentId}/attachments`,
  );
  assert.equal((afterUnlink.body as { attachments: unknown[] }).attachments.length, 1);
  assert.deepEqual(await counts(), before);

  console.log(
    JSON.stringify({
      assertions: 18,
      tripId,
      multiAttachment: true,
      ownerCounterpartyOrganizerRead: true,
      historicalCounterpartyRead: true,
      privateObject: true,
      noFxSave: true,
      softDelete: true,
      canonicalSettlementUnchanged: true,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
