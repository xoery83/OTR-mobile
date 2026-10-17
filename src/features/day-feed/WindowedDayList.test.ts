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
  rerender: (() => {}) as () => void,
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
  nativeOffset: 0,
  nativeHeight: 500,
  nodes: [] as any[],
  deferMeasurements: false,
  measurements: [] as (() => void)[],
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
    View: ({ children, onLayout, ref }: any) => {
      const node = {
        y: 1000,
        height: 100,
        measureInWindow: vi.fn((callback: (...values: number[]) => void) => {
          const y = node.y - state.nativeOffset,
            height = node.height;
          const done = () => callback(0, y, 390, height);
          if (state.deferMeasurements) state.measurements.push(done);
          else done();
        }),
        detach: () => ref?.(null),
      };
      state.nodes.push(node);
      ref?.(node);
      if (onLayout) state.cellLayouts.push(onLayout);
      return createElement("div", {}, children);
    },
    FlatList: forwardRef((props: any, ref: any) => {
      state.props = props;
      if (ref)
        ref.current = {
          getNativeScrollRef: () => ({
            measureInWindow: (callback: (...values: number[]) => void) => {
              const done = () => callback(0, 0, 390, state.nativeHeight);
              if (state.deferMeasurements) state.measurements.push(done);
              else done();
            },
          }),
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
  state.nativeOffset = 0;
  state.nativeHeight = 500;
  state.nodes = [];
  state.deferMeasurements = false;
  state.measurements = [];
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
function setup(
  topInset = 0,
  days = 90,
  coldAnchor?: { key: string; date: string; within: number },
) {
  let date = "2026-10-01";
  const rows = Array.from({ length: days }, () => {
    const own = date;
    date = nextCalendarDate(date);
    return { key: `header:${own}`, date: own, value: "HEADER" };
  });
  const ref = { current: null as DayListHandle | null };
  const render = vi.fn((_row: { key: string }) => createElement("span", {}, "day"));
  const count = vi.fn(),
    result = vi.fn(),
    readingMotion = vi.fn(),
    anchorChanged = vi.fn();
  const rerender = (
    nextRows = rows,
    layoutRevision?: string,
    initialAnchor = coldAnchor,
    scopeKey = "account/trip",
  ) => {
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
        scopeKey,
        initialAnchor,
        topInset,
        onMountedRowsChange: count,
        onJumpResult: result,
        onAnchorChange: anchorChanged,
        onReadingMotion: readingMotion,
      }),
    );
    for (const effect of state.effects) effect();
  };
  state.rerender = () => rerender();
  rerender();
  return { rows, ref, render, count, result, rerender, anchorChanged, readingMotion };
}
function touch(pageY: number, identifier = "1", count = 1) {
  return { nativeEvent: { pageY, identifier, touches: Array(count).fill({}) } };
}

it("uses actual reading gestures rather than native offset compensation or momentum", () => {
  const { readingMotion } = setup();
  state.props.onTouchStart(touch(700));
  state.props.onScrollBeginDrag();
  scroll(899.6667);
  state.props.onContentSizeChange(400, 3859.3333);
  expect(readingMotion).not.toHaveBeenCalled();
  state.props.onTouchMove(touch(660));
  state.props.onTouchMove(touch(668));
  expect(readingMotion.mock.calls).toEqual([[40], [-8]]);
  state.props.onScrollEndDrag();
  state.props.onTouchMove(touch(600));
  scroll(1300);
  expect(readingMotion).toHaveBeenCalledTimes(2);
});

it("retains the sole real touch move delivered before native drag begins", () => {
  const { readingMotion } = setup();
  state.props.onTouchStart(touch(700));
  state.props.onTouchMove(touch(660));
  scroll(899.6667);
  expect(readingMotion).not.toHaveBeenCalled();
  state.props.onScrollBeginDrag();
  state.props.onScrollEndDrag();
  scroll(1800);
  expect(readingMotion.mock.calls).toEqual([[40]]);

  state.props.onTouchEnd();
  state.props.onTouchStart(touch(660));
  state.props.onTouchMove(touch(668));
  state.props.onScrollBeginDrag();
  state.props.onScrollEndDrag();
  expect(readingMotion.mock.calls).toEqual([[40], [-8]]);
});

