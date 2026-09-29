import { useLocalSearchParams } from "expo-router";

import { SettlementReadinessScreen } from "@/features/ledger/SettlementReadinessScreen";

export default function SettlementRoute() {
  const { journeyId, journeyTitle } = useLocalSearchParams<{
    journeyId?: string;
    journeyTitle?: string;
  }>();
  return <SettlementReadinessScreen journeyId={journeyId} journeyTitle={journeyTitle} />;
}
