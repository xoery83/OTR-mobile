import { expect, it, vi } from "vitest";
import { createDayHeaderStylePreference } from "./dayHeaderStylePreference";
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
const key = (trip: string) => `otr-day-header-style-v1-${trip}`;
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItemAsync: vi.fn(async (name: string) => values.get(name) ?? null),
    setItemAsync: vi.fn(async (name: string, value: string) => {
      values.set(name, value);
    }),
  };
}
it("updates all same-Trip subscribers synchronously, isolates Trips and hydrates without Auth", async () => {
  const disk = storage(),
    preference = createDayHeaderStylePreference(disk);
  const first = vi.fn(),
    second = vi.fn(),
    other = vi.fn();
  preference.subscribe("guest-trip", first);
  const unsubscribe = preference.subscribe("guest-trip", second);
  preference.subscribe("other-trip", other);
  await preference.hydrate("guest-trip");
  const writes = preference.cycle("guest-trip");
  expect(preference.get("guest-trip")).toBe("B");
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
  unsubscribe();
  await writes;
  const restart = createDayHeaderStylePreference(disk);
  await Promise.all([restart.hydrate("guest-trip"), restart.hydrate("other-trip")]);
  expect(restart.get("guest-trip")).toBe("B");
  expect(restart.get("other-trip")).toBe("A");
});
it("never lets a late stored value overwrite taps, and serializes rapid writes", async () => {
  const disk = storage(),
    preference = createDayHeaderStylePreference(disk);
  let finish!: (value: string) => void;
  disk.getItemAsync.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hydration = preference.hydrate("trip");
  const writes = [
    preference.cycle("trip"),
    preference.cycle("trip"),
    preference.cycle("trip"),
  ];
  expect(preference.get("trip")).toBe("D");
  finish("B");
  await Promise.all([hydration, ...writes]);
  expect(preference.get("trip")).toBe("D");
  expect(disk.setItemAsync.mock.calls.map((call) => call[1])).toEqual(["B", "C", "D"]);
  expect(disk.values.get(key("trip"))).toBe("D");
});
it("retains an offline session choice when storage is unavailable and ignores corrupt preferences", async () => {
  const disk = storage(),
    preference = createDayHeaderStylePreference(disk);
  disk.getItemAsync.mockRejectedValueOnce(new Error("unavailable"));
  disk.setItemAsync.mockRejectedValueOnce(new Error("unavailable"));
  await preference.hydrate("offline");
  await preference.cycle("offline");
  expect(preference.get("offline")).toBe("B");
  await preference.cycle("offline");
  expect(preference.get("offline")).toBe("C");
  disk.values.set(key("invalid"), "unknown");
  await preference.hydrate("invalid");
  expect(preference.get("invalid")).toBe("A");
});
it("does not replace a choice made before its first hydration", async () => {
  const disk = storage(),
    preference = createDayHeaderStylePreference(disk);
  disk.getItemAsync.mockResolvedValue("D");
  await preference.cycle("trip");
  await preference.hydrate("trip");
  expect(preference.get("trip")).toBe("B");
});
it("coalesces hydration for all visible headers of aTrip", async () => {
  const disk = storage(),
    preference = createDayHeaderStylePreference(disk);
  disk.values.set(key("trip"), "C");
  const notify = vi.fn();
  preference.subscribe("trip", notify);
  await Promise.all(Array.from({ length: 8 }, () => preference.hydrate("trip")));
  expect(disk.getItemAsync).toHaveBeenCalledOnce();
  expect(preference.get("trip")).toBe("C");
  expect(notify).toHaveBeenCalledOnce();
});
