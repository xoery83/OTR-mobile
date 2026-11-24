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
  useEffect: vi.fn(),
  useEffectEvent: (fn: unknown) => fn,
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
  Modal: "Modal",
  Pressable: "Pressable",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  ScrollView: "ScrollView",
  Platform: { OS: "ios" },
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
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("./GoogleSignInButton", () => ({ GoogleSignInButton: "GoogleButton", GoogleSignInPill: "GooglePill" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "Icon" }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "SheetPanel" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "SheetHeader" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: "SafeAreaProvider", SafeAreaView: "SafeAreaView" }));
vi.mock("./AppleSignInButton", () => ({ AppleSignInButton: "AppleButton" }));

const props = { onAuthenticated: vi.fn(), onBusyChange: vi.fn(), onCancel: vi.fn() };
type Node = { type: unknown; props: Record<string, any> };
function children(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(children);
  if (!value?.props) return [];
  return [value, ...children(value.props.children)];
}
function render(options: Parameters<typeof EmailOtpSignIn>[0] = props) {
  state.cursor = state.refCursor = 0;
  return children(EmailOtpSignIn(options));
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
it("enables verification only for the approved eight-digit OTP", async () => {
  input("account.email", "qa@example.invalid");
  press("auth.sendCode");
  await vi.waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
  for (const code of ["", "123456", "1234567", "123456789", "abcdefgh"]) {
    input("auth.code", code);
    expect(render().find((n) => n.props.label === "auth.verify")!.props.disabled).toBe(
      true,
    );
  }
  input("auth.code", "12345678");
  expect(render().find((n) => n.props.label === "auth.verify")!.props.disabled).toBe(
    false,
  );
  expect(state.verify).not.toHaveBeenCalled();
  expect(props.onAuthenticated).not.toHaveBeenCalled();
});

it("hosts the email submit with the unified Sheet and creates a full-screen challenge only after sending", async () => {
  const hosted = { ...props, hosted: true };
  const before = render(hosted);
  expect(before.some(node => node.type === "SheetPanel")).toBe(true);
  expect(before.some(node => node.props.accessibilityLabel === "auth.sendCode")).toBe(false);
  const email = before.find(node => node.props.accessibilityLabel === "account.email")!;
  email.props.onFocus();
  expect(render(hosted).find(node => node.props.accessibilityLabel === "auth.sendCode")?.props.disabled).toBe(true);
  email.props.onChangeText("qa@example.invalid");
  const field = render(hosted).find(node => node.props.accessibilityLabel === "account.email")!;
  field.props.onSubmitEditing();
  field.props.onSubmitEditing();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(requestSupabaseDevEmailOtp).toHaveBeenCalledOnce();
  const sheet = render(hosted).find(node => node.type === "SheetPanel")!;
  const fullScreen = children(sheet.props.overlay);
  expect(fullScreen[0].props.presentationStyle).toBe("fullScreen");
  expect(fullScreen.some(node => node.props.accessibilityLabel === "auth.code")).toBe(true);
  fullScreen.find(node => node.props.label === "auth.changeEmail")!.props.onPress();
  expect(render(hosted).find(node => node.props.accessibilityLabel === "account.email")?.props.value).toBe("qa@example.invalid");
});

it("refuses the late sent challenge after the hosted Sheet starts closing", async () => {
  let closing = false;
  let finish!: () => void;
  vi.mocked(requestSupabaseDevEmailOtp).mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  const hosted = { ...props, hosted: true, isExitPending: () => closing };
  render(hosted).find(node => node.props.accessibilityLabel === "account.email")!.props.onChangeText("qa@example.invalid");
  render(hosted).find(node => node.props.accessibilityLabel === "account.email")!.props.onSubmitEditing();
  closing = true;
  finish();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(render(hosted).find(node => node.type === "SheetPanel")?.props.overlay).toBeUndefined();
});

it("waits for the native OTP modal to dismiss before cancelling the hosted Sheet", async () => {
  const hosted = { ...props, hosted: true };
  render(hosted).find(node => node.props.accessibilityLabel === "account.email")!.props.onChangeText("qa@example.invalid");
  render(hosted).find(node => node.props.accessibilityLabel === "account.email")!.props.onSubmitEditing();
  await new Promise<void>(resolve => setImmediate(resolve));
  const otp = () => render(hosted).find(node => node.type === "SheetPanel")?.props.overlay;
  expect(otp().props.visible).toBe(true);
  otp().props.onRequestClose();
  expect(otp().props.visible).toBe(false);
  expect(props.onCancel).not.toHaveBeenCalled();
  otp().props.onDismiss();
  expect(props.onCancel).toHaveBeenCalledOnce();
  expect(otp()).toBeUndefined();
});
