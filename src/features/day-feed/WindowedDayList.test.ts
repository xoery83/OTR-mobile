import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WindowedDayList, type DayListHandle } from "./WindowedDayList";
import { nextCalendarDate } from "@/domain/trip/dayReadModel";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  props: {} as any,
  cellLayouts: [] as ((event: any) => void)[],
  effects: [] as (() => void)[],
  frames: [] as (() => void)[],
  refs: [] as { current: any }[],
  refCursor: 0,
  layoutDeps: [] as (readonly unknown[] | undefined)[],
  layoutCursor: 0,
  memos: [] as { deps: readonly unknown[]; value: unknown }[],
  memoCursor: 0,
  states: [] as unknown[],
  stateCursor: 0,
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = state.stateCursor++;
    if (state.states[index] === undefined) state.states[index] = initial;
    return [
      state.states[index],
      (value: unknown) => {
        state.states[index] =
          typeof value === "function" ? value(state.states[index]) : value;
      },
    ];
  },
  useCallback: (callback: unknown, deps: readonly unknown[]) => {
    const index = state.memoCursor++,
      previous = state.memos[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])))
      state.memos[index] = { deps, value: callback };
    return state.memos[index].value;
  },
  useRef: (initial: unknown) => {
    const index = state.refCursor++;
    return state.refs[index] ?? (state.refs[index] = { current: initial });
  },
  useLayoutEffect: (fn: () => void, deps?: readonly unknown[]) => {
    const index = state.layoutCursor++,
      previous = state.layoutDeps[index];
    if (!deps || !previous || deps.some((value, i) => !Object.is(value, previous[i])))
      state.effects.push(fn);
    state.layoutDeps[index] = deps;
  },
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
    View: ({
      children,
      onLayout,
    }: {
      children: ReactNode;
      onLayout?: (event: any) => void;
    }) => {
      if (onLayout) state.cellLayouts.push(onLayout);
      return createElement("div", {}, children);
    },
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
        props.data
          .slice(
            props.initialScrollIndex ?? 0,
            (props.initialScrollIndex ?? 0) + props.initialNumToRender,
          )
          .map((item: any, index: number) =>
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
  vi.useFakeTimers();
  state.states = [];
  state.stateCursor = 0;
  state.effects = [];
  state.refs = [];
  state.refCursor = 0;
  state.layoutDeps = [];
  state.layoutCursor = 0;
  state.memos = [];
  state.memoCursor = 0;
  state.frames = [];
  state.scrollToIndex.mockReset();
  state.scrollToOffset.mockReset();
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    state.frames.push(fn);
    return state.frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  let date = "2026-10-01";
  const rows = Array.from({ length: 90 }, () => {
    const own = date;
    date = nextCalendarDate(date);
    return { key: `header:${own}`, date: own, value: "HEADER" };
  });
  const ref = { current: null as DayListHandle | null };
  const render = vi.fn((_row: { key: string }) => createElement("span", {}, "day"));
  const count = vi.fn(),
    result = vi.fn();
  const rerender = (nextRows = rows, layoutRevision?: string) => {
    state.effects = [];
    state.cellLayouts = [];
    state.refCursor = 0;
    state.layoutCursor = 0;
    state.memoCursor = 0;
    state.stateCursor = 0;
    renderToStaticMarkup(
      createElement(WindowedDayList, {
        rows: nextRows,
        layoutRevision,
        renderRow: render,
        listRef: ref,
        scopeKey: "account/trip",
        onMountedRowsChange: count,
        onJumpResult: result,
      }),
    );
    for (const effect of state.effects) effect();
  };
  rerender();
  return { rows, ref, render, count, result, rerender };
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
it("bounds an unmeasured jump by deadline rather than consuming unrelated layout frames", () => {
  const { rows, ref, result } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  for (let i = 0; i < 4; i++) {
    state.props.onScrollToIndexFailed({ index: 74, averageItemLength: 100 });
    state.frames.shift()?.();
  }
  expect(state.scrollToIndex).toHaveBeenCalledTimes(1);
  expect(result).not.toHaveBeenCalled();
  vi.advanceTimersByTime(5000);
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

it("normalizes a deleted-item restore to its actual same-day header", () => {
  const { rows, ref, result } = setup();
  ref.current!.restoreAnchor({ key: "deleted-item", date: rows[50].date, within: 22 });
  expect(state.scrollToIndex).toHaveBeenLastCalledWith({
    index: 50,
    animated: false,
    viewOffset: 0,
  });
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[50], index: 50, isViewable: true }],
    changed: [],
  });
  expect(result).toHaveBeenLastCalledWith("REACHED", rows[50].date);
  expect(ref.current!.saveAnchor()).toEqual({
    key: rows[50].key,
    date: rows[50].date,
    within: 0,
  });
});
it("normalizes an in-flight restore after a sync snapshot removes its Item", () => {
  const { rows, ref, result, rerender } = setup();
  const target = { key: "item-before-sync", date: rows[50].date, value: "ITEM" };
  rerender([...rows.slice(0, 51), target, ...rows.slice(51)]);
  ref.current!.restoreAnchor({ key: target.key, date: target.date, within: 22 });
  rerender([...rows]);
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[50], index: 50, isViewable: true }],
    changed: [],
  });
  expect(result).toHaveBeenLastCalledWith("REACHED", rows[50].date);
  expect(ref.current!.saveAnchor()).toEqual({
    key: rows[50].key,
    date: rows[50].date,
    within: 0,
  });
  const attempts = state.scrollToIndex.mock.calls.length;
  state.props.onContentSizeChange();
  for (const frame of state.frames.splice(0)) frame();
  expect(state.scrollToIndex).toHaveBeenCalledTimes(attempts);
});
it("does not redirect to another date if a pending target date disappears", () => {
  const { rows, ref, result, rerender } = setup();
  ref.current!.restoreAnchor({ key: rows[50].key, date: rows[50].date, within: 22 });
  rerender(rows.filter((row) => row.date !== rows[50].date));
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[51], index: 50, isViewable: true }],
    changed: [],
  });
  expect(result).not.toHaveBeenCalledWith("REACHED", expect.anything());
  expect(result).toHaveBeenLastCalledWith("UNMEASURED", rows[50].date);
});

