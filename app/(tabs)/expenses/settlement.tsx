import { useLocalSearchParams } from "expo-router";

import { SettlementReadinessScreen } from "@/features/ledger/SettlementReadinessScreen";

export default function SettlementRoute() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  return <SettlementReadinessScreen journeyId={journeyId} />;
}
