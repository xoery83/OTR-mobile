import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";

import { LedgerReviewScreen } from "./LedgerReviewScreen";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};

vi.mock("react-native", () => ({
  Pressable: "button",
  ScrollView: "div",
  SectionList: ({ ListHeaderComponent }: { ListHeaderComponent: ReactNode }) =>
    ListHeaderComponent,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "span",
  View: "div",
}));
vi.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: { headerTitle: () => ReactNode } }) =>
      options.headerTitle(),
  },
  router: { push: vi.fn() },
  useLocalSearchParams: () => ({
    journeyId: "j",
    journeyTitle: "A very long Journey name",
  }),
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "span" }));
vi.mock("@/hooks/useLedgerReview", () => ({
  useLedgerReview: () => ({
    findings: [],
    memberNames: {},
    message: null,
    loading: false,
    rechecking: false,
  }),
}));
vi.mock("./ExpenseConflictList", () => ({ ExpenseConflictList: () => null }));

it("shows Review and the supplied Journey without adding a chooser or data read", () => {
  const html = renderToStaticMarkup(createElement(LedgerReviewScreen));
  expect(html).toContain("Review, A very long Journey name");
  expect(html).toContain("A very long Journey name");
  expect(html).not.toContain("Choose Journey");
});