it("does not turn a tap, cancellation or multi-touch into buffered reading motion", () => {
  const { readingMotion } = setup();
  state.props.onTouchStart(touch(700));
  state.props.onTouchMove(touch(698));
  state.props.onTouchEnd();
  state.props.onScrollBeginDrag();
  state.props.onScrollEndDrag();
  state.props.onTouchStart(touch(700));
  state.props.onTouchMove(touch(650));
  state.props.onTouchCancel();
  state.props.onScrollBeginDrag();
  state.props.onScrollEndDrag();
  state.props.onTouchStart(touch(700));
  state.props.onTouchMove(touch(650));
  state.props.onTouchMove(touch(640, "1", 2));
  state.props.onScrollBeginDrag();
  expect(readingMotion).not.toHaveBeenCalled();
});

it("rejects cancelled, multi-touch and retired list gestures", () => {
  const { readingMotion, rerender, rows } = setup();
  state.props.onTouchStart(touch(700));
  state.props.onScrollBeginDrag();
  state.props.onTouchCancel();
  state.props.onTouchMove(touch(600));
  state.props.onTouchStart(touch(700));
  state.props.onTouchMove(touch(600, "1", 2));
  state.props.onTouchMove(touch(500));
  state.props.onTouchStart(touch(700));
  const retired = state.props;
  rerender(rows, undefined, undefined, "other/trip");
  retired.onTouchMove(touch(600));
  expect(readingMotion).not.toHaveBeenCalled();
});
it("cannot flush another finger or a retired list touch into a new drag", () => {
  const { readingMotion, rerender, rows } = setup();
  state.props.onTouchStart(touch(700));
  state.props.onTouchMove(touch(650, "other"));
  state.props.onScrollBeginDrag();
  expect(readingMotion).not.toHaveBeenCalled();
  state.props.onScrollEndDrag();
  state.props.onTouchStart(touch(700));
  state.props.onTouchMove(touch(650));
  const retired = state.props;
  rerender(rows, undefined, undefined, "other/trip");
  retired.onScrollBeginDrag();
  state.props.onScrollBeginDrag();
  expect(readingMotion).not.toHaveBeenCalled();
});

function flushFrames(count = 4) {
  for (let frame = 0; frame < count; frame++)
    for (const callback of state.frames.splice(0)) callback();
}

function scroll(y: number) {
  state.nativeOffset = y;
  state.props.onScroll({ nativeEvent: { contentOffset: { y } } });
}
function visible(row: any, index: number) {
  state.props.onViewableItemsChanged({
    viewableItems: [
      {
        item: row,
        index:
          state.props.data.findIndex((item: any) => item.key === row.key) >= 0
            ? state.props.data.findIndex((item: any) => item.key === row.key)
            : index,
        isViewable: true,
      },
    ],
  });
}
function mount(row: any, index: number, nativeY = 1000, reportedY = nativeY) {
  state.rerender();
  renderToStaticMarkup(
    createElement(state.props.CellRendererComponent, {
      item: row,
      index,
      cellKey: row.key,
    }),
  );
  const node = state.nodes.at(-1)!;
  node.y = nativeY;
  state.cellLayouts.at(-1)!({ nativeEvent: { layout: { y: reportedY, height: 100 } } });
  return node;
}

