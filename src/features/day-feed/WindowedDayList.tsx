import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
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
  const layouts = useRef(new Map<string, { y: number; height: number }>());
  const offset = useRef(0);
  const saved = useRef<DayScrollAnchor | null>(null);
  const pending = useRef<{ anchor: DayScrollAnchor; attempts: number } | null>(null);
  const scheduled = useRef<number | null>(null);
  const attempt = useCallback(() => {
    const request = pending.current;
    if (!request) return;
    const target = resolveDayAnchor(live.current.rows, request.anchor);
    if (!target) {
      pending.current = null;
      return;
    }
    if (request.attempts >= 3) {
      pending.current = null;
      live.current.onJumpResult?.("UNMEASURED", request.anchor.date);
      return;
    }
    request.attempts++;
    list.current?.scrollToIndex({
      index: target.index,
      animated: false,
      viewOffset: live.current.topInset - target.within,
    });
  }, []);
  const restore = useCallback(
    (anchor: DayScrollAnchor) => {
      if (!resolveDayAnchor(live.current.rows, anchor)) return false;
      pending.current = { anchor, attempts: 0 };
      attempt();
      return true;
    },
    [attempt],
  );
  const index = indexDayRows(rows);
  const retry = useCallback(() => {
    if (!pending.current || scheduled.current !== null) return;
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
      pending.current = null;
    };
    // The scope is account/Trip identity; sync and timezone revisions must not reset reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  useLayoutEffect(() => {
    const keys = new Set(rows.map((row) => row.key));
    for (const key of layouts.current.keys())
      if (!keys.has(key)) layouts.current.delete(key);
    if (saved.current && !pending.current) restore(saved.current);
    // Preserve the stable row anchor when sync inserts/reorders rows or Focus changes heights.
  }, [rows, restore]);
  const viewability = useCallback<
    NonNullable<FlatListProps<DayWindowRow<T>>["onViewableItemsChanged"]>
  >(
    ({ viewableItems }) => {
      const visible = viewableItems
        .filter((token) => token.isViewable && token.index !== null)
        .sort((a, b) => a.index! - b.index!);
      visibleDates.current = [...new Set(visible.map(({ item }) => item.date))];
      live.current.onVisibleDates?.(visibleDates.current);
      if (visibleDates.current.length)
        live.current.onViewportChange?.({
          firstVisibleDate: visibleDates.current[0],
          lastVisibleDate: visibleDates.current[visibleDates.current.length - 1],
          scrollOffset: offset.current,
        });
      const request = pending.current;
      if (request && visible.some(({ item }) => item.key === request.anchor.key)) {
        pending.current = null;
        saved.current = request.anchor;
        live.current.onJumpResult?.("REACHED", request.anchor.date);
      } else retry();
    },
    [retry],
  );
  return (
    <FlatList
      key={scopeKey}
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
        pending.current = null;
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
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        list.current?.scrollToOffset({
          offset: Math.max(0, index * averageItemLength - live.current.topInset),
          animated: false,
        });
        retry();
      }}
      onContentSizeChange={retry}
      debug={false}
    />
  );
}
