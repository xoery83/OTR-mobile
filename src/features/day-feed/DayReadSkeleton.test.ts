import { createElement } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { DayReadSkeleton } from "./DayReadSkeleton";
import { darkPalette, lightPalette } from "@/ui/palette";
const state = vi.hoisted(() => ({ colors: {} as any, nodes: [] as any[] }));
vi.mock("react-native", () => ({
  View: (p: any) => {
    state.nodes.push(p);
    return createElement("div", null, p.children);
  },
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: (fn: any) => fn(state.colors) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
it.each([lightPalette, darkPalette])(
  "uses semantic bars, one accessible loading status and no fake actions",
  (colors) => {
    state.colors = colors;
    state.nodes = [];
    renderToStaticMarkup(createElement(DayReadSkeleton));
    const root = state.nodes.find((n) => n.testID === "day-detail-skeleton");
    expect(root).toMatchObject({
      accessible: true,
      accessibilityRole: "progressbar",
      accessibilityState: { busy: true },
      accessibilityLabel: "dayFeed.loading",
    });
    expect(state.nodes.filter((n) => n.onPress)).toHaveLength(0);
    expect(
      state.nodes.some(
        (n) =>
          Array.isArray(n.style) &&
          n.style.some((s: any) => s?.backgroundColor === colors.controlTrack),
      ),
    ).toBe(true);
  },
);
