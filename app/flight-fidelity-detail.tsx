import { Redirect } from "expo-router";
export default function FlightFidelityDetailRoute() {
  if (!__DEV__) return <Redirect href="/trip" />;
  const { FlightFidelityDetail } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/day-feed-lab/FlightFidelityDetail") as typeof import("@/features/day-feed-lab/FlightFidelityDetail");
  return <FlightFidelityDetail />;
}