function reach(row: any, index: number, within = 0, inset = 0) {
  const node = mount(row, index);
  flushFrames(1);
  scroll(node.y + within - inset);
  visible(row, index);
  flushFrames();
  return node;
}
it("keeps one bounded FlatList and does not mount all 90 days for a date request", () => {
  const { rows, ref, render, rerender } = setup();
  expect(render).toHaveBeenCalledTimes(8);
  expect(state.props.maxToRenderPerBatch).toBe(8);
  ref.current!.jumpToDayHeader(rows[74].date);
  rerender();
  expect(state.props.maintainVisibleContentPosition).toBeUndefined();
  flushFrames(1);
  expect(state.scrollToIndex).not.toHaveBeenCalled();
  expect(state.props.initialScrollIndex).toBe(0);
  expect(state.props.data[0].key).toBe(rows[74].key);
  expect(ref.current!.jumpToDayHeader("2027-01-01")).toBe(false);
});
it("uses live native target/viewport geometry, ignoring stale virtual-spacer absolute y", () => {
  const { rows, ref, result, rerender } = setup(131, 110);
  ref.current!.jumpToDayHeader(rows[99].date);
  flushFrames(1);
  rerender();
  expect(state.props.initialScrollIndex).toBe(0);
  expect(state.props.data[0].key).toBe(rows[99].key);
  state.props.onContentSizeChange(390, 12000);
  // RN can report an old cell layout while current native coordinates have changed.
  const node = mount(rows[99], 99, 10100, 8301.667);
  scroll(8185.667);
  visible(rows[79], 79);
  flushFrames(1);
  expect(state.scrollToOffset.mock.lastCall![0].offset).toBeCloseTo(9969);
  expect(result).not.toHaveBeenCalled();
  scroll(9969);
  visible(rows[99], 99);
  flushFrames();
  expect(node.measureInWindow).toHaveBeenCalled();
  expect(result).toHaveBeenLastCalledWith("REACHED", rows[99].date);
});
it("re-measures a changed native spacer without reusing a cached target y", () => {
  const { rows, ref, result } = setup(131, 110);
  ref.current!.jumpToDayHeader(rows[99].date);
  const node = mount(rows[99], 99, 211);
  state.props.onContentSizeChange(390, 12000);
  flushFrames(1);
  expect(state.scrollToOffset).toHaveBeenLastCalledWith({ offset: 80, animated: false });
  node.y = 10100;
  scroll(80);
  state.props.onContentSizeChange(390, 14000);
  flushFrames(1);
  expect(state.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 9969,
    animated: false,
  });
  expect(result).not.toHaveBeenCalled();
});
it("requires both actual target visibility and geometry alignment before reporting REACHED", () => {
  const { rows, ref, result } = setup(131);
  ref.current!.restoreAnchor({ key: rows[50].key, date: rows[50].date, within: 22 });
  mount(rows[50], 50);
  state.props.onContentSizeChange(390, 12000);
  flushFrames(1);
  scroll(891);
  visible(rows[49], 49);
  flushFrames();
  expect(result).not.toHaveBeenCalled();
  visible(rows[50], 50);
  flushFrames(1);
  expect(result).not.toHaveBeenCalled();
  flushFrames(1);
  expect(result).toHaveBeenCalledWith("REACHED", rows[50].date);
  expect(ref.current!.saveAnchor()).toEqual({
    key: rows[50].key,
    date: rows[50].date,
    within: 22,
  });
});
it("does not scroll or complete from a late measurement after the target unmounts", () => {
  const { rows, ref, result } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  const node = mount(rows[74], 74);
  state.deferMeasurements = true;
  flushFrames(1);
  state.measurements.shift()!(); // viewport callback schedules cell callback
  node.detach();
  state.measurements.shift()!();
  expect(state.scrollToOffset).not.toHaveBeenCalled();
  vi.advanceTimersByTime(5000);
  expect(result).toHaveBeenLastCalledWith("UNMEASURED", rows[74].date);
});
it.each(["drag", "supersede"])("isolates late native results after %s", (reason) => {
  const { rows, ref, result } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  mount(rows[74], 74);
  state.deferMeasurements = true;
  flushFrames(1);
  state.measurements.shift()!();
  if (reason === "drag") state.props.onScrollBeginDrag();
  else ref.current!.jumpToDayHeader(rows[10].date);
  state.measurements.shift()!();
  expect(state.scrollToOffset).not.toHaveBeenCalled();
  expect(result).not.toHaveBeenCalledWith("REACHED", rows[74].date);
});
it("does not report stale measurements if native offset changes during the callbacks", () => {
  const { rows, ref } = setup();
  ref.current!.jumpToDayHeader(rows[50].date);
  mount(rows[50], 50);
  state.deferMeasurements = true;
  flushFrames(1);
  state.measurements.shift()!();
  scroll(200);
  state.measurements.shift()!();
  expect(state.scrollToOffset).not.toHaveBeenCalled();
});
it("has no unknown prefix or index-based retry when a target window never produces live geometry", () => {
  const { rows, ref, result, rerender } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  rerender();
  expect(state.props.data[0]).toBe(rows[74]);
  for (const node of state.nodes.slice(-8)) node.detach();
  for (let i = 0; i < 20; i++) {
    state.props.onContentSizeChange(390, 5000);
    flushFrames(1);
  }
  expect(state.scrollToIndex).not.toHaveBeenCalled();
  expect(state.scrollToOffset).not.toHaveBeenCalled();
  vi.advanceTimersByTime(5000);
  expect(result).toHaveBeenCalledTimes(1);
  expect(result).toHaveBeenCalledWith("UNMEASURED", rows[74].date);
});
it("supports an empty final date at the real native bottom clamp", () => {
  const { rows, ref, result } = setup(131);
  ref.current!.jumpToDayHeader(rows[89].date);
  mount(rows[89], 89, 1100);
  state.props.onContentSizeChange(390, 1200);
  flushFrames(1);
  expect(state.scrollToOffset).toHaveBeenLastCalledWith({ offset: 700, animated: false });
  scroll(700);
  visible(rows[89], 89);
  flushFrames();
  expect(result).toHaveBeenCalledWith("REACHED", rows[89].date);
});
it("normalizes a deleted Item to the same date header, never a different date", () => {
  const { rows, ref, result } = setup();
  ref.current!.restoreAnchor({ key: "deleted", date: rows[50].date, within: 22 });
  reach(rows[50], 50);
  expect(ref.current!.saveAnchor()).toEqual({
    key: rows[50].key,
    date: rows[50].date,
    within: 0,
  });
  expect(result).toHaveBeenCalledWith("REACHED", rows[50].date);
});
it("preserves stable Focus/sync anchors but ignores ordinary fresh array identities", () => {
  const { rows, ref, rerender, result } = setup();
  ref.current!.restoreAnchor({ key: rows[50].key, date: rows[50].date, within: 12 });
  const target = reach(rows[50], 50, 12);
  expect(result).toHaveBeenCalledWith("REACHED", rows[50].date);
  state.scrollToIndex.mockClear();
  rerender([...rows]);
  flushFrames();
  expect(state.scrollToIndex).not.toHaveBeenCalled();
  target.detach();
  rerender([...rows], "focus-height-revision");
  flushFrames();
  rerender([...rows], "focus-height-revision");
  expect(state.props.data[0].key).toBe(rows[50].key);
  expect(state.props.initialScrollIndex).toBe(0);
  expect(state.scrollToIndex).not.toHaveBeenCalled();
});
it("saves anchors from live visible geometry rather than old layout coordinates", () => {
  const { rows, ref } = setup(131);
  mount(rows[5], 5, 1000, 200);
  visible(rows[5], 5);
  scroll(891);
  expect(ref.current!.saveAnchor()).toEqual({
    key: rows[5].key,
    date: rows[5].date,
    within: 22,
  });
});
it("bounds DEV diagnostics to numeric geometry, not Trip IDs or row text", () => {
  vi.stubGlobal("__DEV__", true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const { rows, ref } = setup();
    ref.current!.jumpToDayHeader(rows[74].date);
    state.rerender();
    for (let i = 0; i < 300; i++) state.props.onContentSizeChange(390, 1000 + i);
    expect(log).toHaveBeenCalledTimes(200);
    expect(JSON.stringify(log.mock.calls)).not.toContain(rows[74].key);
    expect(JSON.stringify(log.mock.calls)).not.toContain("account/trip");
  } finally {
    log.mockRestore();
  }
});

