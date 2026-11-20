import { afterEach, expect, it, vi } from "vitest";
import Module from "node:module";
import { GoogleSignInButton } from "./GoogleSignInButton";

const native = vi.hoisted(() => ({ get: vi.fn(() => ({} as object | null)) }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, TurboModuleRegistry: native }));
vi.mock("@/ui/controls", () => ({ UiButton: "UiButton" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
afterEach(() => { vi.restoreAllMocks(); native.get.mockReturnValue({}); });

it("renders the native Google control for the unified registered iOS App", () => {
  const modules = Module as unknown as { _load(request: string, ...args: unknown[]): unknown };
  const original = modules._load;
  vi.spyOn(modules, "_load").mockImplementation((request, ...args) => {
    if (request === "expo-constants") return { default: { expoConfig: { ios: { bundleIdentifier: "art.xoery.otr" } } } };
    if (request === "@react-native-google-signin/google-signin") return { GoogleSigninButton: "NativeGoogleButton" };
    return original.call(modules, request, ...args);
  });
  const onPress = vi.fn();
  const button = GoogleSignInButton({ disabled: true, onPress });
  expect(button.type).toBe("NativeGoogleButton");
  expect(button.props.disabled).toBe(true);
  expect(button.props.accessibilityLabel).toBe("auth.continueGoogle");
  expect(button.props.onPress).toBe(onPress);
});

it("keeps the existing unavailable-native fallback without loading the SDK", () => {
  native.get.mockReturnValue(null);
  const onPress = vi.fn();
  const button = GoogleSignInButton({ disabled: false, onPress });
  expect(button.type).toBe("UiButton");
  expect(button.props.label).toBe("auth.continueGoogle");
  expect(button.props.onPress).toBe(onPress);
});
