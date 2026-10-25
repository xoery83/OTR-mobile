import { Redirect, useLocalSearchParams } from "expo-router";

export default function DayFeedLabRoute() {
  const { fidelity } = useLocalSearchParams<{ fidelity?: string }>();
  if (!__DEV__) return <Redirect href="/trip" />;
  if (fidelity === "p2-form") {
    const { P2FormQa } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/features/day-feed-lab/P2FormQa") as typeof import("@/features/day-feed-lab/P2FormQa");
    return <P2FormQa />;
  }
  if (fidelity === "calibration") {
    const { FidelityCalibration } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/features/day-feed-lab/FidelityCalibration") as typeof import("@/features/day-feed-lab/FidelityCalibration");
    return <FidelityCalibration />;
  }
  if (fidelity === "p1") {
    const { P1FidelityPreview } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/features/day-feed-lab/P1FidelityPreview") as typeof import("@/features/day-feed-lab/P1FidelityPreview");
    return <P1FidelityPreview />;
  }
  // Release must never load the fixture subtree.
  const { DayFeedLabScreen } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/day-feed-lab/DayFeedLabScreen") as typeof import("@/features/day-feed-lab/DayFeedLabScreen");
  return <DayFeedLabScreen />;
}