it("restores a cold saved anchor using the same live measurement path", () => {
  const anchor = { key: "header:2026-11-20", date: "2026-11-20", within: 18 };
  const { rows, ref, result } = setup(131, 90, anchor);
  reach(rows[50], 50, 18, 131);
  expect(result).toHaveBeenCalledWith("REACHED", anchor.date);
  expect(ref.current!.saveAnchor()).toEqual(anchor);
});
it("rejects an old mount epoch even when a new cell uses the same row key", () => {
  const { rows, ref } = setup();
  ref.current!.jumpToDayHeader(rows[50].date);
  mount(rows[50], 50);
  state.deferMeasurements = true;
  flushFrames(1);
  state.measurements.shift()!();
  mount(rows[50], 50, 9000);
  state.measurements.shift()!();
  expect(state.scrollToOffset).not.toHaveBeenCalled();
});
it("does not redirect a disappeared pending date to another date", () => {
  const { rows, ref, rerender, result } = setup();
  ref.current!.jumpToDayHeader(rows[50].date);
  rerender(rows.filter((row) => row.date !== rows[50].date));
  visible(rows[51], 50);
  expect(result).toHaveBeenCalledWith("UNMEASURED", rows[50].date);
  expect(result).not.toHaveBeenCalledWith("REACHED", expect.anything());
});

