import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";

import {
  personalSettlementPaymentListResponseSchema,
  personalSettlementPaymentMutationResponseSchema,
} from "../../src/data/api/ledgerSettlementContracts";
import { ledgerChangesResponseSchema } from "../../src/data/api/ledgerReadContracts";
import { migrations } from "../../src/data/db/migrations";
import { createLedgerPersonalPaymentRepository } from "../../src/data/repositories/ledgerPersonalPaymentRepository";
import { createLedgerPersonalPaymentSyncWorker } from "../../src/data/sync/ledgerPersonalPaymentSyncWorker";
import { createSyncEngine } from "../../src/data/sync/syncEngine";
import { createSyncOperationRepository } from "../../src/data/sync/syncOperationRepository";

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
};
const tripId = randomUUID();
const members = { owner: randomUUID(), member: randomUUID() };

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
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
) {
  const response = await fetch(`${apiUrl}/v2/trips/${tripId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(`HTTP ${response.status}`), {
      status: response.status,
      code: json?.error?.code,
    });
  return json;
}

function localDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration.sql);
  const api = {
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const result = sqlite.prepare(sql).run(...(args as never[]));
      return { changes: Number(result.changes) } as never;
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (sqlite.prepare(sql).get(...(args as never[])) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return sqlite.prepare(sql).all(...(args as never[])) as T[];
    },
  };
  return { sqlite, api };
}

async function settlementCounts() {
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
  const insertedTrip = await admin.from("trips").insert({
    id: tripId,
    name: `Settlement 2 Phase 1C ${tripId.slice(0, 8)}`,
    created_by: users.owner,
  });
  if (insertedTrip.error) throw insertedTrip.error;
  const ownerMember = await admin
    .from("journey_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", users.owner)
    .single();
  if (ownerMember.error) throw ownerMember.error;
  members.owner = ownerMember.data.id;
  const insertedMember = await admin.from("journey_members").insert({
    id: members.member,
    trip_id: tripId,
    user_id: users.member,
    display_name: "Phase 1C Member",
    role: "group_member",
    status: "linked",
    linked_at: new Date().toISOString(),
  });
  if (insertedMember.error) throw insertedMember.error;
  const settings = await admin.from("ledger_settings").insert({
    journey_id: tripId,
    settlement_currency: "NZD",
    settlement_scale: 2,
    valuation_policy: "REFERENCE_RATE",
    updated_by: users.owner,
  });
  if (settings.error) throw settings.error;

  const tokens = { owner: await token("owner"), member: await token("member") };
  const before = await settlementCounts();
  const { sqlite, api } = localDatabase();
  for (const [userId, memberId, name] of [
    [users.owner, members.owner, "Owner"],
    [users.member, members.member, "Member"],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO ledger_actor_context
       (user_id,journey_id,member_id,role,capabilities_json,updated_at)
       VALUES (?,? ,?,'group_member','{}',?)`,
      )
      .run(userId, tripId, memberId, new Date().toISOString());
    sqlite
      .prepare(
        `INSERT INTO ledger_members
       (id,journey_id,display_name,role,status,updated_at) VALUES (?,?,?,?,?,?)`,
      )
      .run(memberId, tripId, name, "group_member", "linked", new Date().toISOString());
  }

  const active = { role: "owner" as keyof typeof users };
  const activeUser = async () => users[active.role];
  const repository = createLedgerPersonalPaymentRepository(api, activeUser);
  const transport = {
    async create(journeyId: string, input: unknown, key: string) {
      assert.equal(journeyId, tripId);
      return personalSettlementPaymentMutationResponseSchema.parse(
        await request(
          tokens[active.role],
          "POST",
          "/ledger/personal-payments",
          input,
          key,
        ),
      );
    },
    async update(journeyId: string, id: string, input: unknown, key: string) {
      assert.equal(journeyId, tripId);
      return personalSettlementPaymentMutationResponseSchema.parse(
        await request(
          tokens[active.role],
          "PATCH",
          `/ledger/personal-payments/${id}`,
          input,
          key,
        ),
      );
    },
    async remove(journeyId: string, id: string, input: unknown, key: string) {
      assert.equal(journeyId, tripId);
      return personalSettlementPaymentMutationResponseSchema.parse(
        await request(
          tokens[active.role],
          "DELETE",
          `/ledger/personal-payments/${id}`,
          input,
          key,
        ),
      );
    },
  };
  async function sync() {
    return createSyncEngine(
      createSyncOperationRepository(api, activeUser),
      createLedgerPersonalPaymentSyncWorker(repository, transport as never),
      undefined,
      (operation) => operation.entityType === "ledger_personal_payment",
    ).run("AUTHENTICATED_ONLINE");
  }
  const value = (
    counterpartyMemberId: string,
    direction: "PAID" | "RECEIVED",
    amountMinor: number,
  ) => ({
    journeyId: tripId,
    counterpartyMemberId,
    direction,
    amountMinor,
    currency: "NZD",
    scale: 2,
    occurredAt: "2026-09-22T10:00:00+12:00",
    note: null,
    recordedEquivalentMinor: null,
    recordedEquivalentCurrency: null,
    recordedEquivalentScale: null,
    referenceRateDecimal: null,
    referenceRateDate: null,
    referenceSource: null,
    referenceProvenance: null,
  });

  const paid = await repository.create(value(members.member, "PAID", 30_000));
  assert.equal((await repository.get(paid.id))!.syncStatus, "PENDING_CREATE");
  await sync();
  assert.equal((await repository.get(paid.id))!.syncStatus, "SYNCED");
  await repository.update(paid.id, value(members.member, "PAID", 30_100));
  await sync();
  assert.equal((await repository.get(paid.id))!.amountMinor, 30_100);

  active.role = "member";
  const received = await repository.create(value(members.owner, "RECEIVED", 29_500));
  await sync();
  assert.equal((await repository.get(received.id))!.amountMinor, 29_500);
  const history = personalSettlementPaymentListResponseSchema.parse(
    await request(tokens.member, "GET", "/ledger/personal-payments?includeDeleted=true"),
  );
  await repository.applyHistoricalList(tripId, history.payments, history.serverTime);
  assert.ok(
    (await repository.listForJourney(tripId, true)).some(({ id }) => id === paid.id),
  );

  active.role = "owner";
  await repository.remove(paid.id);
  await sync();
  const changes = ledgerChangesResponseSchema.parse(
    await request(tokens.owner, "GET", "/ledger/personal-payments/changes"),
  );
  await repository.applyChanges(tripId, changes);
  assert.ok((await repository.get(paid.id))!.deletedAt);

  const removed = await admin
    .from("journey_members")
    .update({ status: "unlinked" })
    .eq("id", members.member);
  if (removed.error) throw removed.error;
  active.role = "member";
  await repository.update(received.id, value(members.owner, "RECEIVED", 29_600));
  await sync();
  assert.equal((await repository.get(received.id))!.syncStatus, "FAILED");
  assert.equal(
    sqlite
      .prepare(
        "SELECT status FROM sync_operations WHERE entity_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      )
      .get(received.id)?.status,
    "FAILED",
  );
  const removedHistory = personalSettlementPaymentListResponseSchema.parse(
    await request(tokens.member, "GET", "/ledger/personal-payments?includeDeleted=true"),
  );
  assert.ok(removedHistory.payments.some(({ id }) => id === received.id));
  assert.deepEqual(await settlementCounts(), before);

  console.log(
    JSON.stringify({
      assertions: 14,
      tripId,
      offlineCreateUpdateDelete: true,
      independentTwoSideAmounts: true,
      membershipLossPreservedLocally: true,
      canonicalSettlementUnchanged: true,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
