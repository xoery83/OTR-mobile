import type * as SQLite from "expo-sqlite";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  privateProfileDraft,
  privateProfileNameDraftSchema,
  type PrivateProfileNameDraft,
} from "@/domain/auth/privateAccountProfile";
import {
  privateAccountProfileSnapshotSchema,
  type PrivateAccountProfileSnapshot,
} from "@/data/api/privateAccountProfileContracts";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountScope,
} from "./accountRequestContext";

export type PrivateProfileDatabase = Pick<SQLite.SQLiteDatabase,
  "getFirstAsync" | "runAsync" | "withTransactionAsync">;
export type PrivateProfileLocalState = Readonly<{
  accountId: string;
  accepted: PrivateAccountProfileSnapshot | null;
  draft: PrivateProfileNameDraft;
}>;
type Row = { accepted_snapshot_json: string | null; draft_json: string };

// A local draft is not a server receipt. The enclosing Account repository owns this data source.
export function createPrivateProfileLocalStore(
  database: PrivateProfileDatabase,
  account: () => Promise<string>,
  now: () => string = () => new Date().toISOString(),
) {
  async function scoped<T>(input: AccountScope, work: (scope: AccountScope) => Promise<T>) {
    const scope = Object.freeze({ ...input });
    coreUuid.parse(scope.accountId);
    const result = await withAccountApplyGate(async () => {
      await assertAccountRequestContext(scope, account);
      let result!: T;
      await database.withTransactionAsync(async () => {
        await assertAccountRequestContext(scope, account);
        result = await work(scope);
        await assertAccountRequestContext(scope, account);
      });
      return result;
    });
    await assertAccountRequestContext(scope, account);
    return result;
  }
  async function read(scope: AccountScope): Promise<PrivateProfileLocalState | null> {
    const row = await database.getFirstAsync<Row>(
      "SELECT accepted_snapshot_json,draft_json FROM account_private_profile_local WHERE account_id=?",
      scope.accountId,
    );
    if (!row) return null;
    try {
      const accepted = row.accepted_snapshot_json === null ? null
        : privateAccountProfileSnapshotSchema.parse(JSON.parse(row.accepted_snapshot_json));
      if (accepted && accepted.accountId !== scope.accountId) throw Error();
      return { accountId: scope.accountId, accepted,
        draft: privateProfileNameDraftSchema.parse(JSON.parse(row.draft_json)) };
    } catch { throw Error("PRIVATE_PROFILE_LOCAL_INVALID"); }
  }
  async function write(value: PrivateProfileLocalState) {
    await database.runAsync(
      `INSERT INTO account_private_profile_local(account_id,accepted_snapshot_json,draft_json,updated_at)
       VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET
       accepted_snapshot_json=excluded.accepted_snapshot_json,draft_json=excluded.draft_json,updated_at=excluded.updated_at`,
      value.accountId, value.accepted === null ? null : JSON.stringify(value.accepted),
      JSON.stringify(value.draft), now(),
    );
  }
  return {
    read(input: AccountScope) { return scoped(input, read); },
    saveDraft(input: AccountScope, value: PrivateProfileNameDraft) {
      const draft = privateProfileNameDraftSchema.parse(value);
      return scoped(input, async (scope) => {
        const prior = await read(scope);
        const result = { accountId: scope.accountId, accepted: prior?.accepted ?? null, draft };
        await write(result);
        return result;
      });
    },
    cacheServer(input: AccountScope, value: PrivateAccountProfileSnapshot) {
      const incoming = privateAccountProfileSnapshotSchema.parse(value);
      return scoped(input, async (scope) => {
        if (incoming.accountId !== scope.accountId) throw Error("PRIVATE_PROFILE_ACCOUNT_MISMATCH");
        const prior = await read(scope);
        if (prior?.accepted && incoming.revision < prior.accepted.revision)
          throw Error("PRIVATE_PROFILE_STALE_SNAPSHOT");
        if (prior?.accepted && incoming.revision === prior.accepted.revision &&
          JSON.stringify(incoming) !== JSON.stringify(prior.accepted))
          throw Error("PRIVATE_PROFILE_SNAPSHOT_CHANGED");
        // Preserve both editor formats and the original CAS base until the user reviews changes.
        if (prior && JSON.stringify(prior.draft) !== JSON.stringify(privateProfileDraft(prior.accepted?.fields)))
          return { kind: "DRAFT_PRESERVED" as const, value: prior, incoming };
        const result = { accountId: scope.accountId, accepted: incoming,
          draft: privateProfileDraft(incoming.fields) };
        await write(result);
        return { kind: "CACHED" as const, value: result };
      });
    },
  };
}
