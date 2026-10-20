import { useLocalSearchParams } from "expo-router";

import { LedgerStage6Screen } from "@/features/ledger/LedgerStage6Screen";

export default function JourneyLedgerRoute() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  return <LedgerStage6Screen scopedJourneyId={journeyId} />;
}
