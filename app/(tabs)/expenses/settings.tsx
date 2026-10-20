import { useLocalSearchParams } from "expo-router";
import { CurrencySettingsScreen } from "@/features/ledger/CurrencySettingsScreen";

export default function CurrencyRoute() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  return <CurrencySettingsScreen journeyId={journeyId} />;
}
