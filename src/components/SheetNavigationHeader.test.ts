import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { SheetNavigationHeader } from "./SheetNavigationHeader";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};

vi.mock("expo-router", async () => {
  const { createElement } = await import("react");
  const Toolbar = ({ placement, children }: { placement: string; children: ReactNode }) =>
    createElement("div", { "data-placement": placement }, children);
  return {
    Stack: {
      Screen: () => null,
      Toolbar: Object.assign(Toolbar, {
        Button: ({ icon, accessibilityLabel, disabled }: {
          icon: string;
          accessibilityLabel: string;
          disabled?: boolean;
        }) => createElement("button", { "data-icon": icon, "aria-label": accessibilityLabel, disabled }),
      }),
    },
  };
});
vi.mock("./SheetHost", () => ({ useSheetMotion: () => ({ exitPending: false }) }));
vi.mock("expo-router/react-navigation", () => ({}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));

it("places the one Close button in the native leading toolbar at the root", () => {
  const html = renderToStaticMarkup(
    createElement(SheetNavigationHeader, { title: "Root", level: "root", onLeadingAction: vi.fn() }),
  );
  expect(html).toBe('<div data-placement="left"><button data-icon="xmark" aria-label="common.close"></button></div>');
});

it("uses native Back and a labelled trailing confirmation on a child", () => {
  const html = renderToStaticMarkup(
    createElement(SheetNavigationHeader, {
      title: "Edit",
      level: "child",
      onLeadingAction: vi.fn(),
      action: { label: "Save", onPress: vi.fn(), disabled: true },
    }),
  );
  expect(html).toContain('<div data-placement="left"><button data-icon="chevron.left" aria-label="common.back"></button></div>');
  expect(html).toContain('<div data-placement="right"><button data-icon="checkmark" aria-label="Save" disabled=""></button></div>');
  expect(html).not.toContain("xmark");
});
