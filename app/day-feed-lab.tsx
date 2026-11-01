import { Redirect, useLocalSearchParams } from "expo-router";

export default function DayFeedLabRoute() {
  const { fidelity } = useLocalSearchParams<{ fidelity?: string }>();
  if (!__DEV__) return <Redirect href="/trip" />;
  if (fidelity === "p6") {
    const { P6FidelityPreview } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/features/day-feed-lab/P6FidelityPreview") as typeof import("@/features/day-feed-lab/P6FidelityPreview");
    return <P6FidelityPreview />;
  }
  if (fidelity === "p5") {
    const { P5FidelityPreview } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/features/day-feed-lab/P5FidelityPreview") as typeof import("@/features/day-feed-lab/P5FidelityPreview");
    return <P5FidelityPreview />;
  }
  if (fidelity === "p2" || fidelity === "p3" || fidelity === "p4") {
    const { FlightFidelityPreview } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/features/day-feed-lab/FlightFidelityPreview") as typeof import("@/features/day-feed-lab/FlightFidelityPreview");
    return <FlightFidelityPreview />;
  }
  if (["p2-scan", "p4-scan", "p5-scan", "p6-scan"].includes(fidelity ?? "")) {
    const { FormFieldScanQa } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/features/day-feed-lab/FormFieldScanQa") as typeof import("@/features/day-feed-lab/FormFieldScanQa");
    return <FormFieldScanQa />;
  }
  if (fidelity === "p3-scan") {
    const { P3FormScanQa } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/features/day-feed-lab/P3FormScanQa") as typeof import("@/features/day-feed-lab/P3FormScanQa");
    return <P3FormScanQa />;
  }
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
