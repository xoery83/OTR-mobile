import { Redirect, useLocalSearchParams } from "expo-router";

export default function DayFeedLabRoute() {
  const { fidelity } = useLocalSearchParams<{ fidelity?: string }>();
  if (!__DEV__) return <Redirect href="/trip" />;
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
