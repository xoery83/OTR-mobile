import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { p1FidelityFixture } from "./p1FidelityFixture";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
import { useP1FixtureMove } from "./useP1FixtureMove";
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as any[],
  effects: [] as (() => void)[],
  scale: 1,
  geometryRegistered: false,
  offset: 0,
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
  useWindowDimensions: () => ({ width: 402, height: 874, fontScale: hooks.scale }),
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
    scrollBy: vi.fn(),
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
  if (!hooks.geometryRegistered) {
    hooks.geometryRegistered = true;
    const fixture = p1FidelityFixture("future");
    const rows = composeDayStream(
      itemsForLocalDate(fixture.projection, "2027-01-16", fixture.zone),
      fixture.instant,
    ).rows;
    const positions: Record<string, number> = {
      "syn-p1-exact": 434,
      "syn-p1-afternoon": 600,
      "syn-p1-viewpoint": 720,
    };
    for (const row of rows)
      if (positions[row.item.event.id] !== undefined) {
        const top = positions[row.item.event.id];
        value.register(
          {
            measureInWindow: (callback: any) => callback(21, top - hooks.offset, 360, 80),
          } as any,
          "2027-01-16",
          row.key,
        );
        const boundary = row.item.event.boundaries.find((b) => b.role === "START");
        if (boundary?.local_time)
          value.register(
            {
              measureInWindow: (callback: any) =>
                callback(21, top + 6 - hooks.offset, 60, 20),
            } as any,
            "2027-01-16",
            `${row.key}:PRIMARY`,
            Number(boundary.local_time.slice(0, 2)) * 60 +
              Number(boundary.local_time.slice(3, 5)),
          );
        const end = row.item.event.boundaries.find(
          (b) => b.role === "END" && b.local_date === "2027-01-16",
        );
        if (end?.local_time)
          value.register(
            {
              measureInWindow: (callback: any) =>
                callback(21, top + 31 - hooks.offset, 60, 20),
            } as any,
            "2027-01-16",
            `${row.key}:SECONDARY`,
            Number(end.local_time.slice(0, 2)) * 60 + Number(end.local_time.slice(3, 5)),
          );
      }
    value.register(
      {
        measureInWindow: (callback: any) => callback(21, 900 - hooks.offset, 360, 80),
      } as any,
      "2027-01-17",
      "day:2027-01-17",
    );
  }
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
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) =>
    setTimeout(() => callback(Date.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) =>
    clearTimeout(id),
  );
  hooks.cursor = 0;
  hooks.slots = [];
  hooks.effects = [];
  hooks.appState = null;
  hooks.scale = 1;
  hooks.geometryRegistered = false;
  hooks.offset = 0;
  list.current.scrollBy.mockImplementation((delta: number) => {
    hooks.offset += delta;
    return true;
  });
  list.current.scrollBy.mockClear();
  list.current.restoreAnchor.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  hooks.slots.forEach((slot) => slot?.cleanup?.());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  expect(list.current.scrollBy).not.toHaveBeenCalled();
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
  move.touchHandlers.onTouchMove(touch(380, 800));
  vi.advanceTimersByTime(13000);
  move.touchHandlers.onTouchEnd(touch(380, 800, 0));
  move = render();
  const modal = move.confirmation as any;
  expect(modal.props.visible).toBe(true);
  const body = modal.props.children.props.children.props.children;
  const header = body[0];
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

it("keeps the line at the finger despite different measured gaps and never restores an anchor", async () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  const walk = (value: any): any[] =>
    !value
      ? []
      : Array.isArray(value)
        ? value.flatMap(walk)
        : typeof value === "object"
          ? [value, ...walk(value.props?.children)]
          : [];
  const line = () =>
    walk(move.overlay).find((node) => node.props?.testID === "p1-move-insertion");
  expect(line().props.style[1].top).toBe(450);
  move.touchHandlers.onTouchMove(touch(200, 500));
  vi.advanceTimersByTime(1500);
  move = render();
  expect(line().props.style[1].top).toBe(500);
  expect(list.current.restoreAnchor).not.toHaveBeenCalled();
  expect(list.current.scrollBy).not.toHaveBeenCalled();
  move.handlers.cancel();
});
it("keeps larger text within the usable viewport without inserting row padding", () => {
  hooks.scale = 3;
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 110 });
  move = render();
  expect("regionStyle" in move).toBe(false);
  const walk = (value: any): any[] =>
    !value
      ? []
      : Array.isArray(value)
        ? value.flatMap(walk)
        : typeof value === "object"
          ? [value, ...walk(value.props?.children)]
          : [];
  const line = walk(move.overlay).find(
    (node) => node.props?.testID === "p1-move-insertion",
  );
  expect(line.props.style[1].top).toBeGreaterThanOrEqual(248);
  move.handlers.cancel();
});
it("confirmation explicitly labels original and destination without a date-only action", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 600));
  vi.advanceTimersByTime(1500);
  move.touchHandlers.onTouchEnd(touch(200, 600, 0));
  move = render();
  const walk = (value: any): any[] =>
    !value
      ? []
      : Array.isArray(value)
        ? value.flatMap(walk)
        : typeof value === "object"
          ? [value, ...walk(value.props?.children)]
          : [];
  const nodes = walk(move.confirmation);
  expect(nodes.some((node) => node.props?.children === "fidelity.moveFrom")).toBe(true);
  expect(nodes.some((node) => node.props?.children === "fidelity.moveTo")).toBe(true);
  expect(nodes.some((node) => node.props?.label === "fidelity.moveDateOnly")).toBe(false);
});

it("middle drag holds the feed still; edge scrolling stops as soon as finger returns", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 500));
  vi.advanceTimersByTime(1000);
  expect(list.current.scrollBy).not.toHaveBeenCalled();
  move.touchHandlers.onTouchMove(touch(200, 800));
  vi.advanceTimersByTime(700);
  expect(list.current.scrollBy).toHaveBeenCalled();
  move.touchHandlers.onTouchMove(touch(200, 500));
  vi.advanceTimersByTime(32);
  const count = list.current.scrollBy.mock.calls.length;
  vi.advanceTimersByTime(500);
  expect(list.current.scrollBy.mock.calls.length).toBe(count);
  move.handlers.cancel();
});

it("a second pickup calibrates fresh geometry after ordinary feed scrolling", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchEnd(touch(200, 450, 0));
  move = render();
  hooks.offset = 100;
  move.handlers.start("syn-p1-exact", { x: 200, y: 350 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 360));
  vi.advanceTimersByTime(100);
  move.touchHandlers.onTouchEnd(touch(200, 360, 0));
  move = render();
  expect((move.confirmation as any).props.visible).toBe(true);
  const header = (move.confirmation as any).props.children.props.children.props
    .children[0];
  header.props.onRight();
  move = render();
  expect(move.previews["syn-p1-exact"].time).toBe("11:00");
});
it("switching precision at a settled interior position does not resnap the selected time", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 500));
  vi.advanceTimersByTime(80);
  move.touchHandlers.onTouchMove(touch(380, 500));
  vi.advanceTimersByTime(80);
  move.touchHandlers.onTouchEnd(touch(380, 500, 0));
  move = render();
  const header = (move.confirmation as any).props.children.props.children.props
    .children[0];
  header.props.onRight();
  move = render();
  expect(move.previews["syn-p1-exact"].time).toBe("12:00");
});
