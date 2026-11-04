import type { AccountScope } from "@/data/auth/accountRequestContext";

// UI observation only: CONFIRMED must follow the existing complete discovery/cache apply.
export type AccountTripRestoreObservation = Readonly<{
  scope: AccountScope;
  status: "RESTORING" | "CONFIRMED" | "UNAVAILABLE";
}>;
export type AccountTripListPresentation =
  "SHOW_TRIPS" | "CONFIRMED_EMPTY" | "RESTORING" | "UNAVAILABLE";
const same = (a: AccountScope, b: AccountScope) =>
  a.accountId === b.accountId && a.generation === b.generation;

// Normal Account list only. Guest local lists keep their existing independent path.
export function accountTripListPresentation(input: {
  current: AccountScope;
  cache: Readonly<{ scope: AccountScope; visibleTripCount: number }> | null;
  observation: AccountTripRestoreObservation | null;
  waitExpired: boolean;
}): AccountTripListPresentation {
  const cache =
    input.cache && same(input.current, input.cache.scope) ? input.cache : null;
  if (cache && cache.visibleTripCount > 0) return "SHOW_TRIPS";
  const observation =
    input.observation && same(input.current, input.observation.scope)
      ? input.observation
      : null;
  if (cache && cache.visibleTripCount === 0 && observation?.status === "CONFIRMED")
    return "CONFIRMED_EMPTY";
  if (input.waitExpired || observation?.status === "UNAVAILABLE") return "UNAVAILABLE";
  return "RESTORING";
}
