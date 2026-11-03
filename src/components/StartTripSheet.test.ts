import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { StartTripSheet } from "./StartTripSheet";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  nodes: [] as any[],
  modal: null as any,
  animated: [] as any[],
  animations: [] as any[],
  hooks: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  cleanups: new Map<number, (() => void) | undefined>(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (value: unknown) => {
    const i = state.cursor++;
    return state.hooks[i] ?? (state.hooks[i] = { current: value });
  },
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.hooks))
      state.hooks[i] = typeof initial === "function" ? initial() : initial;
    return [
      state.hooks[i],
      (v: unknown) => {
        state.hooks[i] = v;
      },
    ];
  },
  useEffect: (effect: () => () => void, deps: unknown[]) => {
    const i = state.cursor++,
      previous = state.hooks[i];
    if (!previous || deps.some((v, n) => v !== previous[n])) {
      state.hooks[i] = deps;
      state.effects.push(() => {
        state.cleanups.get(i)?.();
        state.cleanups.set(i, effect());
      });
    }
  },
}));
vi.mock("react-native", () => ({
  Animated: {
    Value: class {
      stopAnimation = vi.fn();
      interpolate(input: unknown) {
        return { interpolation: input };
      }
    },
    timing: (value: unknown, options: unknown) => {
      const animation = {
        value,
        options,
        callback: null as any,
        start(fn: unknown) {
          this.callback = fn;
        },
        stop: vi.fn(),
      };
      state.animations.push(animation);
      return animation;
    },
    View: (p: any) => {
      state.animated.push(p);
      return createElement("div", null, p.children);
    },
  },
  useWindowDimensions: () => ({ height: 820 }),
  Modal: (p: any) => {
    state.modal = p;
    return p.visible ? createElement("div", null, p.children) : null;
  },
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
  ScrollView: "section",
  View: "div",
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: "div",
  SafeAreaView: "div",
}));
vi.mock("./AppIcon", () => ({ AppIcon: () => null }));
vi.mock("./SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ accessibilityLabel: p.leftLabel, onPress: p.onLeft });
    return createElement("h1", null, p.title);
  },
}));
vi.mock("@/ui/controls", () => ({ UiText: "span" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => ({}),
  useThemedStyles: (make: any) => make({}),
}));
const props = { visible: true, onClose: vi.fn(), onImport: vi.fn(), onCreate: vi.fn() };
const render = (visible = true) => {
  state.cursor = 0;
  state.nodes = [];
  state.animated = [];
  const html = renderToStaticMarkup(createElement(StartTripSheet, { ...props, visible }));
  for (const effect of state.effects.splice(0)) effect();
  return html;
};
beforeEach(() => {
  state.nodes = [];
  state.hooks = [];
  state.cursor = 0;
  state.effects = [];
  state.animated = [];
  state.animations = [];
  state.cleanups.clear();
  vi.clearAllMocks();
});
it("shows the two restrained entry choices in a content-fit modal without selecting either", () => {
  const html = render();
  expect(html).toContain("createTripV2.startHint");
  expect(html).toContain("createTripV2.importHint");
  expect(html).toContain("createTripV2.manualHint");
  expect(state.modal).toMatchObject({
    transparent: true,
    presentationStyle: "overFullScreen",
  });
  expect(props.onCreate).not.toHaveBeenCalled();
  expect(props.onImport).not.toHaveBeenCalled();
  state.nodes.find((p) => p.accessibilityLabel === "actionIsland.importPlans").onPress();
  expect(props.onImport).toHaveBeenCalledOnce();
  state.nodes
    .find((p) => p.accessibilityLabel === "actionIsland.createManually")
    .onPress();
  expect(props.onCreate).toHaveBeenCalledOnce();
});
it("backdrop/native dismissal only cancels and creates no draft", () => {
  render();
  state.modal.onRequestClose();
  state.nodes.find((p) => p.accessibilityLabel === "common.cancel").onPress();
  expect(props.onClose).toHaveBeenCalledTimes(2);
  expect(props.onCreate).not.toHaveBeenCalled();
  expect(props.onImport).not.toHaveBeenCalled();
});

it("fades a stationary mask and translates only the content-fit sheet instead of sliding the modal host", () => {
  render();
  expect(state.modal.animationType).toBe("none");
  const [mask, sheet] = state.animated;
  const maskStyle = Object.assign({}, ...mask.style);
  const sheetStyle = Object.assign({}, ...sheet.style);
  expect(maskStyle.opacity).toBe(state.animations[0].value);
  expect(maskStyle).not.toHaveProperty("transform");
  expect(sheetStyle.transform).toEqual([
    { translateY: { interpolation: { inputRange: [0, 1], outputRange: [820, 0] } } },
  ]);
  expect(sheetStyle.maxHeight).toBe("90%");
  expect(state.animations[0].options).toMatchObject({
    toValue: 1,
    useNativeDriver: true,
  });
});
it("keeps the transparent host until its close completes, without choosing either action", () => {
  render();
  render(false);
  expect(state.modal.visible).toBe(true);
  const close = state.animations.at(-1);
  expect(close.options.toValue).toBe(0);
  close.callback({ finished: true });
  render(false);
  expect(state.modal.visible).toBe(false);
  expect(props.onCreate).not.toHaveBeenCalled();
  expect(props.onImport).not.toHaveBeenCalled();
});
it("a canceled closing animation cannot hide a rapidly reopened sheet or publish after unmount", () => {
  render();
  render(false);
  const closing = state.animations.at(-1);
  render(true);
  expect(closing.stop).toHaveBeenCalledOnce();
  closing.callback({ finished: true });
  render(true);
  expect(state.modal.visible).toBe(true);
  render(false);
  const final = state.animations.at(-1);
  const before = [...state.hooks];
  for (const cleanup of state.cleanups.values()) cleanup?.();
  final.callback({ finished: true });
  expect(state.hooks).toEqual(before);
  expect(final.stop).toHaveBeenCalledOnce();
});

it("retains a newly shown modal through its next close after an initially hidden mount", () => {
  render(false);
  expect(state.modal.visible).toBe(false);
  render(true);
  state.modal.onShow();
  render(false);
  expect(state.modal.visible).toBe(true);
  state.animations.at(-1).callback({ finished: true });
  render(false);
  expect(state.modal.visible).toBe(false);
});
