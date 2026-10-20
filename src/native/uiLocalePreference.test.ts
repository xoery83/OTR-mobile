import { afterEach, expect, it, vi } from "vitest";
import { getUiLocale, setUiLocale } from "@/ui/locale";
import { chooseUiLocale, hydrateUiLocale } from "./uiLocalePreference";
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: storage.get,
  setItemAsync: storage.set,
}));
afterEach(() => {
  vi.clearAllMocks();
  setUiLocale("en");
});
it("hydrates offline without requiring auth and does not overwrite a newer selection", async () => {
  setUiLocale("en");
  let finish!: (s: string) => void;
  storage.get.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  storage.set.mockResolvedValue(undefined);
  const hydration = hydrateUiLocale();
  await chooseUiLocale("zh-Hans");
  finish("en");
  await hydration;
  expect(getUiLocale()).toBe("zh-Hans");
  expect(storage.set).toHaveBeenCalledWith("otr-ui-locale-v1", "zh-Hans");
  storage.get.mockResolvedValue("zh-Hans");
  setUiLocale("en");
  await hydrateUiLocale();
  expect(getUiLocale()).toBe("zh-Hans");
  storage.get.mockResolvedValue("bad");
  await hydrateUiLocale();
  expect(getUiLocale()).toBe("zh-Hans");
});
it("serializes preference writes and preserves the locale after failed selection", async () => {
  setUiLocale("en");
  storage.set.mockRejectedValueOnce(new Error("storage failed"));
  await expect(chooseUiLocale("zh-Hans")).rejects.toThrow("storage failed");
  expect(getUiLocale()).toBe("en");
  storage.set.mockResolvedValue(undefined);
  await Promise.all([chooseUiLocale("zh-Hans"), chooseUiLocale("en")]);
  expect(storage.set.mock.calls.slice(-2).map((c) => c[1])).toEqual(["zh-Hans", "en"]);
  expect(getUiLocale()).toBe("en");
});
