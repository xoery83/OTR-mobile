import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { bottomBarVisible } from "./bottomBarVisibility";
import { HeaderIconAction, NavigationContextTitle } from "./navigationChrome";

vi.mock("react-native", () => ({
  Pressable: "button",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "text",
  View: "view",
}));
vi.mock("./AppIcon", () => ({ AppIcon: "icon" }));

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

  it("keeps both context lines truncated and labels icon actions", () => {
    const title = NavigationContextTitle({
      title: "Review",
      subtitle: "A very long Journey name",
    });
    const lines = title.props.children as ReactElement<{ numberOfLines?: number }>[];
    expect(title.props.accessibilityLabel).toBe("Review, A very long Journey name");
    expect(lines.map((line) => line?.props.numberOfLines)).toEqual([1, 1]);
    const action = HeaderIconAction({
      label: "Filter expenses",
      name: "line.3.horizontal.decrease",
      onPress: vi.fn(),
    });
    expect(action.props.accessibilityLabel).toBe("Filter expenses");
    expect(action.props.style[0]).toMatchObject({ minHeight: 44, minWidth: 44 });
  });
});
