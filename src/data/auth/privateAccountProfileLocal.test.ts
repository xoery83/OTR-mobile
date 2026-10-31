import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { privateAccountProfileMigration } from "../db/privateAccountProfileMigration";
import { captureAccountScope } from "./accountRequestContext";
import { advanceAccountGeneration } from "./accountGeneration";
import { createPrivateProfileLocalStore, type PrivateProfileDatabase } from "./privateAccountProfileLocal";
import { privateProfileDraft } from "@/domain/auth/privateAccountProfile";
import { createAccountProfileRepository } from "./accountProfileRepository";
import type { PrivateAccountProfileSnapshot } from "../api/privateAccountProfileContracts";
vi.mock("./sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const handles = new Set<DatabaseSync>();
const folders: string[] = [];
afterEach(() => {
  for (const db of handles) db.close();
  handles.clear();
  for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true });
});
async function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "otr-private-profile-"));
  folders.push(folder);
  const path = join(folder, "profile.db");
  let sql = new DatabaseSync(path);
  handles.add(sql);
  sql.exec("CREATE TABLE preserved(value TEXT);INSERT INTO preserved VALUES('original');");
  sql.exec(privateAccountProfileMigration.sql);
  const original = randomUUID();
  let accountId = original;
  let fault: "none" | "aba" | "write" = "none";
  const account = async () => accountId;
  const database: PrivateProfileDatabase = {
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...args as never[]) ?? null) as T;
    },
    async runAsync(query: string, ...args: unknown[]) {
      const result = sql.prepare(query).run(...args as never[]);
      if (fault !== "none") {
        const current = fault; fault = "none";
        if (current === "write") throw Error("FIXTURE_WRITE_FAILED");
        advanceAccountGeneration(); advanceAccountGeneration();
      }
      return result as never;
    },
    async withTransactionAsync(work) {
      sql.exec("BEGIN");
      try { await work(); sql.exec("COMMIT"); }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
  };
  const snapshot: PrivateAccountProfileSnapshot = {
    schemaId: "otr.auth.private-profile/1", accountId, revision: 2,
    fields: { displayName: "Display e\u0301", travelDocumentName: {
      mode: "SPLIT", familyName: "王", givenNames: "小明",
    } },
  };
  return {
    account, original, database, snapshot,
    store: createPrivateProfileLocalStore(database, account),
    scope: await captureAccountScope(account),
    sql: () => sql,
    fail(value: typeof fault) { fault = value; },
    switch(value = randomUUID()) { accountId = value; advanceAccountGeneration(); },
    reopen() {
      sql.close(); handles.delete(sql);
      sql = new DatabaseSync(path); handles.add(sql);
      return createPrivateProfileLocalStore(database, account);
    },
  };
}

it("persists an optional Unicode draft across real SQLite reopen without inventing a server snapshot", async () => {
  const f = await fixture();
  const draft = { ...privateProfileDraft(), displayName: "", mode: "UNSPLIT" as const,
    fullName: "山田 e\u0301", familyName: "王", givenNames: "小明" };
  await f.store.saveDraft(f.scope, draft);
  expect(await f.reopen().read(f.scope)).toEqual({ accountId: f.original, accepted: null, draft });
  expect(f.sql().prepare("SELECT value FROM preserved").get()).toEqual({ value: "original" });
});

it("isolates Account A/B drafts and rejects stale A→B→A scopes", async () => {
  const f = await fixture();
  await f.store.saveDraft(f.scope, { ...privateProfileDraft(), displayName: "Private A" });
  f.switch();
  await expect(f.store.read(f.scope)).rejects.toThrow("Account changed");
  const b = await captureAccountScope(f.account);
  expect(await f.store.read(b)).toBeNull();
  await f.store.saveDraft(b, { ...privateProfileDraft(), displayName: "Private B" });
  f.switch(f.original);
  await expect(f.store.read(f.scope)).rejects.toThrow("Account changed");
  expect((await f.store.read(await captureAccountScope(f.account)))?.draft.displayName).toBe("Private A");
});

it.each(["aba", "write"] as const)("rolls back a local profile write after %s failure", async (fault) => {
  const f = await fixture(); f.fail(fault);
  await expect(f.store.saveDraft(f.scope, privateProfileDraft())).rejects.toThrow();
  expect(f.sql().prepare("SELECT count(*) AS n FROM account_private_profile_local").get()).toEqual({ n: 0 });
});

it("freezes the caller's mutable draft before asynchronous persistence", async () => {
  const f = await fixture(); const draft = privateProfileDraft();
  const input = { ...draft, displayName: "Original" };
  const save = f.store.saveDraft(f.scope, input); input.displayName = "Changed later";
  await save;
  expect((await f.store.read(f.scope))?.draft.displayName).toBe("Original");
});

it("keeps edited names, inactive format and original CAS base on a newer server read", async () => {
  const f = await fixture(); await f.store.cacheServer(f.scope, f.snapshot);
  const draft = { ...privateProfileDraft(f.snapshot.fields), displayName: "Local edit", fullName: "Kept inactive" };
  await f.store.saveDraft(f.scope, draft);
  const incoming = { ...f.snapshot, revision: 3, fields: { displayName: "Other device" } };
  expect(await f.store.cacheServer(f.scope, incoming)).toMatchObject({ kind: "DRAFT_PRESERVED", incoming });
  expect(await f.reopen().read(f.scope)).toEqual({ accountId: f.original, accepted: f.snapshot, draft });
});

it("refuses older revisions and changed fields at the same revision", async () => {
  const f = await fixture(); await f.store.cacheServer(f.scope, f.snapshot);
  await expect(f.store.cacheServer(f.scope, { ...f.snapshot, revision: 1 })).rejects.toThrow("STALE_SNAPSHOT");
  await expect(f.store.cacheServer(f.scope, { ...f.snapshot, fields: {} })).rejects.toThrow("SNAPSHOT_CHANGED");
  expect((await f.store.read(f.scope))?.accepted).toEqual(f.snapshot);
});

it("rejects a foreign response or corrupt persisted identity without exposing another profile", async () => {
  const f = await fixture();
  await expect(f.store.cacheServer(f.scope, { ...f.snapshot, accountId: randomUUID() }))
    .rejects.toThrow("ACCOUNT_MISMATCH");
  await f.store.cacheServer(f.scope, f.snapshot);
  f.sql().prepare("UPDATE account_private_profile_local SET accepted_snapshot_json=?")
    .run(JSON.stringify({ ...f.snapshot, accountId: randomUUID() }));
  await expect(f.store.read(f.scope)).rejects.toThrow("LOCAL_INVALID");
});

it("caches only a successful matching scoped API response through the existing repository", async () => {
  const f = await fixture();
  const repository = createAccountProfileRepository(f.account,
    { baseUrl: "https://api.example.test", fetchImplementation: async () => Response.json(f.snapshot) },
    async () => ({ userId: f.original, token: "unit-only-token" }), f.database);
  expect(await repository.readPrivate(f.scope)).toEqual(f.snapshot);
  expect((await repository.local?.read(f.scope))?.accepted).toEqual(f.snapshot);
  expect(repository.local).not.toHaveProperty("cacheServer");
});
