import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { bottomBarVisible } from "./bottomBarVisibility";
import {
  NavigationContextTitle,
  NavigationContentFrame,
  navigationContentFrameOptions,
} from "./navigationChrome";

const chrome = vi.hoisted(() => ({ headerHeight: 91 }));
vi.mock("expo-router/react-navigation", () => ({
  useHeaderHeight: () => chrome.headerHeight,
}));

vi.mock("@/ui/theme", () => ({
  useUiTheme: () => ({ textPrimary: "foreground", textSecondary: "secondary" }),
  useThemedStyles: (factory: (colors: unknown) => unknown) =>
    factory({ textPrimary: "foreground", textSecondary: "secondary" }),
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  useColorScheme: () => "light",
  Text: "text",
  View: "view",
}));

describe("navigation chrome", () => {
  it("shows tabs only on root destinations and the Journey workspace", () => {
    for (const path of ["/", "/expenses", "/expenses/journey/j1", "/trip", "/capture"])
      expect(bottomBarVisible(path), path).toBe(true);
    for (const path of [
      "/expenses/analysis",
      "/expenses/review",
      "/expenses/search",
      "/expenses/expense/e1",
      "/expenses/new",
      "/expenses/all-journeys",
      "/expenses/currency",
      "/expenses/review/f1",
      "/expenses/transfer/t1",
      "/expenses/settlement-statement",
      "/expenses/settlement-update",
    ])
      expect(bottomBarVisible(path), path).toBe(false);
    expect(bottomBarVisible("/expenses")).toBe(true); // returning restores the bar
  });

  it("keeps both context lines truncated and accessible", () => {
    const title = NavigationContextTitle({
      title: "Review",
      subtitle: "A very long Journey name",
    });
    const lines = title.props.children as ReactElement<{ numberOfLines?: number }>[];
    expect(title.props.accessibilityLabel).toBe("Review, A very long Journey name");
    expect(lines.map((line) => line?.props.numberOfLines)).toEqual([1, 1]);
  });
});

it("owns the measured native-header inset once and clips collapsing Journey chrome below it", () => {
  expect(navigationContentFrameOptions.headerTransparent).toBe(true);
  for (const height of [91, 144]) {
    chrome.headerHeight = height;
    const frame = NavigationContentFrame({ children: "Journey context → segment" });
    expect(frame.props.style[1]).toEqual({ paddingTop: height });
    expect(frame.props.children.props.style).toEqual({ flex: 1, overflow: "hidden" });
    expect(frame.props.children.props.children).toBe("Journey context → segment");
  }
});
