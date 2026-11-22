import { beforeEach, expect, it, vi } from "vitest";
import { AuthSettingsSection } from "./AuthSettingsSection";
const current = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  running: { current: false },
  language: vi.fn(),
  appearance: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => current.running,
  useSyncExternalStore: (_sub: unknown, get: () => unknown) => get(),
  useState: (value: unknown) => {
    const i = current.cursor++;
    if (!(i in current.values)) current.values[i] = value;
    return [
      current.values[i],
      (next: unknown) => {
        current.values[i] = next;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("@/native/uiLocalePreference", () => ({ chooseUiLocale: current.language }));
vi.mock("@/native/uiAppearancePreference", () => ({
  chooseUiAppearance: current.appearance,
  getUiAppearancePreference: () => "system",
  subscribeUiAppearancePreference: () => () => {},
}));
vi.mock("@/ui/controls", () => ({
  UiText: "Text",
}));
vi.mock("@/ui/forms", () => ({ UiChoiceChip: "Choice" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
const nodes = (value: any): any[] =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value?.props
      ? [value, ...nodes(value.props.children)]
      : [];
const render = (kind: "language" | "appearance" = "language") => {
  current.cursor = 0;
  return nodes(AuthSettingsSection({ kind }));
};
beforeEach(() => {
  current.values = [];
  current.running.current = false;
  vi.resetAllMocks();
  current.language.mockResolvedValue(undefined);
  current.appearance.mockResolvedValue(undefined);
});
it("offers only the choices for the current settings page", () => {
  expect(render("language").filter((node) => node.type === "Choice")).toHaveLength(2);
  expect(render("appearance").filter((node) => node.type === "Choice")).toHaveLength(3);
});
it("uses existing device-local language and appearance selectors", async () => {
  const tree = render();
  tree.find((node) => node.props.label === "navigation.chinese").props.onPress();
  await Promise.resolve();
  expect(current.language).toHaveBeenCalledWith("zh-Hans");
  render("appearance")
    .find((node) => node.props.label === "authSettings.appearance.dark")
    .props.onPress();
  await Promise.resolve();
  expect(current.appearance).toHaveBeenCalledWith("dark");
});
it("fences retained callbacks while a local preference write is pending", async () => {
  let finish!: () => void;
  current.language.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const tree = render();
  tree.find((node) => node.props.label === "navigation.chinese").props.onPress();
  tree.find((node) => node.props.label === "navigation.english").props.onPress();
  expect(current.language).toHaveBeenCalledTimes(1);
  expect(render().filter((node) => node.type === "Choice")).toHaveLength(0);
  finish();
  await Promise.resolve();
  expect(render().filter((node) => node.type === "Choice")).toHaveLength(2);
});
it("shows storage failure feedback and allows an explicit later attempt", async () => {
  current.appearance.mockRejectedValueOnce(Error("STORAGE_FAILED"));
  render("appearance")
    .find((node) => node.props.label === "authSettings.appearance.dark")
    .props.onPress();
  await Promise.resolve();
  expect(render("appearance").some((node) => node.props.children === "authSettings.preferenceSaveFailed")).toBe(
    true,
  );
  render("appearance")
    .find((node) => node.props.label === "authSettings.appearance.light")
    .props.onPress();
  await Promise.resolve();
  expect(render("appearance").some((node) => node.props.children === "authSettings.preferenceSaveFailed")).toBe(
    false,
  );
});
