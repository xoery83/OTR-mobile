import { Redirect } from "expo-router";
export default function StayFidelityDetailRoute() {
  if (!__DEV__) return <Redirect href="/trip" />;
  const { StayFidelityDetail } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/day-feed-lab/StayFidelityDetail") as typeof import("@/features/day-feed-lab/StayFidelityDetail");
  return <StayFidelityDetail />;
}
