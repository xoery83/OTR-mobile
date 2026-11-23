import { createContext } from "react";

export const LedgerJourneyCloseContext = createContext<{
  setBusy(value: boolean): void;
  hasOrigin(routeKey: string, ledgerRouteKey: string): boolean;
} | null>(null);