it("does not restore on fresh row arrays or callbacks caused by ordinary reading updates", () => {
  const { rows, ref, rerender } = setup();
  ref.current!.restoreAnchor({ key: rows[50].key, date: rows[50].date, within: 12 });
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[50], index: 50, isViewable: true }],
    changed: [],
  });
  state.scrollToIndex.mockClear();
  rerender(rows.map((row) => ({ ...row })));
  rerender([...rows]);
  for (const frame of state.frames.splice(0)) frame();
  expect(state.scrollToIndex).not.toHaveBeenCalled();
});
it.each(["insert", "delete", "reorder"])(
  "preserves the same Item anchor after a logical %s",
  (change) => {
    const { rows, ref, rerender } = setup();
    ref.current!.restoreAnchor({ key: rows[50].key, date: rows[50].date, within: 12 });
    state.props.onViewableItemsChanged({
      viewableItems: [{ item: rows[50], index: 50, isViewable: true }],
      changed: [],
    });
    state.scrollToIndex.mockClear();
    const changed =
      change === "insert"
        ? [{ key: "new", date: rows[0].date, value: "ITEM" }, ...rows]
        : change === "delete"
          ? rows.slice(1)
          : [rows[50], ...rows.filter((_, index) => index !== 50)];
    rerender(changed);
    expect(state.scrollToIndex).not.toHaveBeenCalled();
    state.frames.shift()?.();
    expect(state.scrollToIndex).toHaveBeenLastCalledWith({
      index: change === "insert" ? 51 : change === "delete" ? 49 : 0,
      animated: false,
      viewOffset: -12,
    });
  },
);
it("restores after an explicit Focus-height revision but not its repeated rerender", () => {
  const { rows, ref, rerender } = setup();
  ref.current!.restoreAnchor({ key: rows[50].key, date: rows[50].date, within: 12 });
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[50], index: 50, isViewable: true }],
    changed: [],
  });
  state.scrollToIndex.mockClear();
  rerender([...rows], "source-1/focus-item-2");
  state.frames.shift()?.();
  expect(state.scrollToIndex).toHaveBeenCalledTimes(1);
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[50], index: 50, isViewable: true }],
    changed: [],
  });
  state.scrollToIndex.mockClear();
  rerender([...rows], "source-1/focus-item-2");
  for (const frame of state.frames.splice(0)) frame();
  expect(state.scrollToIndex).not.toHaveBeenCalled();
});

