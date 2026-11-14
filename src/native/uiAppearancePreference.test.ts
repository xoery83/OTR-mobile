import { beforeEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({
  values: new Map<string, string>(),
  get: vi.fn(),
  set: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: storage.get,
  setItemAsync: storage.set,
}));
vi.mock("react-native", () => ({ Appearance: { setColorScheme: storage.apply } }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage.values.clear();
  storage.get.mockImplementation(async (key: string) => storage.values.get(key) ?? null);
  storage.set.mockImplementation(async (key: string, value: string) => {
    storage.values.set(key, value);
  });
});
const load = () => import("./uiAppearancePreference");
it("persists a local choice and restores it across module cold initialization", async () => {
  let preference = await load();
  await preference.chooseUiAppearance("dark");
  expect(storage.apply).toHaveBeenLastCalledWith("dark");
  vi.resetModules();
  preference = await load();
  expect(preference.getUiAppearancePreference()).toBe("system");
  await preference.hydrateUiAppearance();
  expect(preference.getUiAppearancePreference()).toBe("dark");
  await preference.chooseUiAppearance("system");
  expect(storage.apply).toHaveBeenLastCalledWith("unspecified");
});
it("does not let a late startup read overwrite a newer explicit choice", async () => {
  const preference = await load();
  let finish!: (value: string) => void;
  storage.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hydration = preference.hydrateUiAppearance();
  await preference.chooseUiAppearance("light");
  finish("dark");
  await hydration;
  expect(preference.getUiAppearancePreference()).toBe("light");
  expect(storage.apply).toHaveBeenCalledExactlyOnceWith("light");
});
it("serializes rapid choices and applies each successful persisted choice", async () => {
  const preference = await load();
  const a = preference.chooseUiAppearance("dark");
  const b = preference.chooseUiAppearance("light");
  await Promise.all([a, b]);
  expect(storage.set.mock.calls.map((args) => args[1])).toEqual(["dark", "light"]);
  expect(storage.apply.mock.calls).toEqual([["dark"], ["light"]]);
});
it("keeps the previous appearance after failed persistence and allows a later choice", async () => {
  const preference = await load();
  storage.set.mockRejectedValueOnce(Error("DEVICE_STORAGE_UNAVAILABLE"));
  await expect(preference.chooseUiAppearance("dark")).rejects.toThrow();
  expect(preference.getUiAppearancePreference()).toBe("system");
  expect(storage.apply).not.toHaveBeenCalled();
  await preference.chooseUiAppearance("light");
  expect(preference.getUiAppearancePreference()).toBe("light");
});
it("ignores unknown stored values and rejects invalid caller values without writes", async () => {
  const preference = await load();
  storage.get.mockResolvedValueOnce("unexpected-mode");
  await preference.hydrateUiAppearance();
  expect(storage.apply).not.toHaveBeenCalled();
  expect(() => preference.chooseUiAppearance("unexpected-mode" as never)).toThrow();
  expect(storage.set).not.toHaveBeenCalled();
});

it("keeps the last successful rapid choice when the following write fails", async () => {
  const preference = await load();
  storage.set
    .mockImplementationOnce(async (key: string, value: string) => {
      storage.values.set(key, value);
    })
    .mockRejectedValueOnce(Error("DEVICE_STORAGE_UNAVAILABLE"));
  const a = preference.chooseUiAppearance("dark");
  const b = preference.chooseUiAppearance("light");
  await a;
  await expect(b).rejects.toThrow();
  expect(preference.getUiAppearancePreference()).toBe("dark");
  vi.resetModules();
  const restored = await load();
  await restored.hydrateUiAppearance();
  expect(restored.getUiAppearancePreference()).toBe("dark");
});

it("does not start hydration after an explicit choice has already begun", async () => {
  const preference = await load();
  const choice = preference.chooseUiAppearance("dark");
  await preference.hydrateUiAppearance();
  await choice;
  expect(storage.get).not.toHaveBeenCalled();
  expect(preference.getUiAppearancePreference()).toBe("dark");
});
