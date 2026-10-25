import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useP1FixtureMove } from "./useP1FixtureMove";
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as any[],
  effects: [] as (() => void)[],
  appState: null as null | ((state: string) => void),
}));
vi.mock("react", async (original) => {
  const same = (a?: any[], b?: any[]) =>
    a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  return {
    ...(await original<typeof import("react")>()),
    useRef: (value: any) => {
      const i = hooks.cursor++;
      return (hooks.slots[i] ??= { value: { current: value } }).value;
    },
    useState: (value: any) => {
      const i = hooks.cursor++;
      hooks.slots[i] ??= { value };
      return [
        hooks.slots[i].value,
        (next: any) => {
          hooks.slots[i].value =
            typeof next === "function" ? next(hooks.slots[i].value) : next;
        },
      ];
    },
    useCallback: (callback: any) => {
      hooks.cursor++;
      return callback;
    },
    useEffect: (effect: () => any, deps: any[]) => {
      const i = hooks.cursor++,
        old = hooks.slots[i];
      if (!same(old?.deps, deps))
        hooks.effects.push(() => {
          old?.cleanup?.();
          hooks.slots[i] = { deps, cleanup: effect() };
        });
    },
    useLayoutEffect: (effect: () => any, deps: any[]) => {
      const i = hooks.cursor++,
        old = hooks.slots[i];
      if (!same(old?.deps, deps))
        hooks.effects.push(() => {
          old?.cleanup?.();
          hooks.slots[i] = { deps, cleanup: effect() };
        });
    },
  };
});
vi.mock("react-native", () => ({
  Modal: "modal",
  View: "view",
  StyleSheet: { absoluteFill: {}, create: (x: any) => x },
  useWindowDimensions: () => ({ width: 402, height: 874 }),
  AppState: {
    addEventListener: (_: string, callback: any) => {
      hooks.appState = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("@/ui/controls", () => ({ UiText: "text", UiButton: "button" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "header" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key, formatUiDate: () => "Jan16" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/features/day-feed/P1Row", () => ({ P1Row: () => null }));
vi.mock("./P1FixtureNowMarker", () => ({ P1FixtureNowMarker: () => null }));
const list = {
  current: {
    saveAnchor: vi.fn(() => null),
    restoreAnchor: vi.fn(),
    jumpToDayHeader: vi.fn(),
  },
};
function render(key = "test") {
  hooks.cursor = 0;
  // Hook slots/effects are driven by the repository's deterministic hook harness.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const value = useP1FixtureMove(list, key, 100);
  hooks.effects.splice(0).forEach((effect) => effect());
  return value;
}
const touch = (x: number, y: number, count = 1) =>
  ({
    nativeEvent: {
      pageX: x,
      pageY: y,
      touches: Array.from({ length: count }, () => ({})),
    },
  }) as any;
beforeEach(() => {
  vi.useFakeTimers();
  hooks.cursor = 0;
  hooks.slots = [];
  hooks.effects = [];
  hooks.appState = null;
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  hooks.slots.forEach((slot) => slot?.cleanup?.());
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("stationary hold/release ends immediately without confirmation or a running timer", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  expect(move.active).toBe(true);
  move.touchHandlers.onTouchEnd(touch(200, 450, 0));
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it("host receives move and release after pickup row callbacks have been discarded", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 540));
  vi.advanceTimersByTime(1000);
  move.touchHandlers.onTouchEnd(touch(200, 540, 0));
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  expect(move.previews).toEqual({});
});
it("touch cancellation and app interruption cancel without confirming", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchCancel();
  move = render();
  expect(move.active).toBe(false);
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  hooks.appState?.("inactive");
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(false);
});
it("horizontal precision change alone preserves an off-grid time even near screen edges", () => {
  let move = render();
  move.handlers.start("syn-p1-hills", { x: 200, y: 120 });
  move = render();
  move.touchHandlers.onTouchMove(touch(80, 120));
  vi.advanceTimersByTime(1000);
  move.touchHandlers.onTouchEnd(touch(80, 120, 0));
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(false);
});

it("second finger cancels at touch-down and cannot take over the pickup", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchStart(touch(210, 460, 2));
  move.touchHandlers.onTouchEnd(touch(200, 450, 1));
  move.touchHandlers.onTouchMove(touch(210, 600, 1));
  vi.advanceTimersByTime(1000);
  move.touchHandlers.onTouchEnd(touch(210, 600, 0));
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(false);
  expect(move.previews).toEqual({});
  expect(vi.getTimerCount()).toBe(0);
});

it("new cursor crosses midnight, releases to preview, and confirmation is in-memory only", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 380, y: 250 });
  move = render();
  move.touchHandlers.onTouchMove(touch(380, 500));
  vi.advanceTimersByTime(13000);
  move.touchHandlers.onTouchEnd(touch(380, 500, 0));
  move = render();
  const modal = move.confirmation as any;
  expect(modal.props.visible).toBe(true);
  const body = modal.props.children.props.children.props.children;
  const header = body[0];
  expect(body[3].props.children).toContain("2027-01-17");
  header.props.onRight();
  move = render();
  expect(move.previews["syn-p1-exact"].date).toBe("2027-01-17");
  expect((move.confirmation as any).props.visible).toBe(false);
});

it.each(["cancel", "scene", "pickup"])(
  "stale Confirm cannot apply after %s",
  (action) => {
    let move = render();
    move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
    move = render();
    move.touchHandlers.onTouchMove(touch(200, 600));
    vi.advanceTimersByTime(1500);
    move.touchHandlers.onTouchEnd(touch(200, 600, 0));
    move = render();
    const header = (move.confirmation as any).props.children.props.children.props
      .children[0];
    expect(header.props.rightDisabled).toBe(false);
    const retained = header.props.onRight;
    if (action === "cancel") header.props.onLeft();
    if (action === "scene") move = render("new-scene");
    if (action === "pickup") move.handlers.start("syn-p1-hills", { x: 200, y: 450 });
    retained();
    move = render(action === "scene" ? "new-scene" : "test");
    expect(move.previews).toEqual({});
  },
);

it("host claims the responder only after pickup and releases without the recycled row", () => {
  let move = render();
  expect(move.touchHandlers.onMoveShouldSetResponderCapture()).toBe(false);
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  expect(move.touchHandlers.onMoveShouldSetResponderCapture()).toBe(true);
  move.touchHandlers.onResponderMove(touch(200, 600));
  vi.advanceTimersByTime(1500);
  move.touchHandlers.onResponderRelease();
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(true);
  expect(move.touchHandlers.onMoveShouldSetResponderCapture()).toBe(false);
});

it("draws the insertion line at the measured Reader gap and leaves a highlighted band", async () => {
  const { p1FidelityFixture } = await import("./p1FidelityFixture");
  const { itemsForLocalDate } = await import("@/domain/trip/dayReadModel");
  const { composeDayStream } = await import("@/features/day-feed/composition");
  const fixture = p1FidelityFixture("future");
  const key = composeDayStream(
    itemsForLocalDate(fixture.projection, "2027-01-16", fixture.zone),
    fixture.instant,
  ).rows.find((row) => row.item.event.id === "syn-p1-afternoon")!.key;
  let move = render();
  const nativeRow = {
    measureInWindow: (callback: any) => callback(21, 650, 360, 90),
  } as any;
  move.register(nativeRow, "2027-01-16", key);
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  vi.advanceTimersByTime(60);
  move = render();
  const walk = (value: any): any[] =>
    !value
      ? []
      : Array.isArray(value)
        ? value.flatMap(walk)
        : typeof value === "object"
          ? [value, ...walk(value.props?.children)]
          : [];
  const nodes = walk(move.overlay);
  const line = nodes.find((node) => node.props?.testID === "p1-move-insertion");
  expect(line.props.style[1].top).toBe(650);
  expect(nodes.some((node) => node.props?.style?.[1]?.height === 502)).toBe(true);
  expect(nodes.some((node) => node.props?.style?.[1]?.top === 674)).toBe(true);
  expect(nodes.some((node) => node.props?.children === "10:30")).toBe(true);
  move.handlers.cancel();
});
