import { useLocalSearchParams } from "expo-router";
import { CurrencySettingsScreen } from "@/features/ledger/CurrencySettingsScreen";

export default function CurrencyRoute() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  return <CurrencySettingsScreen key={journeyId ?? "default"} journeyId={journeyId} />;
}
