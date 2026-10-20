import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { setUiLocale } from "@/ui/locale";
import { t } from "./copy";
import { choiceFocusKey } from "./model";
const require = createRequire(import.meta.url);
require.extensions[".png"] = (module) => {
  module.exports = 1;
};
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
const harness = vi.hoisted(() => ({
  states: [] as any[],
  cursor: 0,
  refs: [] as any[],
  refCursor: 0,
  nodes: [] as any[],
  width: 402,
  targetX: 0,
  fontScale: 1,
  scheme: "light",
  focus: null as string | null,
  updates: [] as any[],
  cleanup: [] as (() => void)[],
  background: [] as ((status: string) => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = harness.cursor++;
    harness.states[i] ??= initial;
    return [
      harness.states[i],
      (value: any) => {
        harness.states[i] =
          typeof value === "function" ? value(harness.states[i]) : value;
      },
    ];
  },
  useReducer: (reducer: any, arg: any, init: any) => {
    const i = harness.cursor++;
    harness.states[i] ??= init(arg);
    return [
      harness.states[i],
      (action: any) => {
        harness.states[i] = reducer(harness.states[i], action);
      },
    ];
  },
  useRef: (value: any) => {
    const i = harness.refCursor++;
    return (harness.refs[i] ??= { current: value });
  },
  useLayoutEffect: (effect: () => void) => {
    effect();
  },
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) harness.cleanup.push(cleanup);
  },
}));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = (p: any) => {
    harness.nodes.push(p);
    if (p.ref)
      p.ref.current = {
        measureInWindow: (cb: any) => cb(harness.targetX, 100, 150, 200),
      };
    return createElement(
      "div",
      { "data-testid": p.testID, "aria-label": p.accessibilityLabel },
      p.children,
    );
  };
  return {
    View: primitive,
    Text: primitive,
    Image: primitive,
    Pressable: primitive,
    ScrollView: primitive,
    TextInput: primitive,
    Modal: (p: any) => (p.visible ? primitive(p) : null),
    StyleSheet: { create: (s: any) => s, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({
      width: harness.width,
      height: 874,
      fontScale: harness.fontScale,
    }),
    useColorScheme: () => harness.scheme,
    AppState: {
      addEventListener: (_: string, cb: any) => {
        harness.background.push(cb);
        return { remove: vi.fn() };
      },
    },
    PanResponder: { create: (handlers: any) => ({ panHandlers: handlers }) },
  };
});
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (p: any) => createElement("div", null, p.children),
}));
vi.mock("expo-symbols", () => ({ SymbolView: () => null }));
vi.mock("@react-native-community/datetimepicker", () => ({ default: () => null }));
const { FlexibleRenderer } = await import("./Gallery");
function render(
  fixture = "f03",
  context = "future",
  ports: Partial<import("./Gallery").FlexibleRendererProps> = {},
) {
  harness.cursor = 0;
  harness.refCursor = 0;
  harness.nodes = [];
  return renderToStaticMarkup(
    createElement(FlexibleRenderer, {
      fixture: fixture as any,
      context: context as any,
      focusedId: harness.focus,
      onFocusIntent: (id) => {
        harness.focus = id;
      },
      onProjectionChange: (p) => harness.updates.push(p),
      ...ports,
      nestedItems: createElement(
        "span",
        { "data-testid": "g2-authorized-item-slot" },
        "G2 fixture Item",
      ),
    }),
  );
}
const press = (label: string) => {
  const node = harness.nodes.find(
    (n) =>
      (n.accessibilityLabel === label || n.children?.props?.children === label) &&
      n.onPress,
  );
  expect(node, label).toBeTruthy();
  node.onPress();
};
beforeEach(() => {
  harness.states = [];
  harness.refs = [];
  harness.cleanup = [];
  harness.background = [];
  harness.focus = null;
  harness.updates = [];
  harness.width = 402;
  harness.targetX = 0;
  harness.fontScale = 1;
  harness.scheme = "light";
  setUiLocale("en");
});
it("uses controlled global Focus and fixed column widths; header opens Immersive without claiming Focus", () => {
  render();
  press("Jardin du Luxembourg · 卢森堡公园");
  let html = render();
  expect(harness.focus).toBe(choiceFocusKey("fixture-flexible-f03", "browse", "garden"));
  expect(html.match(/data-testid="choice-focus"/g)).toHaveLength(1);
  const columns = harness.nodes.filter((n) => n.testID === "choice-column");
  expect(columns).toHaveLength(2);
  expect(columns.every((n) => n.style.flex === 1 && n.style.minWidth === 0)).toBe(true);
  const focused = harness.nodes.find(
    (n) => n.testID === choiceFocusKey("fixture-flexible-f03", "browse", "garden"),
  );
  expect(focused.style[1].borderColor).toBeTruthy();
  press("Café de Flore · 咖啡馆");
  html = render();
  expect(html.match(/data-testid="choice-focus"/g)).toHaveLength(1);
  expect(harness.focus).toBe(choiceFocusKey("fixture-flexible-f03", "browse", "cafe"));
  press(t("afternoon"));
  html = render();
  expect(html).toContain("published-carousel");
  expect(harness.focus).toBe(choiceFocusKey("fixture-flexible-f03", "browse", "cafe"));
  expect(html).not.toContain("SECRET PRIVATE BASKET");
});
it("copy/remove/Undo and expanded summary bars operate without mutating source", () => {
  render("f08");
  press(t("afternoon"));
  render("f08");
  press("Musée du Luxembourg · 卢森堡博物馆");
  render("f08");
  press(t("add"));
  render("f08");
  expect(harness.updates.at(-1).choices.map((r: any) => r.id)).toContain("museum");
  expect(harness.updates.at(-1).published[0].resources).toContain("museum");
  press(t("expand"));
  const html = render("f08");
  expect(html).toContain(t("my", { count: 3 }));
  expect(html).toContain("my-drop-target");
  press(t("undo"));
  render("f08");
  expect(harness.updates.at(-1).choices.map((r: any) => r.id)).not.toContain("museum");
});
it("Today exposes only geometric target facts; missing location hides distance and Navigate", () => {
  harness.focus = choiceFocusKey("fixture-flexible-f10", "browse", "garden");
  let html = render("f10", "today");
  expect(html).toContain("Straight-line");
  expect(html).toContain(t("navigate"));
  expect(html).not.toMatch(/ETA|route distance/);
  harness.focus = choiceFocusKey("fixture-flexible-f14", "browse", "cafe");
  html = render("f14", "today");
  expect(html).not.toContain("Straight-line");
  harness.focus = choiceFocusKey("fixture-flexible-f14", "group", "bookshop");
  render("f14", "today");
  press(t("afternoon"));
  html = render("f14", "today");
  expect(html).not.toContain("Navigation target preview");
});
it("Past has useful Details but no planning Pool or fabricated attended state", () => {
  render("f11", "past");
  press(t("afternoon"));
  harness.focus = choiceFocusKey("fixture-flexible-f11", "history", "garden");
  const html = render("f11", "past");
  expect(html).toContain(t("noVisit"));
  expect(html).toContain(t("noEvidence"));
  expect(html).toContain(t("details"));
  expect(html).not.toContain(t("recommended"));
  expect(html).not.toContain(t("add"));
  expect(html).not.toContain(t("photo"));
});
it("supports long bilingual names at narrow width and large type in both palettes", () => {
  harness.width = 320;
  harness.fontScale = 2.2;
  harness.scheme = "dark";
  setUiLocale("zh-Hans");
  harness.focus = choiceFocusKey("fixture-flexible-f12", "browse", "garden");
  let html = render("f12");
  expect(html).toContain("卢森堡公园");
  expect(html).toContain(t("details"));
  press(t("afternoon"));
  html = render("f12");
  expect(html).toContain(t("my", { count: 2 }));
  const target = harness.nodes.find((n) => n.testID === "my-drop-target");
  expect(target.style[1].flex).toBe(0.5);
});
it("inline creation never opens a sheet and resize gesture requires hold and valid rail approach", () => {
  render("f09");
  press(t("create"));
  const html = render("f09");
  expect(html).toContain("flexible-block");
  expect(html).not.toContain("published-carousel");
  const edge = harness.nodes.find((n) => n.accessibilityLabel === t("start"));
  const gesture = harness.nodes.find((n) => n.onMoveShouldSetPanResponderCapture);
  const delta = { dx: 4, dy: 8, moveX: 20, moveY: 200 };
  expect(gesture.onMoveShouldSetPanResponderCapture({}, delta)).toBe(false);
  edge.onLongPress();
  expect(gesture.onMoveShouldSetPanResponderCapture({}, delta)).toBe(true);
  gesture.onPanResponderMove({}, delta);
  expect(harness.states).toContain(795);
  gesture.onPanResponderRelease({}, delta);
  render("f09");
  expect(harness.updates.at(-1).block.start).toBe(795);
});
it("ordinary vertical scrolling never arms copy and native cancellation does not commit", () => {
  render("f08");
  press(t("afternoon"));
  render("f08");
  const handlers = harness.nodes.filter(
    (n) => n.onMoveShouldSetPanResponderCapture && n.onStartShouldSetPanResponder,
  );
  for (const g of handlers)
    expect(g.onMoveShouldSetPanResponderCapture({}, { dx: 0, dy: 80 })).toBe(false);
  const before = JSON.stringify(harness.updates.at(-1));
  const row = harness.nodes.find(
    (n) => n.accessibilityLabel === "Jardin du Luxembourg · 卢森堡公园" && n.onLongPress,
  );
  row.onLongPress();
  handlers[2]?.onPanResponderTerminate();
  for (const bg of harness.background) bg("background");
  render("f08");
  expect(JSON.stringify(harness.updates.at(-1))).toBe(before);
});
it("owns the Pool divider touch before parent scrolling and ignores horizontal releases", () => {
  render("f06");
  press(t("afternoon"));
  render("f06");
  const divider = harness.nodes.find((n) => n.onStartShouldSetPanResponderCapture);
  expect(divider.onStartShouldSetPanResponderCapture()).toBe(true);
  divider.onPanResponderRelease({}, { dx: 60, dy: 5 });
  expect(render("f06")).toContain(t("expand"));
  divider.onPanResponderRelease({}, { dx: 5, dy: -60 });
  expect(render("f06")).toContain(t("collapse"));
  divider.onPanResponderRelease({}, { dx: 5, dy: 60 });
  expect(render("f06")).toContain(t("expand"));
  divider.onPanResponderRelease({}, { dx: 0, dy: 0 });
  expect(render("f06")).toContain(t("collapse"));
});
it("resource detail return preserves caller Focus and own Choice scope", () => {
  harness.focus = choiceFocusKey("fixture-flexible-f03", "browse", "garden");
  render("f03");
  press(t("details"));
  render("f03");
  press(t("close"));
  const html = render("f03");
  expect(html).not.toContain("published-carousel");
  expect(harness.focus).toBe(choiceFocusKey("fixture-flexible-f03", "browse", "garden"));
});
it("renders every fixture/context/locale with exactly one caller-owned Item slot and no private content", () => {
  for (const fixture of [
    "f01",
    "f02",
    "f03",
    "f04",
    "f05",
    "f06",
    "f07",
    "f08",
    "f09",
    "f10",
    "f11",
    "f12",
    "f13",
    "f14",
  ])
    for (const context of ["future", "today", "past"])
      for (const language of ["en", "zh-Hans"] as const) {
        harness.states = [];
        harness.refs = [];
        setUiLocale(language);
        harness.focus = null;
        const html = render(fixture, context);
        expect(html).not.toContain("SECRET");
        expect((html.match(/g2-authorized-item-slot/g) || []).length).toBeLessThanOrEqual(
          1,
        );
        expect(html).not.toContain("choice-focus");
      }
});
it("manual refresh, search fallback, favorites and image failure remain fixture-local", () => {
  render("f07");
  press(t("afternoon"));
  render("f07");
  press(t("refresh"));
  let html = render("f07");
  expect(html).toContain("pool-list");
  press(t("search"));
  render("f07");
  const input = harness.nodes.find(
    (n) => n.accessibilityLabel === t("searchHint") && n.onChangeText,
  );
  input.onChangeText("My unverified walk");
  render("f07");
  press(t("custom"));
  render("f07");
  press(t("saved", { count: 3 }));
  html = render("f07");
  expect(html).toContain("My unverified walk");
  expect(harness.updates.at(-1).choices.map((r: any) => r.name)).not.toContain(
    "My unverified walk",
  );
  const image = harness.nodes.find(
    (n) => n.accessibilityLabel === t("reference") && n.onError,
  );
  image.onError();
  html = render("f07");
  expect(html).toContain(t("noImage"));
});
it("choice Focus keys distinguish Blocks and publication sources", () => {
  expect(choiceFocusKey("a", "group", "garden")).not.toBe(
    choiceFocusKey("b", "group", "garden"),
  );
  expect(choiceFocusKey("a", "group", "garden")).not.toBe(
    choiceFocusKey("a", "my", "garden"),
  );
});
it("long-press copy uses the measured My target; drag-out removes only My and Undo restores it", () => {
  render("f08");
  press(t("afternoon"));
  render("f08");
  harness.nodes.find((n) => n.testID === "my-drop-target").onLayout();
  render("f08");
  const name = "Musée du Luxembourg · 卢森堡博物馆";
  const gesture = harness.nodes.find(
    (n) => n.onPanResponderRelease && n.children?.props?.accessibilityLabel === name,
  );
  harness.nodes.find((n) => n.accessibilityLabel === name && n.onLongPress).onLongPress();
  gesture.onPanResponderRelease({}, { dx: -80, dy: 0, moveX: 60, moveY: 150 });
  render("f08");
  expect(harness.updates.at(-1).choices.some((r: any) => r.id === "museum")).toBe(true);
  expect(
    harness.updates.at(-1).published.find((b: any) => b.id === "group").resources,
  ).toContain("museum");
  const owned = harness.nodes.find(
    (n) => n.accessibilityLabel === name && n.accessibilityHint === t("removeDrag"),
  );
  const drag = harness.nodes.find(
    (n) =>
      n.onPanResponderRelease &&
      n.children?.props?.accessibilityHint === t("removeDrag") &&
      n.children?.props?.accessibilityLabel === name,
  );
  owned.onLongPress();
  drag.onPanResponderRelease({}, { dx: 220, dy: 0, moveX: 350, moveY: 150 });
  render("f08");
  expect(harness.updates.at(-1).choices.some((r: any) => r.id === "museum")).toBe(false);
  press(t("undo"));
  render("f08");
  expect(harness.updates.at(-1).choices.some((r: any) => r.id === "museum")).toBe(true);
});

