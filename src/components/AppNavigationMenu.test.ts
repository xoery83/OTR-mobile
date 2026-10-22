import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { AppNavigationMenu } from "./AppNavigationMenu";
const state = vi.hoisted(() => ({ setVisible: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => ({ current: null }),
  useState: (value: unknown) => [
    typeof value === "boolean" ? true : value,
    state.setVisible,
  ],
}));
vi.mock("react-native", () => ({
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
  useWindowDimensions: () => ({ height: 800, width: 390 }),
}));
vi.mock("./AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("expo-router", () => ({ Stack: {} }));
vi.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 80 }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
function rows(node: ReactNode): any[] {
  if (!isValidElement<{ children?: ReactNode; accessibilityRole?: string }>(node))
    return [];
  return [
    ...(node.type === "Pressable" && node.props.accessibilityRole === "button"
      ? [node]
      : []),
    ...Children.toArray(node.props.children).flatMap(rows),
  ];
}
beforeEach(() => state.setVisible.mockReset());
it("disabled future menu entries are inaccessible to presses without closing the menu", () => {
  const disabled = vi.fn(),
    enabled = vi.fn();
  const tree = AppNavigationMenu({
    identity: { primary: "QA" },
    onIdentityPress: vi.fn(),
    sections: [
      [
        { label: "Documents", icon: "doc.text", disabled: true, onPress: disabled },
        { label: "Members", icon: "person.2", onPress: enabled },
      ],
    ],
  });
  const targets = rows(tree);
  const future = targets.find((row) => String(row.key).endsWith("Documents"));
  expect(future.props.disabled).toBe(true);
  expect(future.props.accessibilityState.disabled).toBe(true);
  future.props.onPress();
  expect(disabled).not.toHaveBeenCalled();
  expect(state.setVisible).not.toHaveBeenCalled();
  targets.find((row) => String(row.key).endsWith("Members")).props.onPress();
  expect(enabled).toHaveBeenCalledOnce();
  expect(state.setVisible).toHaveBeenCalledWith(false);
});
