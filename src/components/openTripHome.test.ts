import { beforeEach, expect, it, vi } from "vitest";
import { openTripHome } from "./openTripHome";
const calls = vi.hoisted(() => ({
  navigate: vi.fn(),
  push: vi.fn(),
  setParams: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: calls }));
beforeEach(() => vi.clearAllMocks());
it("anchors My Trips before native Home push without changing list parameters", () => {
  openTripHome("a", "/");
  expect(calls.navigate).toHaveBeenCalledWith("/trip");
  expect(calls.push).toHaveBeenCalledWith({
    pathname: "/trip-home",
    params: { tripId: "a", view: "home" },
  });
  expect(calls.navigate.mock.invocationCallOrder[0]).toBeLessThan(
    calls.push.mock.invocationCallOrder[0],
  );
  expect(calls.setParams).not.toHaveBeenCalled();
});
it("keeps an existing Home mounted and changes only its Day view when needed", () => {
  openTripHome("a", "/trip-home", "home");
  expect(calls.navigate).not.toHaveBeenCalled();
  expect(calls.push).not.toHaveBeenCalled();
  openTripHome("a", "/trip-home", "day");
  expect(calls.setParams).toHaveBeenCalledWith({ view: "home" });
});