it("shared resource/navigation/map intents can bypass isolated previews without Canonical work", () => {
  const details = vi.fn(),
    navigate = vi.fn(),
    map = vi.fn();
  const ports = {
    onResourceDetailsIntent: details,
    onNavigateIntent: navigate,
    onMapIntent: map,
  };
  harness.focus = choiceFocusKey("fixture-flexible-f10", "browse", "garden");
  render("f10", "today", ports);
  press(t("details"));
  expect(details.mock.calls[0][0].id).toBe("garden");
  press(t("navigate"));
  expect(navigate.mock.calls[0][0].coordinates.latitude).toBe(48.8462);
  press(t("map"));
  expect(map.mock.calls[0][0].map((r: any) => r.id)).toEqual(["garden", "cafe"]);
  expect(render("f10", "today", ports)).not.toContain("published-carousel");
});

it("a stationary long-press release cancels arming without changing relationships", () => {
  render("f08");
  press(t("afternoon"));
  render("f08");
  const before = JSON.stringify(harness.updates.at(-1));
  const row = harness.nodes.find(
    (n) => n.accessibilityLabel === "Musée du Luxembourg · 卢森堡博物馆" && n.onLongPress,
  );
  row.onLongPress();
  row.onPressOut();
  render("f08");
  expect(JSON.stringify(harness.updates.at(-1))).toBe(before);
});

