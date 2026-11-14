import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import Route from "../../../app/import-manual";
const f = vi.hoisted(() => ({
  generation: 1,
  params: { originGeneration: "1", tripId: "" },
  trips: [{ id: "a", name: "Trip A" }],
  slots: [] as any[],
  cursor: 0,
  queued: [] as (() => void)[],
  list: vi.fn(),
  back: vi.fn(),
}));
vi.mock("react", async (load) => ({
  ...(await load<typeof import("react")>()),
  useSyncExternalStore: () => f.generation,
  useState: (initial: any) => {
    const n = f.cursor++;
    f.slots[n] ??= { value: initial };
    return [
      f.slots[n].value,
      (value: any) => {
        f.slots[n].value = value;
      },
    ];
  },
  useEffect: (effect: () => any, deps: any[]) => {
    const n = f.cursor++;
    if (!f.slots[n] || f.slots[n].deps.some((v: any, i: number) => v !== deps[i])) {
      f.slots[n]?.cleanup?.();
      f.slots[n] = { deps };
      f.queued.push(() => {
        f.slots[n].cleanup = effect();
      });
    }
  },
}));
vi.mock("expo-router", () => ({
  router: { back: f.back },
  Stack: { Screen: "Screen" },
  useLocalSearchParams: () => f.params,
}));
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "Scroll",
  StyleSheet: { create: (v: any) => v },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => f.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/auth/accountRequestContext", () => ({
  captureAccountRequestContext: async () => ({
    generation: f.generation,
    accountId: "account",
  }),
}));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => "account",
}));
vi.mock("@/data/operations/captureTripPrior", () => ({
  listCaptureTripPriors: (...args: any[]) => f.list(...args),
}));
vi.mock("@/features/day-feed/ManualItineraryContent", () => ({
  ManualItineraryContent: "Manual",
}));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "Header" }));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiText: "Text" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
let key: string | null = null;
function render(): ReactNode {
  const outer = Route();
  if (outer.key !== key) {
    f.slots.forEach((slot) => slot?.cleanup?.());
    f.slots = [];
    f.queued = [];
    key = String(outer.key);
  }
  f.cursor = 0;
  const node = (outer.type as (props: any) => ReactNode)(outer.props);
  f.queued.splice(0).forEach((effect) => effect());
  return node;
}
function nodes(node: ReactNode, type: string): any[] {
  if (!isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node.props] : []),
    ...Children.toArray((node.props as any).children).flatMap((child) =>
      nodes(child, type),
    ),
  ];
}
const flush = async () => {
  for (let n = 0; n < 12; n++) await Promise.resolve();
};
beforeEach(() => {
  f.slots.forEach((slot) => slot?.cleanup?.());
  f.slots = [];
  f.queued = [];
  key = null;
  f.cursor = 0;
  f.generation = 1;
  f.params = { originGeneration: "1", tripId: "" };
  f.list.mockReset().mockResolvedValue(f.trips);
  f.back.mockReset();
});
it("unassigned Results require an explicit authorized Trip before opening the existing manual forms", async () => {
  render();
  await flush();
  let node = render();
  expect(nodes(node, "Manual")).toHaveLength(0);
  nodes(node, "Button")[0].onPress();
  node = render();
  expect(nodes(node, "Manual")[0]).toMatchObject({
    tripId: "a",
    initialDate: null,
    generation: 1,
  });
  expect(f.back).not.toHaveBeenCalled();
  nodes(node, "Manual")[0].onSaved("independent-item");
  expect(f.back).toHaveBeenCalledOnce();
});
it("an unavailable assigned Trip never silently chooses a different Trip", async () => {
  f.params.tripId = "not-authorized";
  render();
  await flush();
  const node = render();
  expect(nodes(node, "Manual")).toHaveLength(0);
  expect(nodes(node, "Button")).toHaveLength(0);
  expect(nodes(node, "Text")[0].children).toBe("capture.results.manualUnavailable");
});
it("stale generation cannot read Trip choices or keep the old manual form", async () => {
  f.params.tripId = "a";
  render();
  await flush();
  expect(nodes(render(), "Manual")).toHaveLength(1);
  f.generation = 2;
  f.list.mockClear();
  expect(nodes(render(), "Manual")).toHaveLength(0);
  await flush();
  expect(f.list).not.toHaveBeenCalled();
});
