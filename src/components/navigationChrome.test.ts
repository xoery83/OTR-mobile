import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { bottomBarVisible } from "./bottomBarVisibility";
import { NavigationContextTitle } from "./navigationChrome";

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
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
