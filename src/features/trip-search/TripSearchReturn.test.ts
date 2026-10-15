import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import SearchTripRoute from "../../../app/search-trip";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  canBack: true,
  replace: vi.fn(),
  button: null as any,
  options: null as any,
}));
vi.mock("expo-router", async () => {
  const { createElement } = await import("react");
  const Toolbar = Object.assign((p: any) => createElement("nav", {}, p.children), {
    Button: (p: any) => {
      state.button = p;
      return createElement("button", {}, p.accessibilityLabel);
    },
  });
  return {
    router: { replace: state.replace, canGoBack: () => state.canBack },
    Stack: {
      Toolbar,
      Screen: (p: any) => {
        state.options = p.options;
        return null;
      },
    },
  };
});
vi.mock("@/features/day-feed/TripScreen", () => ({
  TripScreen: () => "Owning Trip Home",
}));
vi.mock("@/components/navigationChrome", () => ({
  NavigationContentFrame: (p: any) => p.children,
  navigationContentFrameOptions: { headerTransparent: true },
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
beforeEach(() => {
  state.canBack = true;
  state.button = null;
  state.options = null;
  vi.clearAllMocks();
});
const render = () => renderToStaticMarkup(createElement(SearchTripRoute));
it("reuses the owning Trip screen with native Root Stack Back and no custom context writes", () => {
  expect(render()).toContain("Owning Trip Home");
  expect(state.options.headerBackVisible).toBe(true);
  expect(state.options.headerTransparent).toBe(true);
  expect(state.button).toBeNull();
  expect(state.replace).not.toHaveBeenCalled();
});
it("a direct cold entry without a back stack offers a safe My Trips fallback", () => {
  state.canBack = false;
  expect(render()).toContain("Back");
  expect(state.options.headerBackVisible).toBe(false);
  state.button.onPress();
  expect(state.replace).toHaveBeenCalledWith({
    pathname: "/trip",
    params: { view: "trips" },
  });
});