it("publishes the measured anchor and clamps an expanded-row offset after Focus shrinks", () => {
  const { rows, ref, result, anchorChanged } = setup();
  ref.current!.restoreAnchor({ key: rows[50].key, date: rows[50].date, within: 300 });
  mount(rows[50], 50);
  flushFrames(1);
  expect(state.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 1099,
    animated: false,
  });
  scroll(1099);
  visible(rows[50], 50);
  flushFrames();
  expect(result).toHaveBeenCalledWith("REACHED", rows[50].date);
  expect(anchorChanged).toHaveBeenCalledWith({
    key: rows[50].key,
    date: rows[50].date,
    within: 99,
  });
});

it("replays old list offset1615 during a jump and starts global99 at local0 with fresh metrics", () => {
  const { rows, ref, result, rerender } = setup(131, 110);
  const old = state.props;
  scroll(1615);
  ref.current!.jumpToDayHeader(rows[99].date);
  rerender();
  expect(state.props.initialScrollIndex).toBe(0);
  expect(state.props.data[0]).toBe(rows[99]);
  // Old FlatList callbacks cannot mutate the new list's zero offset/content facts.
  old.onScroll({ nativeEvent: { contentOffset: { y: 1615 } } });
  old.onContentSizeChange(390, 838);
  state.nativeOffset = 0;
  mount(rows[99], 0, 131);
  state.props.onContentSizeChange(390, 1400);
  visible(rows[99], 0);
  flushFrames();
  expect(state.scrollToIndex).not.toHaveBeenCalled();
  expect(state.scrollToOffset).not.toHaveBeenCalled();
  expect(result).toHaveBeenCalledWith("REACHED", rows[99].date);
});
it("only prepends previous lawful date rows after a real upward gesture, retaining the same list", () => {
  const { rows, ref, rerender } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  rerender();
  state.props.onContentSizeChange(390, 2000);
  visible(rows[74], 0);
  flushFrames();
  rerender();
  expect(state.props.data[0]).toBe(rows[74]);
  state.props.onScroll({ nativeEvent: { contentOffset: { y: -10 } } });
  rerender();
  expect(state.props.data[0]).toBe(rows[74]);
  const listKey = state.props.key;
  state.props.onScrollBeginDrag();
  state.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
  state.props.onScroll({ nativeEvent: { contentOffset: { y: -12 } } });
  rerender();
  expect(state.props.data[0]).toBe(rows[73]);
  expect(state.props.data[1]).toBe(rows[74]);
  expect(state.props.key).toBe(listKey);
  expect(state.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
});
it("keeps missing zone/date-only rows and changes no business descriptor while relocating origin", () => {
  const { rows, ref, rerender, render } = setup(131, 90);
  const before = JSON.stringify(rows);
  ref.current!.jumpToDayHeader(rows[89].date);
  rerender();
  expect(state.props.data).toEqual([rows[89]]);
  expect(JSON.stringify(rows)).toBe(before);
  expect(render.mock.calls.slice(-1)[0][0]).toBe(rows[89]);
});

it("prepends at most one previous date per drag despite a content-layout/overscroll storm", () => {
  const { rows, ref, rerender } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  reach(rows[74], 0);
  rerender();
  scroll(0);
  const listKey = state.props.key;
  state.props.onScrollBeginDrag();
  scroll(-12);
  rerender();
  expect(state.props.data[0]).toBe(rows[73]);
  // A held drag can emit many native content-size/negative-offset cycles.
  for (let frame = 1; frame <= 12; frame++) {
    state.props.onContentSizeChange(390, 10000 + frame * 100);
    scroll(-12 - frame * 3);
    rerender();
  }
  expect(state.props.data[0]).toBe(rows[73]);
  expect(state.props.key).toBe(listKey);
  expect(state.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  // A new deliberate gesture can continue into the next preceding date.
  state.props.onScrollEndDrag();
  state.props.onScrollBeginDrag();
  scroll(-60);
  rerender();
  expect(state.props.data[0]).toBe(rows[72]);
  expect(state.scrollToIndex).not.toHaveBeenCalled();
});

it("prefetches one preceding date on a real top drag even when a short final window emits no scroll", () => {
  const { rows, ref, rerender } = setup(100);
  state.nativeHeight = 874;
  ref.current!.jumpToDayHeader(rows[89].date);
  mount(rows[89], 0, 100);
  state.props.onContentSizeChange(390, 727.67);
  visible(rows[89], 0);
  flushFrames();
  rerender();
  const listKey = state.props.key;
  expect(state.props.data[0]).toBe(rows[89]);
  state.props.onScrollBeginDrag();
  state.props.onScrollEndDrag();
  rerender();
  expect(state.props.data[0]).toBe(rows[88]);
  expect(state.props.data[1]).toBe(rows[89]);
  expect(state.props.key).toBe(listKey);
  expect(state.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  expect(state.scrollToOffset).not.toHaveBeenCalled();
});

it("waits until scrolling reaches the top threshold when a gesture begins farther down", () => {
  const { rows, ref, rerender } = setup();
  ref.current!.jumpToDayHeader(rows[74].date);
  reach(rows[74], 0);
  rerender();
  scroll(400);
  state.props.onScrollBeginDrag();
  rerender();
  expect(state.props.data[0]).toBe(rows[74]);
  scroll(190);
  rerender();
  expect(state.props.data[0]).toBe(rows[73]);
  state.props.onContentSizeChange(390, 12000);
  scroll(100);
  rerender();
  expect(state.props.data[0]).toBe(rows[73]);
});
it("ignores retired list drag-begin events after a new jump epoch or account/Trip scope", () => {
  const { rows, ref, rerender } = setup();
  const retired = state.props;
  ref.current!.jumpToDayHeader(rows[74].date);
  reach(rows[74], 0);
  rerender();
  retired.onScrollBeginDrag();
  rerender();
  expect(state.props.data[0]).toBe(rows[74]);
  const priorScope = state.props;
  rerender(rows, undefined, undefined, "different-account/trip");
  rerender(rows, undefined, undefined, "different-account/trip");
  priorScope.onScrollBeginDrag();
  rerender(rows, undefined, undefined, "different-account/trip");
  expect(state.props.data[0]).toBe(rows[0]);
  expect(state.scrollToIndex).not.toHaveBeenCalled();
});
