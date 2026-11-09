import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { P1Detail } from "./P1Detail";
import { lightPalette } from "@/ui/palette";
import { t } from "@/ui/locale";

const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  cursor: 0,
  generation: 5,
  focus: null as null | (() => () => void),
  principal: vi.fn(),
  read: vi.fn(),
  repository: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.hooks)) state.hooks[index] = initial;
    return [
      state.hooks[index],
      (next: unknown) => {
        state.hooks[index] =
          typeof next === "function"
            ? (next as (value: unknown) => unknown)(state.hooks[index])
            : next;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: () => state.generation,
}));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  ScrollView: (p: any) => createElement("div", null, p.children),
  Pressable: (p: any) => createElement("button", null, p.children),
  useWindowDimensions: () => ({ fontScale: 1 }),
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
}));
const tripId = "b15408f3-5bda-4a09-a95c-37b9f475871f";
const itemId = "ba095b25-e4ee-4b4c-8bf8-065065df6bce";
vi.mock("expo-router", () => ({
  router: { push: vi.fn(), back: vi.fn() },
  useLocalSearchParams: () => ({ tripId, itemId }),
  useFocusEffect: (callback: () => () => void) => {
    state.focus = callback;
  },
  Stack: {
    Screen: () => null,
    Toolbar: Object.assign((p: any) => createElement("div", null, p.children), {
      Button: () => null,
    }),
  },
}));
vi.mock("@/components/navigationChrome", () => ({
  NavigationContentFrame: (p: any) => p.children,
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("./ImmersiveActions", () => ({ ImmersiveActions: () => null }));
vi.mock("./P1PlanEditor", () => ({ P1PlanEditor: () => null }));
vi.mock("./LocalItemImportOriginals", () => ({ LocalItemImportOriginals: () => null }));
vi.mock("./useDetailCloudRefresh", () => ({ useDetailCloudRefresh: () => undefined }));
vi.mock("./TripViewContext", () => ({
  useTripView: () => ({ reportManualOutcome: vi.fn() }),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => undefined,
}));
vi.mock("@/data/auth/localTripAccess", () => ({
  readLocalTripPrincipal: () => state.principal(),
  readTripDayFeed: async () => ({ trip: state.read }),
  createDefaultManualPlanRepository: () => state.repository(),
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => createElement("button", null, p.label),
}));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => lightPalette,
  useThemedStyles: (fn: any) => fn(lightPalette),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
function render() {
  state.cursor = 0;
  return renderToStaticMarkup(createElement(P1Detail));
}
async function settle() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}
function record() {
  return {
    itemId,
    tripId,
    itemRevision: 2,
    family: "P1",
    hidden: false,
    status: "planned",
    localState: "PENDING",
    title: "Guest saved plan",
    description: "Retained note",
    schedule: {
      start: {
        localDate: "2026-11-05",
        localTime: "07:00",
        quality: "ESTIMATED",
        comparable: false,
      },
    },
    place: { authoredLabel: "Garden" },
    participation: { mode: "WHOLE_GROUP", personIds: [] },
    documentSummaries: [],
  };
}
beforeEach(() => {
  state.hooks = [];
  state.cursor = 0;
  state.generation = 5;
  state.focus = null;
  state.principal
    .mockReset()
    .mockResolvedValue({ kind: "ACCOUNT", accountId: "account" });
  const scope = { accountId: "account", tripId, generation: 5 };
  state.read.mockReset().mockResolvedValue({
    scope,
    observed: null,
    localManual: { scope, items: [record()] },
  });
  state.repository.mockReset().mockRejectedValue(Error("read only"));
});
it("normal Guest P1 detail renders retained pending facts without a cloud-waiting dot", async () => {
  state.principal.mockResolvedValue({ kind: "GUEST", localId: "account" });
  const source = await state.read();
  const before = JSON.stringify(source);
  render();
  state.focus!();
  await settle();
  const html = render();
  expect(html).toContain("Guest saved plan");
  expect(html).not.toContain("●");
  expect(JSON.stringify(source)).toBe(before);
  expect(source.localManual.items[0].localState).toBe("PENDING");
});
it.each(["ACCOUNT", "UNKNOWN", "OTHER_GUEST"])(
  "%s principal never receives Guest-only pending suppression",
  async (kind) => {
    if (kind === "UNKNOWN") state.principal.mockResolvedValue(null);
    if (kind === "OTHER_GUEST")
      state.principal.mockResolvedValue({ kind: "GUEST", localId: "different-guest" });
    render();
    state.focus!();
    await settle();
    expect(render()).toContain("●");
  },
);
it("a deferred old Guest principal cannot publish detail after a generation change", async () => {
  let resolve!: (value: unknown) => void;
  state.principal.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render();
  const close = state.focus!();
  state.generation = 6;
  resolve?.({ kind: "GUEST", localId: "account" });
  await settle();
  expect(render()).not.toContain("Guest saved plan");
  close();
});

it("a retired Guest read cannot hide the next Account's pending detail", async () => {
  let resolve!: (value: unknown) => void;
  state.principal.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render();
  const close = state.focus!();
  close();
  state.generation = 6;
  const scope = { accountId: "next-account", tripId, generation: 6 };
  state.read.mockResolvedValue({
    scope,
    observed: null,
    localManual: { scope, items: [{ ...record(), title: "Account pending plan" }] },
  });
  render();
  state.focus!();
  await settle();
  expect(render()).toContain("Account pending plan");
  expect(render()).toContain("●");
  resolve({ kind: "GUEST", localId: "account" });
  await settle();
  expect(render()).toContain("Account pending plan");
  expect(render()).toContain("●");
});

it("keeps principal recovery errors unavailable rather than treating them as Guest", async () => {
  state.principal.mockRejectedValue(Error("LOCAL_PRINCIPAL_RECOVERY_REQUIRED"));
  render();
  state.focus!();
  await settle();
  const html = render();
  expect(html).not.toContain("Guest saved plan");
  expect(html).toContain(t("dayFeed.unavailable"));
  expect(state.read).not.toHaveBeenCalled();
});
