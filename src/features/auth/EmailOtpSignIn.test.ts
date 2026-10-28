import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Keyboard } from "react-native";
import {
  SupabaseDevAuthError,
  requestSupabaseDevEmailOtp,
} from "@/data/auth/devSupabaseAuth";
import { EmailOtpSignIn } from "./EmailOtpSignIn";

const state = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  verify: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (make: () => unknown) => make(),
  useCallback: (fn: unknown) => fn,
  useRef: (value: unknown) => (state.refs[state.refCursor++] ??= { current: value }),
  useState: (value: unknown) => {
    const index = state.cursor++;
    if (index >= state.values.length) state.values[index] = value;
    return [
      state.values[index],
      (next: unknown) => {
        state.values[index] = next;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  StyleSheet: { create: (v: unknown) => v },
  View: "View",
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("@/data/auth/accountGeneration", () => ({ getAccountGeneration: () => 1 }));
vi.mock("@/data/auth/devProvisionalSignIn", () => ({
  createDevProvisionalSignIn: () => ({ verify: state.verify, cancel: vi.fn() }),
}));
vi.mock("@/data/auth/devSupabaseAuth", async (original) => ({
  ...(await original<typeof import("@/data/auth/devSupabaseAuth")>()),
  requestSupabaseDevEmailOtp: vi.fn(),
}));
vi.mock("@/ui/controls", () => ({
  UiSection: "Section",
  UiText: "Text",
  UiButton: "Button",
}));
vi.mock("@/ui/forms", () => ({ UiTextInput: "Input" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("./GoogleSignInButton", () => ({ GoogleSignInButton: "GoogleButton" }));

const props = { onAuthenticated: vi.fn(), onBusyChange: vi.fn(), onCancel: vi.fn() };
type Node = { type: unknown; props: Record<string, any> };
function children(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(children);
  if (!value?.props) return [];
  return [value, ...children(value.props.children)];
}
function render() {
  state.cursor = state.refCursor = 0;
  return children(EmailOtpSignIn(props));
}
function input(label: string, value: string) {
  render()
    .find((n) => n.props.accessibilityLabel === label)!
    .props.onChangeText(value);
}
function press(label: string) {
  render()
    .find((n) => n.props.label === label)!
    .props.onPress();
}
function expectVisibleFailure(key: string) {
  const nodes = render();
  const index = nodes.findIndex((n) => n.props.accessibilityRole === "alert");
  expect(index).toBeGreaterThan(0);
  expect(nodes[index].props.children).toBe(key);
  expect(index).toBeLessThan(nodes.findIndex((n) => n.type === "Input"));
  expect(nodes[index].props.accessibilityLiveRegion).toBe("polite");
  expect(Keyboard.dismiss).toHaveBeenCalledOnce();
  expect(props.onAuthenticated).not.toHaveBeenCalled();
  expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
}
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  state.values = [];
  state.refs = [];
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", "dev");
  vi.mocked(requestSupabaseDevEmailOtp).mockReset().mockResolvedValue(undefined);
  state.verify.mockReset();
});
it("makes an invalid/expired OTP failure visible before the field without installing a session", async () => {
  input("account.email", "qa@example.invalid");
  press("auth.sendCode");
  await vi.waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
  state.verify.mockRejectedValue(
    new SupabaseDevAuthError("private diagnostic", "invalid_code", 403),
  );
  input("auth.code", "12345678");
  props.onBusyChange.mockClear();
  press("auth.verify");
  await vi.waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
  expectVisibleFailure("auth.invalidCode");
  expect(state.verify).toHaveBeenCalledWith({
    provider: "email_otp",
    email: "qa@example.invalid",
    code: "12345678",
  });
});
it("shows a rate-limited resend visibly and preserves the existing challenge", async () => {
  input("account.email", "qa@example.invalid");
  press("auth.sendCode");
  await vi.waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
  vi.mocked(requestSupabaseDevEmailOtp).mockRejectedValue(
    new SupabaseDevAuthError("private diagnostic", "rate_limited", 429),
  );
  props.onBusyChange.mockClear();
  press("auth.resend");
  await vi.waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
  expectVisibleFailure("auth.rateLimited");
  expect(render().some((n) => n.props.accessibilityLabel === "auth.code")).toBe(true);
  expect(state.verify).not.toHaveBeenCalled();
});
