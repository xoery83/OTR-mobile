import * as SecureStore from "expo-secure-store";
import {
  readCommittedLocalPrincipal,
  requireActiveUserId,
  requireCommittedGuestPrincipal,
} from "@/data/auth/authRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  captureAccountScope,
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
} from "@/data/auth/accountRequestContext";
import { coreUuid } from "@/domain/trip/tripCoreV2";

export type RecentSearch = { query: string; tripId: string | null };
const identity = (row: RecentSearch) =>
  JSON.stringify([row.query.normalize("NFKC").toLowerCase(), row.tripId]);
export function createSearchRecentRepository(
  storage: Pick<typeof SecureStore, "getItemAsync" | "setItemAsync"> = SecureStore,
  account = requireActiveUserId,
  guest = false,
) {
  async function access(change?: (rows: RecentSearch[]) => RecentSearch[]) {
    const scope = await captureAccountScope(account);
    const key = `otr-search-recents-v1-${guest ? "guest-" : ""}${coreUuid.parse(scope.accountId)}`;
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(scope, account);
      const raw = await storage.getItemAsync(key);
      let rows: RecentSearch[] = [];
      try {
        const parsed: unknown = JSON.parse(raw ?? "[]");
        if (Array.isArray(parsed))
          rows = parsed
            .filter(
              (row): row is RecentSearch =>
                row &&
                typeof row.query === "string" &&
                row.query.trim().length > 0 &&
                row.query.length <= 120 &&
                (row.tripId === null || coreUuid.safeParse(row.tripId).success),
            )
            .slice(0, 8);
      } catch {
        /* A corrupt preference is an empty history, never business data. */
      }
      if (change) {
        rows = change(rows).slice(0, 8);
        // SecureStore has a small value budget; discard oldest long queries first.
        while (new TextEncoder().encode(JSON.stringify(rows)).length > 1800) rows.pop();
        await assertAccountRequestContext(scope, account);
        await storage.setItemAsync(key, JSON.stringify(rows));
      }
      await assertAccountRequestContext(scope, account);
      return rows;
    });
  }
  return {
    list: () => access(),
    record: (row: RecentSearch) => {
      const query = row.query.trim();
      if (
        !query ||
        query.length > 120 ||
        (row.tripId !== null && !coreUuid.safeParse(row.tripId).success)
      )
        return access();
      const next = { query, tripId: row.tripId };
      return access((rows) => [
        next,
        ...rows.filter((item) => identity(item) !== identity(next)),
      ]);
    },
    remove: (row: RecentSearch) =>
      access((rows) => rows.filter((item) => identity(item) !== identity(row))),
    clear: (tripId: RecentSearch["tripId"]) =>
      access((rows) => rows.filter((row) => row.tripId !== tripId)),
  };
}
async function currentRecents() {
  const generation = getAccountGeneration();
  const principal = await readCommittedLocalPrincipal();
  if (!principal || principal.kind === "SIGNED_OUT")
    throw new Error("SEARCH_RECENTS_PRINCIPAL_REQUIRED");
  const scope = {
    accountId: principal.kind === "GUEST" ? principal.localId : principal.accountId,
    generation,
  };
  assertAccountRequestGeneration(scope);
  return createSearchRecentRepository(
    SecureStore,
    async () => {
      const current =
        principal.kind === "GUEST"
          ? (await requireCommittedGuestPrincipal()).localId
          : await requireActiveUserId();
      assertAccountRequestGeneration(scope);
      if (current !== scope.accountId)
        throw new Error("SEARCH_RECENTS_PRINCIPAL_CHANGED");
      return current;
    },
    principal.kind === "GUEST",
  );
}
export const searchRecentRepository = {
  list: async () => (await currentRecents()).list(),
  record: async (row: RecentSearch) => (await currentRecents()).record(row),
  remove: async (row: RecentSearch) => (await currentRecents()).remove(row),
  clear: async (tripId: RecentSearch["tripId"]) => (await currentRecents()).clear(tripId),
};
