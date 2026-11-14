import { beforeEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: storage.get,
  setItemAsync: storage.set,
}));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  storage.set.mockResolvedValue(undefined);
});
const load = async () => ({
  ...(await import("./uiLocalePreference")),
  ...(await import("@/ui/locale")),
});
it("hydrates offline and does not overwrite a newer selection", async () => {
  const p = await load();
  let finish!: (value: string) => void;
  storage.get.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hydration = p.hydrateUiLocale();
  await p.chooseUiLocale("zh-Hans");
  finish("en");
  await hydration;
  expect(p.getUiLocale()).toBe("zh-Hans");
  expect(storage.set).toHaveBeenCalledWith("otr-ui-locale-v1", "zh-Hans");
});
it("restores a saved locale at cold initialization and ignores unknown values", async () => {
  let p = await load();
  storage.get.mockResolvedValue("zh-Hans");
  await p.hydrateUiLocale();
  expect(p.getUiLocale()).toBe("zh-Hans");
  vi.resetModules();
  p = await load();
  storage.get.mockResolvedValue("bad");
  await p.hydrateUiLocale();
  expect(p.getUiLocale()).toBe("en");
});
it("keeps the last successful choice when the next rapid write fails", async () => {
  const p = await load();
  storage.set
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error("STORAGE_FAILED"));
  const a = p.chooseUiLocale("zh-Hans");
  const b = p.chooseUiLocale("en");
  await a;
  await expect(b).rejects.toThrow();
  expect(p.getUiLocale()).toBe("zh-Hans");
  await p.chooseUiLocale("en");
  expect(p.getUiLocale()).toBe("en");
});
it("does not hydrate after an explicit choice has already started", async () => {
  const p = await load();
  const write = p.chooseUiLocale("zh-Hans");
  await p.hydrateUiLocale();
  await write;
  expect(storage.get).not.toHaveBeenCalled();
  expect(p.getUiLocale()).toBe("zh-Hans");
});
