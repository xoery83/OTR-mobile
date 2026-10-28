import { Redirect } from "expo-router";
export default function P1FidelityDetailRoute() {
  if (!__DEV__) return <Redirect href="/trip" />;
  const { P1FidelityDetail } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/day-feed-lab/P1FidelityDetail") as typeof import("@/features/day-feed-lab/P1FidelityDetail");
  return <P1FidelityDetail />;
}
