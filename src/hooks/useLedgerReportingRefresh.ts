import { useCallback } from "react";

import type { MyLedgerPeriod } from "@/data/api/ledgerReadContracts";
import {
  refreshJourneyLedger,
  refreshMyLedger,
} from "@/data/sync/ledgerReportingCoordinator";

export function useLedgerReportingRefresh() {
  const refreshJourney = useCallback(
    (journeyId: string) => refreshJourneyLedger(journeyId),
    [],
  );
  const refreshPersonal = useCallback(
    (period: MyLedgerPeriod, bounds: { from: string | null; to: string | null }) =>
      refreshMyLedger(period, bounds),
    [],
  );
  return { refreshJourney, refreshPersonal };
}
