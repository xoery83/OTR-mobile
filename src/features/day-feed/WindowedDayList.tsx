import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
  type Ref,
} from "react";
import {
  FlatList,
  View,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  dayListWindow,
  indexDayRows,
  previousDayOrigin,
  resolveDayAnchor,
  type DayScrollAnchor,
  type DayWindowRow,
} from "./dayFeedWindow";

export type DayListHandle = {
  jumpToDayHeader(date: string): boolean;
  restoreAnchor(anchor: DayScrollAnchor): boolean;
  saveAnchor(): DayScrollAnchor | null;
};
type DayCellProps<T> = ComponentProps<
  NonNullable<FlatListProps<DayWindowRow<T>>["CellRendererComponent"]>
>;

// One flat native list; the existing owning stream/renderer remains the only business pipeline.
export function WindowedDayList<T>({
  rows,
  renderRow,
  listRef,
  scopeKey,
  initialAnchor,
  layoutRevision,
  topInset = 0,
  bottomInset = 0,
  style,
  contentContainerStyle,
  header,
  onAnchorChange,
  onVisibleDates,
  onOffsetChange,
  onViewportChange,
  onInteraction,
  onMountedRowsChange,
  onJumpResult,
}: {
  rows: readonly DayWindowRow<T>[];
  renderRow(row: DayWindowRow<T>): ReactNode;
  listRef?: Ref<DayListHandle>;
  scopeKey: string;
  initialAnchor?: DayScrollAnchor | null;
  layoutRevision?: string | number;
  topInset?: number;
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header?: ReactNode;
  onAnchorChange?(anchor: DayScrollAnchor): void;
  onVisibleDates?(dates: readonly string[]): void;
  onOffsetChange?(offset: number): void;
  onViewportChange?(viewport: {
    firstVisibleDate: string;
    lastVisibleDate: string;
    scrollOffset: number;
    originIndex: number;
  }): void;
  onInteraction?(): void;
  onMountedRowsChange?(count: number): void;
  onJumpResult?(result: "REACHED" | "UNMEASURED", date: string): void;
}) {
  const index = indexDayRows(rows);
  const listEpoch = useRef(0);
  const [windowStart, setWindowStart] = useState({
    scopeKey,
    key: "",
    date: "",
    revision: 0,
  });
  const renderedEpoch = windowStart.scopeKey === scopeKey ? windowStart.revision : -1;
  const origin =
    windowStart.scopeKey === scopeKey
      ? (index.keys.get(windowStart.key) ?? index.dates.get(windowStart.date) ?? 0)
      : 0;
  const list = useRef<FlatList<DayWindowRow<T>>>(null);
  const live = useRef({
    rows,
    origin,
    epoch: renderedEpoch,
    scopeKey,
    topInset,
    onAnchorChange,
    onVisibleDates,
    onOffsetChange,
    onJumpResult,
    onMountedRowsChange,
    onViewportChange,
  });
  useLayoutEffect(() => {
    live.current = {
      rows,
      origin,
      epoch: renderedEpoch,
      scopeKey,
      topInset,
      onAnchorChange,
      onVisibleDates,
      onOffsetChange,
      onJumpResult,
      onMountedRowsChange,
      onViewportChange,
    };
  });
  const mounted = useRef(0);
  const visibleDates = useRef<string[]>([]);
  const cells = useRef(
    new Map<string, { node: View; epoch: number; listEpoch: number }>(),
  );
  const cellEpoch = useRef(0);
  const [jumping, setJumping] = useState(false);
  const offset = useRef(0);
  const dragging = useRef(false);
  const lastNativeOffset = useRef(0);
  const prepending = useRef(false);
  const contentHeight = useRef(0);
  const saved = useRef<DayScrollAnchor | null>(null);
  const pending = useRef<{
    anchor: DayScrollAnchor;
    attempts: number;
    epoch: number;
    serial: number;
    confirmed: boolean;
    lastOffset: number | null;
  } | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleKeys = useRef(new Set<string>());
  const diagnostic = useRef({ request: 0, count: 0, until: 0, targetKey: "" });
  const trace = useCallback(
    (phase: string, values: Record<string, number | boolean | string> = {}) => {
      const current = diagnostic.current;
      if (
        typeof __DEV__ !== "undefined" &&
        __DEV__ &&
        current.request &&
        current.count < 200 &&
        Date.now() < current.until
      ) {
        current.count++;
        console.info(
          JSON.stringify({
            event: "day_window_diagnostic",
            request: current.request,
            phase,
            ...values,
          }),
        );
      }
    },
    [],
  );
  const scheduled = useRef<number | null>(null);
  const finish = useCallback(
    (result?: "REACHED" | "UNMEASURED") => {
      const request = pending.current;
      if (request)
        trace("FINISH", { result: result ?? "CANCELLED", attempts: request.attempts });
      pending.current = null;
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
      scheduled.current = null;
      if (deadline.current !== null) clearTimeout(deadline.current);
      deadline.current = null;
      setJumping(false);
      if (request && result) {
        if (result === "REACHED") {
          saved.current = request.anchor;
          live.current.onAnchorChange?.(request.anchor);
        }
        live.current.onJumpResult?.(result, request.anchor.date);
      }
    },
    [trace],
  );
  const resolveRequest = useCallback(() => {
    const request = pending.current;
    if (!request) return null;
    const target = resolveDayAnchor(live.current.rows, request.anchor);
    if (!target) {
      finish("UNMEASURED");
      return null;
    }
    const row = live.current.rows[target.index];
    request.anchor = { key: row.key, date: row.date, within: target.within };
    return { request, target };
  }, [finish]);
  const attempt = useCallback(
    function measureTarget() {
      const resolved = resolveRequest();
      if (!resolved) return;
      const { request, target } = resolved;
      const cell = cells.current.get(request.anchor.key);
      const viewport = list.current?.getNativeScrollRef();
      if (
        !cell ||
        !viewport ||
        !("measureInWindow" in viewport) ||
        cell.listEpoch !== request.epoch ||
        live.current.epoch !== request.epoch ||
        listEpoch.current !== request.epoch
      )
        return;
      // Native window coordinates remain authoritative when virtual spacers replace prior rows.
      const serial = ++request.serial;
      const startOffset = offset.current;
      viewport.measureInWindow((_vx, viewportY, _vw, viewportHeight) => {
        cell.node.measureInWindow((_cx, cellY, _cw, cellHeight) => {
          if (
            pending.current !== request ||
            listEpoch.current !== request.epoch ||
            live.current.epoch !== request.epoch ||
            request.serial !== serial ||
            cells.current.get(request.anchor.key) !== cell ||
            offset.current !== startOffset
          )
            return;
          if (
            ![viewportY, viewportHeight, cellY, cellHeight].every(Number.isFinite) ||
            viewportHeight <= 0 ||
            cellHeight <= 0
          )
            return;
          request.anchor.within = Math.min(
            request.anchor.within,
            Math.max(0, cellHeight - 1),
          );
          const desired = Math.max(
            0,
            startOffset +
              cellY -
              viewportY +
              request.anchor.within -
              live.current.topInset,
          );
          const expected =
            contentHeight.current > 0
              ? Math.min(desired, Math.max(0, contentHeight.current - viewportHeight))
              : desired;
          const targetVisible =
            visibleKeys.current.has(request.anchor.key) &&
            cellY + cellHeight > viewportY + live.current.topInset &&
            cellY < viewportY + viewportHeight;
          trace("NATIVE_GEOMETRY", {
            index: target.index,
            localIndex: target.index - live.current.origin,
            origin: live.current.origin,
            listEpoch: request.epoch,
            epoch: cell.epoch,
            cellY,
            cellHeight,
            viewportY,
            viewportHeight,
            offset: startOffset,
            expected,
            targetVisible,
          });
          if (Math.abs(expected - startOffset) <= 2 && targetVisible) {
            if (request.confirmed) finish("REACHED");
            else {
              request.confirmed = true;
              scheduled.current = requestAnimationFrame(() => {
                scheduled.current = null;
                measureTarget();
              });
            }
            return;
          }
          request.confirmed = false;
          if (
            Math.abs(expected - startOffset) <= 2 ||
            (request.lastOffset !== null && Math.abs(request.lastOffset - expected) < 0.5)
          )
            return;
          if (request.attempts >= 8) {
            finish("UNMEASURED");
            return;
          }
          request.lastOffset = expected;
          request.attempts++;
          list.current?.scrollToOffset({ offset: expected, animated: false });
        });
      });
    },
    [resolveRequest, trace, finish],
  );
  const retry = useCallback(() => {
    if (!pending.current || scheduled.current !== null) return;
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = null;
      attempt();
    });
  }, [attempt]);
  const restore = useCallback(
    (anchor: DayScrollAnchor) => {
      const target = resolveDayAnchor(live.current.rows, anchor);
      if (!target) return false;
      finish();
      diagnostic.current = {
        request: diagnostic.current.request + 1,
        count: 0,
        until: Date.now() + 10000,
        targetKey: live.current.rows[target.index].key,
      };
      trace("REQUEST", { index: target.index, within: target.within });
      const epoch = ++listEpoch.current;
      cells.current.clear();
      visibleKeys.current.clear();
      visibleDates.current = [];
      offset.current = 0;
      lastNativeOffset.current = 0;
      contentHeight.current = 0;
      dragging.current = false;
      prepending.current = false;
      const row = live.current.rows[target.index];
      setWindowStart({
        scopeKey: live.current.scopeKey,
        key: row.key,
        date: row.date,
        revision: epoch,
      });
      trace("DATA_ORIGIN", { index: target.index, localIndex: 0, listEpoch: epoch });
      const request = {
        anchor,
        attempts: 0,
        epoch,
        serial: 0,
        confirmed: false,
        lastOffset: null,
      };
      pending.current = request;
      setJumping(true);
      deadline.current = setTimeout(() => {
        if (pending.current === request) finish("UNMEASURED");
      }, 5000);
      retry();
      return true;
    },
    [finish, trace, retry],
  );
  const rowSignature = JSON.stringify(rows.map(({ key, date }) => [key, date]));
  const Cell = useCallback(
    function Cell({
      item,
      cellKey: _cellKey,
      index: cellIndex,
      children,
      onLayout,
      ...props
    }: DayCellProps<T>) {
      const ownCell = useRef<{ node: View; epoch: number; listEpoch: number } | null>(
        null,
      );
      const attach = useCallback(
        (node: View | null) => {
          if (node) {
            const cell = {
              node,
              epoch: ++cellEpoch.current,
              listEpoch: listEpoch.current,
            };
            ownCell.current = cell;
            cells.current.set(item.key, cell);
            if (item.key === diagnostic.current.targetKey)
              trace("TARGET_MOUNT", {
                localIndex: cellIndex,
                origin: live.current.origin,
                epoch: cell.epoch,
                listEpoch: cell.listEpoch,
              });
            retry();
          } else {
            const cell = ownCell.current;
            if (cells.current.get(item.key) === cell) cells.current.delete(item.key);
            if (cell && item.key === diagnostic.current.targetKey)
              trace("TARGET_UNMOUNT", {
                localIndex: cellIndex,
                epoch: cell.epoch,
                listEpoch: cell.listEpoch,
              });
            ownCell.current = null;
          }
        },
        [item.key, cellIndex],
      );
      useEffect(() => {
        live.current.onMountedRowsChange?.(++mounted.current);
        return () => {
          live.current.onMountedRowsChange?.(--mounted.current);
        };
      }, []);
      return (
        <View
          {...props}
          ref={attach}
          collapsable={false}
          onLayout={(event) => {
            onLayout?.(event);
            retry();
          }}
        >
          {children}
        </View>
      );
    },
    [retry, trace],
  );
  useImperativeHandle(listRef, () => ({
    jumpToDayHeader(date) {
      const target = index.dates.get(date);
      return target === undefined
        ? false
        : restore({ key: rows[target].key, date, within: 0 });
    },
    restoreAnchor: restore,
    saveAnchor: () => saved.current,
  }));
  useLayoutEffect(() => {
    trace("WINDOW_COMMITTED", {
      index: origin,
      revision: windowStart.revision,
    });
  }, [windowStart, origin, trace]);
  useLayoutEffect(() => {
    saved.current = initialAnchor ?? null;
    if (initialAnchor) restore(initialAnchor);
    else if (windowStart.scopeKey !== scopeKey) {
      const epoch = ++listEpoch.current;
      cells.current.clear();
      visibleKeys.current.clear();
      visibleDates.current = [];
      offset.current = 0;
      contentHeight.current = 0;
      lastNativeOffset.current = 0;
      dragging.current = false;
      prepending.current = false;
      setWindowStart({ scopeKey, key: "", date: "", revision: epoch });
    }
    return () => {
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
      scheduled.current = null;
      finish();
    };
    // The scope is account/Trip identity; sync and timezone revisions must not reset reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  useLayoutEffect(() => {
    // Re-resolve the stable identity; only mounted native geometry can describe this revision.
    if (saved.current && !pending.current) {
      restore(saved.current);
    }
    // Array/callback identity changes caused by reading updates are not layout changes.
  }, [rowSignature, layoutRevision, restore]);
  const recordAnchor = useCallback(() => {
    if (pending.current) return;
    const viewport = list.current?.getNativeScrollRef();
    if (!viewport || !("measureInWindow" in viewport)) return;
    const startOffset = offset.current,
      scope = live.current.scopeKey,
      epoch = listEpoch.current;
    viewport.measureInWindow((_x, viewportY) => {
      for (const key of visibleKeys.current) {
        const cell = cells.current.get(key);
        if (!cell) continue;
        cell.node.measureInWindow((_cx, cellY, _w, height) => {
          if (
            pending.current ||
            offset.current !== startOffset ||
            live.current.scopeKey !== scope ||
            listEpoch.current !== epoch ||
            cells.current.get(key) !== cell
          )
            return;
          const within = viewportY + live.current.topInset - cellY;
          const row = live.current.rows.find((row) => row.key === key);
          if (!row || !Number.isFinite(within) || within < 0 || within >= height) return;
          const anchor = { key, date: row.date, within };
          saved.current = anchor;
          live.current.onAnchorChange?.(anchor);
        });
      }
    });
  }, []);
  const prependPrevious = useCallback(
    (position: number, trigger: "drag-begin" | "scroll") => {
      const current = live.current;
      if (
        current.epoch !== listEpoch.current ||
        pending.current ||
        !dragging.current ||
        prepending.current ||
        position > 200 ||
        current.origin <= 0
      )
        return;
      const previous = previousDayOrigin(current.rows, current.origin);
      const row = current.rows[previous];
      prepending.current = true;
      trace("PREPEND", {
        fromOrigin: current.origin,
        origin: previous,
        listEpoch: current.epoch,
        trigger,
      });
      setWindowStart((window) => ({ ...window, key: row.key, date: row.date }));
    },
    [trace],
  );
  const viewability = useCallback<
    NonNullable<FlatListProps<DayWindowRow<T>>["onViewableItemsChanged"]>
  >(
    ({ viewableItems }) => {
      if (renderedEpoch !== listEpoch.current) return;
      const visible = viewableItems
        .filter((token) => token.isViewable && token.index !== null)
        .sort((a, b) => a.index! - b.index!);
      trace("VISIBLE", {
        first: visible.length ? live.current.origin + visible[0].index! : -1,
        last: visible.length
          ? live.current.origin + visible[visible.length - 1].index!
          : -1,
        localFirst: visible[0]?.index ?? -1,
        origin: live.current.origin,
        listEpoch: renderedEpoch,
        targetPresent: visible.some(
          ({ item }) => item.key === diagnostic.current.targetKey,
        ),
        offset: offset.current,
      });
      visibleKeys.current = new Set(visible.map(({ item }) => item.key));
      visibleDates.current = [...new Set(visible.map(({ item }) => item.date))];
      live.current.onVisibleDates?.(visibleDates.current);
      if (visibleDates.current.length)
        live.current.onViewportChange?.({
          firstVisibleDate: visibleDates.current[0],
          lastVisibleDate: visibleDates.current[visibleDates.current.length - 1],
          scrollOffset: offset.current,
          originIndex: live.current.origin,
        });
      resolveRequest();
      retry();
      recordAnchor();
    },
    [retry, resolveRequest, trace, recordAnchor, renderedEpoch],
  );
  return (
    <FlatList
      key={`${scopeKey}:${windowStart.scopeKey === scopeKey ? windowStart.revision : 0}`}
      initialScrollIndex={0}
      ref={list}
      data={rows.slice(origin)}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => <>{renderRow(item)}</>}
      CellRendererComponent={Cell}
      ListHeaderComponent={
        origin === 0 ? (
          header ? (
            <>{header}</>
          ) : null
        ) : (
          <View style={{ height: topInset }} />
        )
      }
      {...dayListWindow}
      removeClippedSubviews={false}
      maintainVisibleContentPosition={jumping ? undefined : { minIndexForVisible: 0 }}
      style={style}
      contentContainerStyle={[contentContainerStyle, { paddingBottom: bottomInset }]}
      scrollIndicatorInsets={{ top: topInset, bottom: bottomInset }}
      scrollEventThrottle={16}
      onLayout={() => {
        if (renderedEpoch === listEpoch.current) retry();
      }}
      onScrollBeginDrag={() => {
        if (renderedEpoch !== listEpoch.current) return;
        dragging.current = true;
        // Layout/overscroll from this gesture must not unlock another previous-date prepend.
        prepending.current = false;
        diagnostic.current.count = 0;
        diagnostic.current.until = Date.now() + 10000;
        trace("DRAG_BEGIN", { origin, listEpoch: renderedEpoch });
        finish();
        onInteraction?.();
        prependPrevious(offset.current, "drag-begin");
      }}
      onScrollEndDrag={() => {
        if (renderedEpoch !== listEpoch.current) return;
        trace("DRAG_END", { origin, listEpoch: renderedEpoch });
        dragging.current = false;
      }}
      onScroll={(event) => {
        if (renderedEpoch !== listEpoch.current) return;
        const rawOffset = event.nativeEvent.contentOffset.y;
        const movingUp = dragging.current && rawOffset < lastNativeOffset.current - 1;
        lastNativeOffset.current = rawOffset;
        if (movingUp) prependPrevious(rawOffset, "scroll");
        offset.current = Math.max(0, event.nativeEvent.contentOffset.y);
        trace("SCROLL", { offset: offset.current });
        live.current.onOffsetChange?.(offset.current);
        if (visibleDates.current.length)
          live.current.onViewportChange?.({
            firstVisibleDate: visibleDates.current[0],
            lastVisibleDate: visibleDates.current[visibleDates.current.length - 1],
            scrollOffset: offset.current,
            originIndex: live.current.origin,
          });
        if (pending.current) {
          retry();
          return;
        }
        recordAnchor();
      }}
      onViewableItemsChanged={viewability}
      viewabilityConfig={{ itemVisiblePercentThreshold: 1 }}
      onContentSizeChange={(_width, height) => {
        if (renderedEpoch !== listEpoch.current) return;
        contentHeight.current = height;
        trace("CONTENT_SIZE", { height });
        retry();
      }}
      debug={false}
    />
  );
}
