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
  captureDayAnchor,
  dayListWindow,
  indexDayRows,
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
  }): void;
  onInteraction?(): void;
  onMountedRowsChange?(count: number): void;
  onJumpResult?(result: "REACHED" | "UNMEASURED", date: string): void;
}) {
  const list = useRef<FlatList<DayWindowRow<T>>>(null);
  const live = useRef({
    rows,
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
  const [windowStart, setWindowStart] = useState({ scopeKey, index: 0, revision: 0 });
  const mounted = useRef(0);
  const visibleDates = useRef<string[]>([]);
  const layouts = useRef(new Map<string, { y: number; height: number }>());
  const offset = useRef(0);
  const saved = useRef<DayScrollAnchor | null>(null);
  const pending = useRef<{
    anchor: DayScrollAnchor;
    attempts: number;
    remounted: boolean;
    aligned: boolean;
  } | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleKeys = useRef(new Set<string>());
  const finish = useCallback((result?: "REACHED" | "UNMEASURED") => {
    const request = pending.current;
    pending.current = null;
    if (deadline.current !== null) clearTimeout(deadline.current);
    deadline.current = null;
    if (request && result) {
      if (result === "REACHED") saved.current = request.anchor;
      live.current.onJumpResult?.(result, request.anchor.date);
    }
  }, []);
  const scheduled = useRef<number | null>(null);
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
  const attempt = useCallback(() => {
    const resolved = resolveRequest();
    if (!resolved) return;
    const { request, target } = resolved;
    if (request.aligned) return;
    if (request.attempts >= 3) {
      finish("UNMEASURED");
      return;
    }
    request.attempts++;
    request.aligned = true;
    list.current?.scrollToIndex({
      index: target.index,
      animated: false,
      viewOffset: live.current.topInset - target.within,
    });
    if (request.aligned && visibleKeys.current.has(request.anchor.key)) finish("REACHED");
  }, [resolveRequest, finish]);
  const restore = useCallback(
    (anchor: DayScrollAnchor, defer = false) => {
      if (!resolveDayAnchor(live.current.rows, anchor)) return false;
      finish();
      const request = { anchor, attempts: 0, remounted: false, aligned: false };
      pending.current = request;
      deadline.current = setTimeout(() => {
        if (pending.current === request) finish("UNMEASURED");
      }, 5000);
      if (defer) {
        scheduled.current = requestAnimationFrame(() => {
          scheduled.current = null;
          attempt();
        });
      } else attempt();
      return true;
    },
    [attempt, finish],
  );
  const index = indexDayRows(rows);
  const rowSignature = JSON.stringify(rows.map(({ key, date }) => [key, date]));
  const retry = useCallback(() => {
    const request = pending.current;
    if (!request || request.aligned || scheduled.current !== null) return;
    if (request.remounted && !layouts.current.has(request.anchor.key)) return;
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = null;
      attempt();
    });
  }, [attempt]);
  const Cell = useCallback(
    function Cell({
      item,
      cellKey: _cellKey,
      index: _index,
      children,
      onLayout,
      ...props
    }: DayCellProps<T>) {
      useEffect(() => {
        live.current.onMountedRowsChange?.(++mounted.current);
        return () => {
          live.current.onMountedRowsChange?.(--mounted.current);
        };
      }, []);
      return (
        <View
          {...props}
          onLayout={(event) => {
            onLayout?.(event);
            layouts.current.set(item.key, event.nativeEvent.layout);
            retry();
          }}
        >
          {children}
        </View>
      );
    },
    [retry],
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
    layouts.current.clear();
    saved.current = initialAnchor ?? null;
    if (initialAnchor) restore(initialAnchor);
    return () => {
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
      scheduled.current = null;
      finish();
    };
    // The scope is account/Trip identity; sync and timezone revisions must not reset reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  useLayoutEffect(() => {
    // Old absolute cell offsets cannot describe an inserted/reordered or resized stream.
    layouts.current.clear();
    if (saved.current && !pending.current) {
      restore(saved.current, true);
    }
    // Array/callback identity changes caused by reading updates are not layout changes.
  }, [rowSignature, layoutRevision, restore]);
  const viewability = useCallback<
    NonNullable<FlatListProps<DayWindowRow<T>>["onViewableItemsChanged"]>
  >(
    ({ viewableItems }) => {
      const visible = viewableItems
        .filter((token) => token.isViewable && token.index !== null)
        .sort((a, b) => a.index! - b.index!);
      visibleKeys.current = new Set(visible.map(({ item }) => item.key));
      visibleDates.current = [...new Set(visible.map(({ item }) => item.date))];
      live.current.onVisibleDates?.(visibleDates.current);
      if (visibleDates.current.length)
        live.current.onViewportChange?.({
          firstVisibleDate: visibleDates.current[0],
          lastVisibleDate: visibleDates.current[visibleDates.current.length - 1],
          scrollOffset: offset.current,
        });
      const request = resolveRequest()?.request;
      if (request?.aligned && visibleKeys.current.has(request.anchor.key))
        finish("REACHED");
      else retry();
    },
    [retry, resolveRequest, finish],
  );
  return (
    <FlatList
      key={`${scopeKey}:${windowStart.scopeKey === scopeKey ? windowStart.revision : 0}`}
      initialScrollIndex={
        windowStart.scopeKey === scopeKey
          ? Math.min(windowStart.index, Math.max(0, rows.length - 1))
          : 0
      }
      ref={list}
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => <>{renderRow(item)}</>}
      CellRendererComponent={Cell}
      ListHeaderComponent={header ? <>{header}</> : null}
      {...dayListWindow}
      removeClippedSubviews={false}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      style={style}
      contentContainerStyle={[contentContainerStyle, { paddingBottom: bottomInset }]}
      scrollIndicatorInsets={{ top: topInset, bottom: bottomInset }}
      scrollEventThrottle={16}
      onScrollBeginDrag={() => {
        finish();
        onInteraction?.();
      }}
      onScroll={(event) => {
        offset.current = Math.max(0, event.nativeEvent.contentOffset.y);
        live.current.onOffsetChange?.(offset.current);
        if (visibleDates.current.length)
          live.current.onViewportChange?.({
            firstVisibleDate: visibleDates.current[0],
            lastVisibleDate: visibleDates.current[visibleDates.current.length - 1],
            scrollOffset: offset.current,
          });
        if (pending.current) return;
        const anchor = captureDayAnchor(
          live.current.rows,
          layouts.current,
          offset.current + live.current.topInset,
        );
        if (anchor) {
          saved.current = anchor;
          live.current.onAnchorChange?.(anchor);
        }
      }}
      onViewableItemsChanged={viewability}
      viewabilityConfig={{ itemVisiblePercentThreshold: 1 }}
      onScrollToIndexFailed={({ index }) => {
        const request = pending.current;
        if (!request) return;
        request.aligned = false;
        if (!request.remounted) {
          // RN constrains an unmeasured tail: mount the target window once, not every earlier day.
          request.remounted = true;
          layouts.current.clear();
          visibleKeys.current.clear();
          setWindowStart((previous) => ({
            scopeKey: live.current.scopeKey,
            index,
            revision: previous.revision + 1,
          }));
        }
        retry();
      }}
      onContentSizeChange={retry}
      debug={false}
    />
  );
}
