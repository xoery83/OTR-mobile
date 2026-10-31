import { beforeEach, expect, it, vi } from "vitest";
import { McpConsentError } from "@/data/auth/mcpOAuthConsentRepository";
import { McpOAuthConsent } from "./McpOAuthConsent";
const state = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: vi.fn(),
  useRef: (value: unknown) => (state.refs[state.refCursor++] ??= { current: value }),
  useState: (value: unknown) => {
    const index = state.cursor++;
    if (index >= state.values.length)
      state.values[index] = typeof value === "function" ? value() : value;
    return [
      state.values[index],
      (next: unknown) => {
        state.values[index] = next;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  ScrollView: "Scroll",
  View: "View",
  Text: "Text",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiSection: "Section" }));
vi.mock("@/ui/textInput", () => ({ UiTextInput: "Input" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
type Node = {
  type: unknown;
  props: {
    children?: unknown;
    label?: string;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    onPress?: () => void;
    onChangeText?: (v: string) => void;
    disabled?: boolean;
  };
};
function nodes(raw: unknown): Node[] {
  if (Array.isArray(raw)) return raw.flatMap(nodes);
  if (!raw || typeof raw !== "object" || !("props" in raw)) return [];
  const node = raw as Node;
  return [node, ...nodes(node.props.children)];
}
function fixture() {
  const repo = {
    requestCode: vi.fn(async () => undefined),
    verifyCode: vi.fn(),
    load: vi.fn(),
    decide: vi.fn(),
    close: vi.fn(async () => undefined),
  };
  const navigate = vi.fn();
  function render() {
    state.cursor = state.refCursor = 0;
    return nodes(McpOAuthConsent({ repository: repo, navigate }));
  }
  const fill = (label: string, text: string) =>
    render().find((n) => n.props.accessibilityLabel === label)!.props.onChangeText!(text);
  const press = (label: string) =>
    render().find((n) => n.props.label === label)!.props.onPress!();
  return { repo, navigate, render, fill, press };
}
beforeEach(() => {
  state.values = [];
  state.refs = [];
  vi.clearAllMocks();
});
it("shows invalid/expired OTP as a localized alert and never proceeds", async () => {
  const q = fixture();
  q.fill("oauthConsent.email", "qa@example.invalid");
  q.press("oauthConsent.send");
  await vi.waitFor(() =>
    expect(
      q.render().some((n) => n.props.accessibilityLabel === "oauthConsent.code"),
    ).toBe(true),
  );
  q.repo.verifyCode.mockRejectedValueOnce(new McpConsentError("OTP_FAILED"));
  q.fill("oauthConsent.code", "12345678");
  q.press("oauthConsent.verify");
  await vi.waitFor(() =>
    expect(
      q.render().find((n) => n.props.accessibilityRole === "alert")?.props.children,
    ).toBe("oauthConsent.OTP_FAILED"),
  );
  expect(q.repo.decide).not.toHaveBeenCalled();
  expect(q.navigate).not.toHaveBeenCalled();
});
it("requires an explicit decision then normal session cleanup before redirect", async () => {
  const q = fixture(),
    events: string[] = [];
  q.fill("oauthConsent.email", "qa@example.invalid");
  q.press("oauthConsent.send");
  await vi.waitFor(() =>
    expect(
      q.render().some((n) => n.props.accessibilityLabel === "oauthConsent.code"),
    ).toBe(true),
  );
  q.repo.verifyCode.mockResolvedValueOnce({
    kind: "CONSENT",
    accountId: "unit",
    clientName: "Unit Client",
  });
  q.fill("oauthConsent.code", "12345678");
  q.press("oauthConsent.verify");
  await vi.waitFor(() =>
    expect(q.render().some((n) => n.props.label === "oauthConsent.allow")).toBe(true),
  );
  expect(q.repo.decide).not.toHaveBeenCalled();
  q.repo.decide.mockResolvedValueOnce({
    kind: "REDIRECT",
    url: "https://chatgpt.com/connector/oauth/unit?code=unit",
  });
  q.repo.close.mockImplementationOnce(async () => {
    events.push("cleanup");
  });
  q.navigate.mockImplementationOnce(() => {
    events.push("navigate");
  });
  q.press("oauthConsent.allow");
  await vi.waitFor(() => expect(q.navigate).toHaveBeenCalledOnce());
  expect(q.repo.decide).toHaveBeenCalledWith(true);
  expect(events).toEqual(["cleanup", "navigate"]);
});
it("keeps rate-limit errors visible and invalid email submit disabled", async () => {
  const q = fixture();
  q.fill("oauthConsent.email", "invalid");
  expect(
    q.render().find((n) => n.props.label === "oauthConsent.send")?.props.disabled,
  ).toBe(true);
  q.fill("oauthConsent.email", "qa@example.invalid");
  q.repo.requestCode.mockRejectedValueOnce(new McpConsentError("RATE_LIMIT"));
  q.press("oauthConsent.send");
  await vi.waitFor(() =>
    expect(
      q.render().find((n) => n.props.accessibilityRole === "alert")?.props.children,
    ).toBe("oauthConsent.RATE_LIMIT"),
  );
  expect(q.navigate).not.toHaveBeenCalled();
});
