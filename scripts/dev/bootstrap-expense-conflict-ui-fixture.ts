import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";
import { ledgerBootstrapResponseSchema } from "../../src/data/api/ledgerReadContracts";
import { createLedgerReadRepository } from "../../src/data/repositories/ledgerReadRepository";

async function main() {
  const fixture = JSON.parse(
    readFileSync("/private/tmp/otr-expense-phase4-ui-fixture.json", "utf8"),
  );
  const url = process.env.OTR_DEV_SUPABASE_URL!;
  assert.equal(new URL(url).hostname, "tuqigdxrvrerfewsxqgm.supabase.co");
  assert.equal(fixture.project, "tuqigdxrvrerfewsxqgm");
  const path = process.argv[2]!;
  assert(
    path.includes(
      "/1B538F6A-8CB2-45BD-B0E2-02F5AFE8DA60/data/Containers/Data/Application/",
    ),
  );
  assert(path.endsWith("/Documents/SQLite/otr-mobile.db"));
  const auth = createClient(url, process.env.OTR_DEV_SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await auth.auth.signInWithPassword({
    email: fixture.email,
    password: fixture.password,
  });
  if (signed.error) throw signed.error;
  assert.equal(signed.data.user!.id, fixture.userId);
  const response = await fetch(
    `https://api-dev.xoery.art/v2/trips/${fixture.tripId}/ledger/bootstrap`,
    { headers: { Authorization: `Bearer ${signed.data.session!.access_token}` } },
  );
  assert.equal(response.status, 200);
  const bootstrap = ledgerBootstrapResponseSchema.parse(await response.json());
  assert.equal(bootstrap.journey.id, fixture.tripId);
  const db = new DatabaseSync(path);
  const api = {
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (db.prepare(sql).get(...(args as never[])) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return db.prepare(sql).all(...(args as never[])) as T[];
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const result = db.prepare(sql).run(...(args as never[]));
      return { changes: Number(result.changes) } as never;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  await createLedgerReadRepository(api, async () => fixture.userId).applyBootstrap(
    bootstrap,
  );
  // Only the dedicated fixture mirror represents a locally saved deletion; server remains unchanged.
  const tombstone = db
    .prepare(
      "UPDATE ledger_expenses SET business_status='DELETED',deleted_at=?,sync_status='CONFLICT',local_owner_user_id=? WHERE server_id=? AND journey_id=?",
    )
    .run(
      new Date().toISOString(),
      fixture.userId,
      fixture.fixtures[0].id,
      fixture.tripId,
    );
  assert.equal(Number(tombstone.changes), 1);
  db.close();
  console.log(
    "PASS: real Hosted bootstrap applied to isolated fixture mirror; local deletion retained.",
  );
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Fixture bootstrap failed");
  process.exitCode = 1;
});
