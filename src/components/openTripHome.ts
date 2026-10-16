import { router } from "expo-router";

// Retain the My Trips route instance below Home so the native edge gesture returns to it.
export function openTripHome(tripId: string, pathname: string, view?: unknown) {
  if (pathname === "/trip-home") {
    if (view === "day") router.setParams({ view: "home" });
    return;
  }
  router.navigate("/trip");
  router.push({ pathname: "/trip-home", params: { tripId, view: "home" } });
}
