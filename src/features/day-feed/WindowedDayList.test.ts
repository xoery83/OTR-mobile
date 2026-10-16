import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { WindowedDayList, type DayListHandle } from "./WindowedDayList";
import { nextCalendarDate } from "@/domain/trip/dayReadModel";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  props: {} as any,
  effects: [] as (() => void)[],
  frames: [] as (() => void)[],
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useLayoutEffect: (fn: () => void) => state.effects.push(fn),
  useEffect: (fn: () => void) => {
    fn();
  },
  useImperativeHandle: (ref: { current: unknown }, create: () => unknown) =>
    state.effects.push(() => {
      if (ref) ref.current = create();
    }),
}));
vi.mock("react-native", async () => {
  const { createElement, forwardRef } = await import("react");
  return {
    View: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
    FlatList: forwardRef((props: any, ref: any) => {
      state.props = props;
      if (ref)
        ref.current = {
          scrollToIndex: state.scrollToIndex,
          scrollToOffset: state.scrollToOffset,
        };
      // This models the FlatList contract, not actual native virtualization or frame performance.
      return createElement(
        "div",
        {},
        props.data.slice(0, props.initialNumToRender).map((item: any, index: number) =>
          createElement(props.CellRendererComponent, {
            key: item.key,
            cellKey: item.key,
            item,
            index,
            children: props.renderItem({ item, index }),
          }),
        ),
      );
    }),
  };
});
beforeEach(() => {
  state.effects = [];
  state.frames = [];
  state.scrollToIndex.mockReset();
  state.scrollToOffset.mockReset();
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    state.frames.push(fn);
    return state.frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
function setup() {
  let date = "2026-10-01";
  const rows = Array.from({ length: 90 }, () => {
    const own = date;
    date = nextCalendarDate(date);
    return { key: `header:${own}`, date: own, value: "HEADER" };
  });
  const ref = { current: null as DayListHandle | null };
  const render = vi.fn(() => createElement("span", {}, "day"));
  const count = vi.fn(),
    result = vi.fn();
  renderToStaticMarkup(
    createElement(WindowedDayList, {
      rows,
      renderRow: render,
      listRef: ref,
      scopeKey: "account/trip",
      onMountedRowsChange: count,
      onJumpResult: result,
    }),
  );
  for (const effect of state.effects) effect();
  return { rows, ref, render, count, result };
}
it("hands 90 day descriptors to one FlatList, rendering only its initial native window", () => {
  const { rows, ref, render, count } = setup();
  expect(render).toHaveBeenCalledTimes(8);
  expect(count).toHaveBeenLastCalledWith(8);
  expect(state.props.maxToRenderPerBatch).toBe(8);
  expect(state.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  expect(ref.current!.jumpToDayHeader(rows[74].date)).toBe(true);
  expect(state.scrollToIndex).toHaveBeenLastCalledWith({
    index: 74,
    animated: false,
    viewOffset: 0,
  });
  expect(render).toHaveBeenCalledTimes(8);
  expect(ref.current!.jumpToDayHeader("2027-01-01")).toBe(false);
});
it("retries an unmeasured far jump finitely and reports it instead of claiming success", () => {
  const { rows, ref, result } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  for (let i = 0; i < 4; i++) {
    state.props.onScrollToIndexFailed({ index: 74, averageItemLength: 100 });
    state.frames.shift()?.();
  }
  expect(state.scrollToIndex).toHaveBeenCalledTimes(3);
  expect(result).toHaveBeenLastCalledWith("UNMEASURED", rows[74].date);
});
it("marks a target reached only after native viewability reports that row", () => {
  const { rows, ref, result } = setup();
  ref.current!.restoreAnchor({ key: rows[50].key, date: rows[50].date, within: 22 });
  expect(result).not.toHaveBeenCalled();
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[50], index: 50, isViewable: true }],
    changed: [],
  });
  expect(result).toHaveBeenLastCalledWith("REACHED", rows[50].date);
  expect(ref.current!.saveAnchor()).toEqual({
    key: rows[50].key,
    date: rows[50].date,
    within: 22,
  });
});
