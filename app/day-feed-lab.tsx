import { Redirect } from "expo-router";

export default function DayFeedLabRoute() {
  if (!__DEV__) return <Redirect href="/trip" />;
  // Release must never load the fixture subtree.
  const { DayFeedLabScreen } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/day-feed-lab/DayFeedLabScreen") as typeof import("@/features/day-feed-lab/DayFeedLabScreen");
  return <DayFeedLabScreen />;
}
