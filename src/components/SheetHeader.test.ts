import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";

import { SheetHeader } from "./SheetHeader";

const ui = vi.hoisted(() => ({ fontScale: 1 }));

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};

vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  return {
    Pressable: ({
      accessibilityState,
      style,
      ...props
    }: {
      accessibilityState?: { disabled?: boolean };
      style?: Record<string, unknown> | (Record<string, unknown> | false)[];
    }) =>
      createElement("button", {
        ...props,
        "aria-disabled": accessibilityState?.disabled,
        style: Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
      }),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: "span",
    View: ({
      style,
      ...props
    }: {
      style?: Record<string, unknown> | (Record<string, unknown> | false)[];
    }) =>
      createElement("div", {
        ...props,
        style: Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
      }),
    useWindowDimensions: () => ({ fontScale: ui.fontScale }),
  };
});
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "span" }));

it("renders one dismissal action unless a distinct right action is provided", () => {
  const close = renderToStaticMarkup(
    createElement(SheetHeader, { title: "Category", onLeft: () => undefined }),
  );
  expect(close.match(/<button/g)).toHaveLength(1);
  expect(close).not.toContain("Done");
  const apply = renderToStaticMarkup(
    createElement(SheetHeader, {
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

it("keeps ordinary titles centered, semibold and on one line", () => {
  const html = renderToStaticMarkup(
    createElement(SheetHeader, {
      title: "A very long category title for a narrow sheet",
      leftLabel: "Cancel",
      onLeft: () => undefined,
      rightLabel: "Confirm",
      onRight: () => undefined,
    }),
  );
  expect(html).toMatch(/font-size:17px;font-weight:600;text-align:center/);
  expect(html).toContain('numberOfLines="1"');
  expect(html).toContain("Confirm");
});

it("keeps disabled actions in place with the same text style", () => {
  const html = renderToStaticMarkup(
    createElement(SheetHeader, {
      title: "Filter Expenses",
      leftLabel: "Cancel",
      onLeft: () => undefined,
      rightLabel: "Apply",
      onRight: () => undefined,
      rightDisabled: true,
    }),
  );
  expect(html.match(/<button/g)).toHaveLength(2);
  expect(html).toMatch(/aria-disabled="true"/);
  expect(html).toMatch(/opacity:0\.45/);
  expect(html).toMatch(/font-size:16px;font-weight:600/);
});

it("gives large accessibility text a readable two-line title", () => {
  ui.fontScale = 2.1;
  try {
    const html = renderToStaticMarkup(
      createElement(SheetHeader, {
        title: "Choose currency",
        onLeft: () => undefined,
      }),
    );
    expect(html).toMatch(/font-size:18px;font-weight:600;text-align:center/);
    expect(html).toContain('numberOfLines="2"');
    expect(html.match(/<button/g)).toHaveLength(1);
  } finally {
    ui.fontScale = 1;
  }
});

it("uses undecorated actions with adequate targets and equal title flanks", () => {
  const html = renderToStaticMarkup(
    createElement(SheetHeader, {
      title: "Filters",
      leftLabel: "Back",
      onLeft: () => undefined,
      rightLabel: "Applying…",
      onRight: () => undefined,
    }),
  );
  const actions = html.match(/<button[^>]*>/g)!;
  expect(actions).toHaveLength(2);
  for (const action of actions) {
    expect(action).toContain("min-height:44px");
    expect(action).toContain("min-width:72px");
    expect(action).not.toMatch(/background|border|shadow/);
  }
  expect(html.match(/width:112px/g)).toHaveLength(2);
});
