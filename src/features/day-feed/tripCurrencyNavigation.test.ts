import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
// Exercise the router actually bundled by the installed Expo version.
import {
  StackRouter,
  StackActions,
} from "expo-router/build/react-navigation/routers/StackRouter";
import RootLayout from "../../../app/_layout";
import LedgerLayout from "../../../app/(tabs)/expenses/_layout";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};

const startup = vi.hoisted(() => ({ ready: true }));
// Route registration is checked after startup; the pending state is tested below.
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) =>
      react.useState(initial === false ? startup.ready : initial),
  };
});

const screens = vi.hoisted(
  () => [] as { name: string; options?: Record<string, unknown> }[],
);
vi.mock("expo-router", async () => {
  const { Fragment, createElement } = await import("react");
  const content = ({ children }: { children: ReactNode }) =>
    createElement(Fragment, null, children);
  return {
    Stack: Object.assign(content, {
      Screen: (props: (typeof screens)[number]) => {
        screens.push(props);
        return null;
      },
    }),
    ThemeProvider: content,
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
  };
});
vi.mock("react-native", () => ({ useColorScheme: () => "light" }));
vi.mock("@tanstack/react-query", () => ({
  QueryClient: class {},
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./TripViewContext", () => ({
  TripViewProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/native/uiLocalePreference", () => ({ hydrateUiLocale: vi.fn() }));
vi.mock("@/data/bootstrap/bootstrapApplication", () => ({
  bootstrapApplication: vi.fn(),
}));
vi.mock("@/data/bootstrap/defaultBootstrapDependencies", () => ({
  defaultBootstrapDependencies: {},
  subscribeOperationalSyncLifecycle: vi.fn(),
}));
beforeEach(() => {
  startup.ready = true;
  screens.length = 0;
  vi.stubGlobal("__DEV__", false);
});

it("keeps native parent-Stack history and exact Trip context when Currency goes Back", () => {
  renderToStaticMarkup(createElement(RootLayout));
  const options = {
    routeNames: screens.map(({ name }) => name),
    routeParamList: {},
    routeGetIdList: {},
  };
  const registered = screens.find(({ name }) => name === "trip-currency");
  expect(registered?.options?.headerShown).toBe(true);
  expect(registered?.options?.headerBackVisible).not.toBe(false);
  const router = StackRouter({ initialRouteName: "(tabs)" });
  let state = router.getInitialState(options);
  const dispatch = (action: Parameters<typeof router.getStateForAction>[1]) => {
    const next = router.getStateForAction(state, action, options);
    if (!next || next.stale !== false) throw new Error("Expected a complete Stack state");
    state = next;
  };
  dispatch(
    StackActions.push("trip-home", {
      tripId: "qa-trip",
      view: "home",
      date: "2026-12-30",
    }),
  );
  const original = state.routes[state.index];
  dispatch(StackActions.push("trip-currency", { journeyId: "qa-trip" }));
  expect(state.routes[state.index].params).toEqual({ journeyId: "qa-trip" });
  dispatch({ type: "GO_BACK" });
  expect(state.routes[state.index]).toEqual(original);
  expect(state.routes).toHaveLength(2);
});

it("reproduces a settings-only nested Ledger stack having no native Back target", () => {
  renderToStaticMarkup(createElement(LedgerLayout));
  const options = {
    routeNames: screens.map(({ name }) => name),
    routeParamList: {},
    routeGetIdList: {},
  };
  const router = StackRouter({});
  const nested = router.getRehydratedState(
    { stale: true, routes: [{ name: "settings", params: { journeyId: "qa-trip" } }] },
    options,
  );
  expect(nested.index).toBe(0);
  expect(router.getStateForAction(nested, { type: "GO_BACK" }, options)).toBeNull();
});

it("does not mount Trip consumers before principal and database startup completes", () => {
  startup.ready = false;
  expect(renderToStaticMarkup(createElement(RootLayout))).toBe("");
  expect(screens).toEqual([]);
});
