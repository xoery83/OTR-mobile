import { afterEach, expect, it, vi } from "vitest";
import { subscribeMinuteClock } from "./useMinuteClock";
const state = vi.hoisted(() => ({
  currentState: "active",
  change: (_value: string) => {},
  remove: vi.fn(),
}));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return state.currentState;
    },
    addEventListener: (_name: string, listener: (value: string) => void) => {
      state.change = listener;
      return { remove: state.remove };
    },
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  state.currentState = "active";
  state.remove.mockClear();
});
it("publishes once a minute, pauses in background and refreshes across midnight on resume", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T23:59:30Z"));
  const publish = vi.fn();
  const dispose = subscribeMinuteClock(publish);
  expect(publish).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(29000);
  expect(publish).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000);
  expect(publish).toHaveBeenLastCalledWith(
    expect.objectContaining({ instant: "2026-06-16T00:00:00.000Z" }),
  );
  state.change("background");
  vi.advanceTimersByTime(120000);
  expect(publish).toHaveBeenCalledTimes(2);
  state.change("active");
  expect(publish).toHaveBeenCalledTimes(3);
  expect(publish).toHaveBeenLastCalledWith(
    expect.objectContaining({ instant: "2026-06-16T00:02:00.000Z" }),
  );
  dispose();
  vi.advanceTimersByTime(60000);
  expect(publish).toHaveBeenCalledTimes(3);
  expect(state.remove).toHaveBeenCalledOnce();
});
it("reads device time-zone changes on each minute and foreground refresh", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  const publish = vi.fn();
  const dispose = subscribeMinuteClock(publish);
  const original = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...original.call(this), timeZone: "Pacific/Auckland" };
  });
  vi.advanceTimersByTime(60000);
  expect(publish).toHaveBeenLastCalledWith(
    expect.objectContaining({ deviceZone: "Pacific/Auckland" }),
  );
  dispose();
});
it("does not start an idle background timer", () => {
  vi.useFakeTimers();
  state.currentState = "background";
  const publish = vi.fn();
  const dispose = subscribeMinuteClock(publish);
  expect(publish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  state.change("active");
  expect(publish).toHaveBeenCalledOnce();
  dispose();
});
