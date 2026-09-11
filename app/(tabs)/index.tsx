import { FoundationScreen } from "@/components/FoundationScreen";
import { Stage4BPhysicalSmokeScreen } from "@/components/Stage4BPhysicalSmokeScreen";

export default function TodayRoute() {
  if (process.env.EXPO_PUBLIC_OTR_STAGE4B_PHYSICAL_SMOKE === "1") {
    return <Stage4BPhysicalSmokeScreen />;
  }

  return <FoundationScreen title="Today" status="Local data first" />;
}
