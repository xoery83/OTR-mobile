import * as SecureStore from "expo-secure-store";
import { requireActiveUserId } from "@/data/auth/authRepository";
import {
  captureAccountScope,
  assertAccountRequestContext,
  withAccountApplyGate,
} from "@/data/auth/accountRequestContext";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  validateCalendarDate,
  dayViewContext,
  type DayViewContext,
} from "@/domain/trip/dayReadModel";

export type DayNavigationBookmark = DayViewContext & {
  tripId: string;
  date: string;
  anchor?: { key: string; date: string; within: number };
};
type SavedBookmark = DayNavigationBookmark & { updatedAt: number };
const maxAge = 30 * 24 * 60 * 60 * 1000;

// Navigation hints confer no Trip access and never select a route on App launch.
function parseHint(value: unknown): DayNavigationBookmark | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<DayNavigationBookmark>;
  if (!coreUuid.safeParse(row.tripId).success || typeof row.date !== "string")
    return null;
  let context: DayViewContext;
  try {
    validateCalendarDate(row.date);
    if (row.zone === null && row.viewMode === "FLOATING")
      context = dayViewContext({ zone: null, viewMode: "FLOATING" });
    else if (
      typeof row.zone === "string" &&
      row.zone.length <= 100 &&
      (row.viewMode === undefined || row.viewMode === "NAMED_ZONE")
    )
      context = dayViewContext(row.zone);
    else return null;
  } catch {
    return null;
  }
  const hint: DayNavigationBookmark = {
    tripId: row.tripId!,
    date: row.date,
    ...context,
  };
  const anchor = row.anchor;
  if (anchor !== undefined) {
    if (
      !anchor ||
      typeof anchor.key !== "string" ||
      anchor.key.length === 0 ||
      anchor.key.length > 512 ||
      /[\u0000-\u001f\u007f]/.test(anchor.key) ||
      anchor.date !== hint.date ||
      !Number.isFinite(anchor.within) ||
      anchor.within < 0 ||
      anchor.within > 100000
    )
      return null;
    hint.anchor = { key: anchor.key, date: anchor.date, within: anchor.within };
  }
  return hint;
}

export function createDayNavigationBookmarkRepository(
  storage: Pick<typeof SecureStore, "getItemAsync" | "setItemAsync"> = SecureStore,
  account = requireActiveUserId,
  now = Date.now,
) {
  async function access(change?: (rows: SavedBookmark[]) => SavedBookmark[]) {
    const scope = await captureAccountScope(account);
    const key = `otr-day-bookmarks-v1-${coreUuid.parse(scope.accountId)}`;
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(scope, account);
      let raw: string | null;
      try {
        raw = await storage.getItemAsync(key);
      } catch {
        await assertAccountRequestContext(scope, account);
        return []; // A failed read must not replace possibly valid saved hints.
      }
      await assertAccountRequestContext(scope, account);
      const currentTime = now();
      let rows: SavedBookmark[] = [];
      try {
        const parsed: unknown = JSON.parse(raw ?? "[]");
        if (
          Array.isArray(parsed) &&
          new TextEncoder().encode(raw ?? "[]").length <= 1800
        ) {
          for (const value of parsed.slice(0, 8)) {
            const hint = parseHint(value),
              updatedAt = value?.updatedAt;
            if (
              hint &&
              typeof updatedAt === "number" &&
              Number.isFinite(updatedAt) &&
              updatedAt <= currentTime &&
              updatedAt > currentTime - maxAge &&
              !rows.some((row) => row.tripId === hint.tripId)
            )
              rows.push({ ...hint, updatedAt });
          }
        }
      } catch {
        /* A corrupt preference is empty, never corrupt business data. */
      }
      if (change) {
        rows = change(rows).slice(0, 8);
        while (new TextEncoder().encode(JSON.stringify(rows)).length > 1800) rows.pop();
        await assertAccountRequestContext(scope, account);
        try {
          await storage.setItemAsync(key, JSON.stringify(rows));
        } catch {
          await assertAccountRequestContext(scope, account);
          return [];
        }
      }
      await assertAccountRequestContext(scope, account);
      return rows.map(({ updatedAt: _updatedAt, ...hint }) => hint);
    });
  }
  return {
    list: () => access(),
    record: (value: DayNavigationBookmark) => {
      const hint = parseHint(value);
      return hint
        ? access((rows) => [
            { ...hint, updatedAt: now() },
            ...rows.filter((row) => row.tripId !== hint.tripId),
          ])
        : access();
    },
    remove: (tripId: string) =>
      access((rows) => rows.filter((row) => row.tripId !== tripId)),
  };
}
export const dayNavigationBookmarkRepository = createDayNavigationBookmarkRepository();
