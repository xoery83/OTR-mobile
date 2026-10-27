import { Redirect } from "expo-router";
export default function RentalFidelityDetailRoute() {
  if (!__DEV__) return <Redirect href="/trip" />;
  const { RentalFidelityDetail } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/day-feed-lab/RentalFidelityDetail") as typeof import("@/features/day-feed-lab/RentalFidelityDetail");
  return <RentalFidelityDetail />;
}