it("does not overwrite an anchor with pre-revision cell offsets while Native remeasures", () => {
  const { rows, ref, rerender } = setup();
  state.cellLayouts[5]({ nativeEvent: { layout: { y: 500, height: 100 } } });
  state.props.onScroll({ nativeEvent: { contentOffset: { y: 510 } } });
  expect(ref.current!.saveAnchor()).toEqual({
    key: rows[5].key,
    date: rows[5].date,
    within: 10,
  });
  rerender([...rows], "expanded");
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[5], index: 5, isViewable: true }],
    changed: [],
  });
  state.props.onScroll({ nativeEvent: { contentOffset: { y: 550 } } });
  expect(ref.current!.saveAnchor()!.within).toBe(10);
  state.cellLayouts[5]({ nativeEvent: { layout: { y: 900, height: 150 } } });
  state.props.onScroll({ nativeEvent: { contentOffset: { y: 910 } } });
  expect(ref.current!.saveAnchor()).toEqual({
    key: rows[5].key,
    date: rows[5].date,
    within: 10,
  });
});

it("waits for an asynchronously mounted target window despite unrelated layout storms", async () => {
  const { rows, ref, render, result, rerender } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  state.props.onScrollToIndexFailed({
    index: 74,
    highestMeasuredFrameIndex: 7,
    averageItemLength: 180,
  });
  rerender(rows);
  expect(state.props.initialScrollIndex).toBe(74);
  const mounted = render.mock.calls
    .slice(-8)
    .map((args) => (args as unknown as [(typeof rows)[number]])[0].key);
  expect(mounted).toEqual(rows.slice(74, 82).map((row) => row.key));
  // Neighbor cells/content can arrive on many frames before the target cell itself.
  for (let frame = 0; frame < 12; frame++) {
    state.cellLayouts[1]({ nativeEvent: { layout: { y: 1000, height: 240 } } });
    state.props.onContentSizeChange();
    state.props.onViewableItemsChanged({
      viewableItems: [{ item: rows[75], index: 75, isViewable: true }],
      changed: [],
    });
    for (const next of state.frames.splice(0)) next();
    await vi.advanceTimersByTimeAsync(25);
  }
  expect(state.scrollToIndex).toHaveBeenCalledTimes(1);
  expect(result).not.toHaveBeenCalled();
  // Native finally measures the actual target; only now can exact alignment run.
  state.cellLayouts[0]({ nativeEvent: { layout: { y: 760, height: 90 } } });
  for (const next of state.frames.splice(0)) next();
  expect(state.scrollToIndex).toHaveBeenLastCalledWith({
    index: 74,
    animated: false,
    viewOffset: 0,
  });
  expect(state.scrollToIndex).toHaveBeenCalledTimes(2);
  expect(result).not.toHaveBeenCalled();
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[74], index: 74, isViewable: true }],
    changed: [],
  });
  expect(result).toHaveBeenLastCalledWith("REACHED", rows[74].date);
  await vi.advanceTimersByTimeAsync(5000);
  expect(result).toHaveBeenCalledTimes(1);
});
it("cancels late target completion after a user begins dragging", () => {
  const { rows, ref, result } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  state.props.onScrollToIndexFailed({ index: 74 });
  state.props.onScrollBeginDrag();
  state.props.onViewableItemsChanged({
    viewableItems: [{ item: rows[74], index: 74, isViewable: true }],
    changed: [],
  });
  vi.advanceTimersByTime(5000);
  expect(result).not.toHaveBeenCalled();
});
