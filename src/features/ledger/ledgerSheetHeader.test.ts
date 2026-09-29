import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";

import { LedgerSheetHeader } from "./LedgerSheetHeader";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};

vi.mock("react-native", () => ({
  Pressable: "button",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "span",
  View: "div",
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "span" }));

it("renders one dismissal action unless a distinct right action is provided", () => {
  const close = renderToStaticMarkup(
    createElement(LedgerSheetHeader, { title: "Category", onLeft: () => undefined }),
  );
  expect(close.match(/<button/g)).toHaveLength(1);
  expect(close).not.toContain("Done");
  const apply = renderToStaticMarkup(
    createElement(LedgerSheetHeader, {
      title: "Filter Expenses",
      leftLabel: "Cancel",
      onLeft: () => undefined,
      rightLabel: "Apply",
      onRight: () => undefined,
    }),
  );
  expect(apply.match(/<button/g)).toHaveLength(2);
  expect(apply).toContain("Apply");
});