it.each([
  [20, 150, true],
  [16, 100, true],
  [166, 300, true],
  [15, 150, false],
  [167, 150, false],
  [20, 99, false],
  [20, 301, false],
])(
  "R1 screen-space COPY with a nonzero rail: x=%s y=%s accepted=%s",
  (x, y, accepted) => {
    harness.targetX = 16;
    const ports = { timeRailLeft: 16 };
    render("f08", "future", ports);
    press(t("afternoon"));
    render("f08", "future", ports);
    harness.nodes.find((n) => n.testID === "my-drop-target").onLayout();
    render("f08", "future", ports);
    const name = "Musée du Luxembourg · 卢森堡博物馆";
    const gesture = harness.nodes.find(
      (n) => n.onPanResponderRelease && n.children?.props?.accessibilityLabel === name,
    );
    harness.nodes
      .find((n) => n.accessibilityLabel === name && n.onLongPress)
      .onLongPress();
    gesture.onPanResponderRelease({}, { dx: -80, dy: 0, moveX: x, moveY: y });
    render("f08", "future", ports);
    const projection = harness.updates.at(-1);
    expect(projection.choices.some((r: any) => r.id === "museum")).toBe(accepted);
    expect(projection.published.find((b: any) => b.id === "group").resources).toContain(
      "museum",
    );
  },
);
it.each([
  [20, 150, false],
  [15, 150, true],
  [167, 150, true],
  [20, 99, true],
  [20, 301, true],
])("R1 owned removal uses screen bounds: x=%s y=%s removed=%s", (x, y, removed) => {
  harness.targetX = 16;
  const ports = { timeRailLeft: 16 };
  render("f08", "future", ports);
  press(t("afternoon"));
  render("f08", "future", ports);
  harness.nodes.find((n) => n.testID === "my-drop-target").onLayout();
  render("f08", "future", ports);
  const name = "Jardin du Luxembourg · 卢森堡公园";
  const owned = harness.nodes.find(
    (n) => n.accessibilityLabel === name && n.accessibilityHint === t("removeDrag"),
  );
  const drag = harness.nodes.find(
    (n) =>
      n.onPanResponderRelease &&
      n.children?.props?.accessibilityHint === t("removeDrag") &&
      n.children?.props?.accessibilityLabel === name,
  );
  owned.onLongPress();
  drag.onPanResponderRelease({}, { dx: 10, dy: 0, moveX: x, moveY: y });
  render("f08", "future", ports);
  expect(harness.updates.at(-1).choices.some((r: any) => r.id === "garden")).toBe(
    !removed,
  );
  expect(harness.states[0].saved).toContain("garden");
});
const historyRows = () =>
  harness.nodes.find(
    (n) => Array.isArray(n.children) && n.children[0]?.props?.children === t("memory"),
  ).children[2];
