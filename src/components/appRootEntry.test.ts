import { beforeEach, expect, it, vi } from "vitest";
import RootEntry from "../../app/(tabs)/index";
const state = vi.hoisted(() => ({ params: {} as Record<string, string | undefined> }));
vi.mock("expo-router", () => ({
  Redirect: "Redirect",
  useLocalSearchParams: () => state.params,
}));
vi.mock("@/features/day-feed/TripScreen", () => ({ TripScreen: "TripScreen" }));
vi.mock("@/components/Stage4BPhysicalSmokeScreen", () => ({
  Stage4BPhysicalSmokeScreen: "Smoke",
}));
beforeEach(() => {
  state.params = {};
  vi.stubEnv("EXPO_PUBLIC_OTR_STAGE4B_PHYSICAL_SMOKE", "0");
});
it("normal entry selects My Trips without reading network/session or an old Day bookmark", () => {
  const result = RootEntry();
  expect(result.type).toBe("Redirect");
  expect(result.props.href).toEqual({
    pathname: "/trip",
    params: { view: "trips", tripId: "" },
  });
  state.params = { homeQaScenario: "Today" };
  expect(RootEntry().type).toBe("Redirect");
});
it("preserves explicit Trip Day and complete date/zone deep links", () => {
  for (const params of [
    { view: "day" },
    { tripId: "a", date: "2026-10-16", zone: "Pacific/Auckland" },
  ]) {
    state.params = params;
    const result = RootEntry();
    expect(result.type).toBe("TripScreen");
    expect(result.props.today).toBe(true);
  }
});