const historyIds = () => historyRows().map((row: any) => row.key);
it("R2 Group-only Past retains all authorized Choices without a planning workspace", () => {
  render("f02", "past");
  press(t("afternoon"));
  const html = render("f02", "past");
  expect(historyIds()).toEqual(["garden", "cafe", "museum"]);
  expect(html).not.toContain("pool-list");
  expect(html).not.toContain("published-carousel");
});
it("R2 Past follows My/Group switching instead of replacing Group with My", () => {
  render("f03", "past");
  press(t("group", { count: 3 }));
  render("f03", "past");
  press(t("afternoon"));
  render("f03", "past");
  expect(historyIds()).toEqual(["garden", "cafe", "museum"]);
  press(t("close"));
  render("f03", "past");
  press(t("my", { count: 2 }));
  render("f03", "past");
  press(t("afternoon"));
  render("f03", "past");
  expect(historyIds()).toEqual(["garden", "cafe"]);
});
it("R2 empty Past remains useful without planning controls or invented attendance", () => {
  render("f01", "past");
  press(t("afternoon"));
  const html = render("f01", "past");
  expect(historyIds()).toEqual([]);
  expect(html).toContain(t("noEvidence"));
  expect(html).toContain(t("noVisit"));
  expect(html).not.toContain("pool-list");
  expect(html).not.toContain("published-carousel");
});
it("R2 privacy-restricted Past uses authorized Group history and omits private baskets", () => {
  render("f14", "past");
  press(t("group", { count: 3 }));
  render("f14", "past");
  press(t("afternoon"));
  const html = render("f14", "past");
  expect(historyIds()).toEqual(["garden", "cafe", "museum"]);
  expect(html).not.toMatch(/SECRET|private-resource|private-basket/);
  expect(html).not.toContain("pool-list");
  expect(html).not.toContain("published-carousel");
});
it.each(["onResourceDetailsIntent", "onNavigateIntent", "onMapIntent"] as const)(
  "R3 %s receives detached, deeply frozen read payloads",
  (port) => {
    const received: any[] = [];
    const callback = (value: any) => {
      if (Array.isArray(value)) expect(Object.isFrozen(value)).toBe(true);
      for (const resource of Array.isArray(value) ? value : [value]) {
        received.push(resource);
        expect(Object.isFrozen(resource)).toBe(true);
        expect(Object.isFrozen(resource.coordinates)).toBe(true);
        expect(Reflect.set(resource, "name", "MUTATED")).toBe(false);
        expect(Reflect.set(resource.coordinates, "latitude", 0)).toBe(false);
      }
    };
    harness.focus = choiceFocusKey("fixture-flexible-f10", "browse", "garden");
    const ports = { [port]: callback };
    render("f10", "today", ports);
    press(
      t(
        port === "onResourceDetailsIntent"
          ? "details"
          : port === "onNavigateIntent"
            ? "navigate"
            : "map",
      ),
    );
    const garden = harness.states[0].resources.find((r: any) => r.id === "garden");
    expect(received[0]).not.toBe(garden);
    expect(received[0].coordinates).not.toBe(garden.coordinates);
    expect(render("f10", "today", ports)).toContain("Jardin du Luxembourg");
    expect(garden.coordinates.latitude).toBe(48.8462);
    harness.states = [];
    harness.refs = [];
    render("f10", "today");
    expect(
      harness.states[0].resources.find((r: any) => r.id === "garden").coordinates
        .latitude,
    ).toBe(48.8462);
  },
);
it.each(["future", "today", "past"])(
  "R4 non-draggable Browse omits drag hints in %s",
  (context) => {
    render("f03", context);
    const row = harness.nodes.find(
      (n) =>
        n.accessibilityLabel === "Jardin du Luxembourg · 卢森堡公园" && n.onLongPress,
    );
    expect(row.accessibilityHint).toBeUndefined();
  },
);
it("R4 Past history has no drag hint; draggable planning rows retain it", () => {
  render("f11", "past");
  press(t("afternoon"));
  render("f11", "past");
  const rows = harness.nodes.filter(
    (n) => n.accessibilityLabel === "Jardin du Luxembourg · 卢森堡公园" && n.onLongPress,
  );
  expect(rows.length).toBeGreaterThan(1);
  expect(rows.every((n) => n.accessibilityHint === undefined)).toBe(true);
  harness.states = [];
  harness.refs = [];
  render("f08");
  press(t("afternoon"));
  render("f08");
  expect(harness.nodes.some((n) => n.accessibilityHint === t("drag"))).toBe(true);
  expect(harness.nodes.some((n) => n.accessibilityHint === t("removeDrag"))).toBe(true);
});
it.each(["en", "zh-Hans"] as const)(
  "R5 Past evidence copy matches each authorized synthetic association in %s",
  (language) => {
    setUiLocale(language);
    render("f03", "past");
    press(t("afternoon"));
    render("f03", "past");
    const rows = historyRows();
    const garden = rows.find((r: any) => r.key === "garden"),
      cafe = rows.find((r: any) => r.key === "cafe");
    expect(garden.props.children[1]).toBeNull();
    expect(garden.props.children[2]).not.toBeNull();
    expect(cafe.props.children[1].props.children).toBe(t("noEvidence"));
    expect(cafe.props.children[2]).toBeNull();
    expect(harness.nodes.some((n) => n.children === t("noVisit"))).toBe(true);
  },
);
it("R1 nonzero rail origin remains specific to temporal resize and ruler preview", () => {
  const ports = { timeRailLeft: 32 };
  render("f09", "future", ports);
  press(t("create"));
  render("f09", "future", ports);
  const edge = harness.nodes.find((n) => n.accessibilityLabel === t("start"));
  const gesture = harness.nodes.find((n) => n.onMoveShouldSetPanResponderCapture);
  edge.onLongPress();
  const delta = { dx: 4, dy: 8, moveX: 60, moveY: 200 };
  gesture.onPanResponderMove({}, delta);
  expect(harness.states).toContain(795);
  gesture.onPanResponderRelease({}, delta);
  render("f09", "future", ports);
  expect(harness.updates.at(-1).block.start).toBe(795);
});
it("G2 binding supplies all F01-F14 scoped snapshots without registering a second shell", async () => {
  const { flexibleLabContributions } = await import("./labAdapter");
  const { collectFixtureContributions } =
    await import("@/features/day-feed-lab/contribution");
  const fixtures = flexibleLabContributions();
  expect(collectFixtureContributions(fixtures)).toHaveLength(14);
  expect(fixtures[0].flexiblePublication!.snapshot!.blocks[0].choices).toEqual([]);
  expect(
    fixtures[1].flexiblePublication!.snapshot!.blocks[0].choices.every(
      (c) => c.scope === "GROUP",
    ),
  ).toBe(true);
  expect(fixtures[3].projection.events).toHaveLength(1);
  expect(fixtures[3].flexiblePublication!.snapshot!.blocks[0].itemIds).toEqual([
    "fixture-fixed",
  ]);
});
it("shared Browse uses G2 Choice keys, header intent and filtered scope, without opening its own Block Modal", async () => {
  const { initialState } = await import("./fixtures");
  const open = vi.fn(),
    change = vi.fn();
  const shared = {
    state: initialState("f03"),
    dispatch: vi.fn(),
    scope: "GROUP" as const,
    choices: ["museum"],
    onScope: change,
    immersive: false,
    open,
    close: vi.fn(),
  };
  let html = render("f03", "future", { shared });
  expect(html).not.toContain("Jardin du Luxembourg");
  press("Musée du Luxembourg · 卢森堡博物馆");
  expect(harness.focus).toBe(choiceFocusKey("fixture-flexible-f03", "GROUP", "museum"));
  press(t("afternoon"));
  expect(open).toHaveBeenCalledOnce();
  html = render("f03", "future", { shared });
  expect(html).not.toContain('data-testid="pool-list"');
});
it("shared Immersive uses a local Resource focus and direct G2 close boundary", async () => {
  const { initialState } = await import("./fixtures");
  const close = vi.fn();
  const shared = {
    state: initialState("f03"),
    dispatch: vi.fn(),
    scope: "MY" as const,
    choices: ["garden", "cafe"],
    onScope: vi.fn(),
    immersive: true,
    open: vi.fn(),
    close,
  };
  let local: string | null = null;
  render("f03", "future", {
    shared,
    focusedId: local,
    onFocusIntent: (id) => {
      local = id;
    },
  });
  press("Jardin du Luxembourg · 卢森堡公园");
  expect(harness.focus).toBeNull();
  const html = render("f03", "future", {
    shared,
    focusedId: local,
    onFocusIntent: (id) => {
      local = id;
    },
  });
  expect(html.match(/data-testid="choice-focus"/g)).toHaveLength(1);
  press(t("close"));
  expect(close).toHaveBeenCalledOnce();
});
it("shared Immersive reserves inaccessible inactive actions and withholds synthetic Past evidence", async () => {
  const { initialState } = await import("./fixtures");
  const state = initialState("f03");
  const shared = {
    state,
    dispatch: vi.fn(),
    scope: "MY" as const,
    choices: ["garden"],
    onScope: vi.fn(),
    immersive: true,
    open: vi.fn(),
    close: vi.fn(),
  };
  let html = render("f03", "past", { shared });
  expect(html).toContain('data-testid="flexible-interaction-bar"');
  expect(html).toContain(t("noEvidence"));
  expect(html).not.toContain(t("photo"));
  expect(html).not.toContain(t("expense"));
  const cancel = harness.nodes.find((n) => n.testID === "flexible-cancel-slot");
  const undo = harness.nodes.find((n) => n.testID === "flexible-undo-slot");
  expect(cancel.pointerEvents).toBe("none");
  expect(cancel.accessibilityElementsHidden).toBe(true);
  expect(undo.pointerEvents).toBe("none");
  expect(undo.accessibilityElementsHidden).toBe(true);
  html = render("f03", "past", {
    shared: { ...shared, state: { ...state, undo: { my: [] } } },
  });
  expect(html).toContain('data-testid="flexible-interaction-bar"');
  const visibleUndo = harness.nodes.find((n) => n.testID === "flexible-undo-slot");
  expect(visibleUndo.pointerEvents).toBe("auto");
  expect(visibleUndo.accessibilityElementsHidden).toBe(false);
});
it("mounted adapter publishes COPY through accepted snapshots and reports a rejected Remove without optimistic loss", async () => {
  const { flexibleLabContribution } = await import("./labAdapter");
  const { composeDayStream } = await import("@/features/day-feed/composition");
  const { itemsForLocalDate } = await import("@/domain/trip/dayReadModel");
  const { replaceFlexibleSnapshot } =
    await import("@/features/day-feed/flexibleSnapshot");
  const entry = flexibleLabContribution("f08");
  let snapshot = entry.flexiblePublication!.snapshot!;
  let reject = false;
  const query = itemsForLocalDate(entry.projection, entry.selectedDate, entry.zone);
  const renderBinding = () => {
    harness.cursor = 0;
    harness.refCursor = 0;
    harness.nodes = [];
    const block = composeDayStream(query, entry.instant, {
      flexible: snapshot.blocks,
      scope: snapshot.scope,
      immersive: snapshot.blocks[0].id,
    }).containers[0];
    return renderToStaticMarkup(
      createElement(entry.flexibleRenderer!, {
        block,
        immersive: true,
        nestedItems: null,
        onBlockImmersiveIntent: vi.fn(),
        onChoiceFocusIntent: vi.fn(),
        onChoiceScopeIntent: vi.fn(),
        onClose: vi.fn(),
        flexibleSnapshot: snapshot,
        onReplaceFlexibleSnapshot: (candidate: typeof snapshot) => {
          if (reject) return false;
          const next = replaceFlexibleSnapshot(snapshot, candidate, snapshot.scope);
          if (!next || next === snapshot) return false;
          snapshot = next;
          return true;
        },
      }),
    );
  };
  renderBinding();
  press("Musée du Luxembourg · 卢森堡博物馆");
  renderBinding();
  press(t("add"));
  expect(snapshot.revision).toBe(1);
  expect(
    snapshot.blocks[0].choices.some((c) => c.scope === "MY" && c.id === "museum"),
  ).toBe(true);
  harness.states = [];
  harness.refs = [];
  renderBinding();
  press("Jardin du Luxembourg · 卢森堡公园");
  renderBinding();
  reject = true;
  press(t("remove"));
  expect(snapshot.revision).toBe(1);
  expect(renderBinding()).toContain(t("publicationRejected"));
  expect(
    snapshot.blocks[0].choices.some((c) => c.scope === "MY" && c.id === "garden"),
  ).toBe(true);
});
it("G2 My/Group switching delegates scope without clearing ordinary Item Focus", async () => {
  const { initialState } = await import("./fixtures");
  const focus = vi.fn(),
    scope = vi.fn();
  render("f03", "future", {
    onFocusIntent: focus,
    shared: {
      state: initialState("f03"),
      dispatch: vi.fn(),
      scope: "MY",
      choices: ["garden", "cafe"],
      onScope: scope,
      immersive: false,
      open: vi.fn(),
      close: vi.fn(),
    },
  });
  press(t("group", { count: 3 }));
  expect(scope).toHaveBeenCalledWith("GROUP");
  expect(focus).not.toHaveBeenCalled();
});
