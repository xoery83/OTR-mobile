import { LocalManualDayFeed, LocalManualDayRows } from "./LocalManualDayFeed";
import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { WindowedDayList, type DayListHandle } from "./WindowedDayList";
import {
  summarizeDay,
  type DayScrollAnchor,
  type DayWindowRow,
  type DaySummary,
} from "./dayFeedWindow";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { DayProjection, DayViewContext } from "@/domain/trip/dayReadModel";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import type {
  DayFeedQuery,
  DayRowRenderer,
  DayRowRendererProps,
} from "./rendererContribution";
import type { DayEntry, DayReading } from "./TripViewContext";
import { composeDayStream, type DayStreamPorts } from "./composition";
import {
  composedTtrActionability,
  createG2TtrSessionBridge,
  type G2TtrSessionPort,
} from "./ttrSessionBridge";
import {
  FlexibleBlockRow,
  type FlexibleBlockRenderer,
  type FlexibleBlockRendererProps,
} from "./FlexibleBlockRow";
import type { FlightService } from "@/domain/trip/flightAdmission";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { P1Row, type P1MoveInteraction } from "./P1Row";
import { TransitionRow, type ComposedTransition } from "./TransitionRow";
import { FlightRows } from "./FlightRows";
import { FlightFidelityGrid } from "./FlightFidelityGrid";
import { NowMarker } from "./NowMarker";
import { useMinuteClock } from "./useMinuteClock";
import { flightPresentation, type Depth } from "./presentation";
import { useFlexibleSnapshot, type FlexiblePublication } from "./flexibleSnapshot";

function ContributedRow({
  renderer,
  fallback,
  ...props
}: DayRowRendererProps & { renderer: DayRowRenderer; fallback: React.ReactNode }) {
  return renderer(props) ?? fallback;
}

function BlockSlot({
  renderer: Renderer = FlexibleBlockRow,
  ...props
}: FlexibleBlockRendererProps & { renderer?: FlexibleBlockRenderer }) {
  return <Renderer {...props} />;
}

function ImmersiveHeaderSlot({
  renderHeader,
  onClose,
}: {
  renderHeader: (onClose: () => void) => ReactNode;
  onClose: () => void;
}) {
  return renderHeader(onClose);
}

export type DayFeedPresentation = {
  p1Move?: P1MoveInteraction;
  scrollEnabled?: boolean;
  // Optional presentation-only integration seams; composition and Reader authority stay unchanged.
  renderDayHeading?: (date: string, empty: boolean) => ReactNode;
  wrapDayRow?: (date: string, content: ReactNode) => ReactNode;
  listStyle?: StyleProp<ViewStyle>;
  listContentStyle?: StyleProp<ViewStyle>;
  showTimeUnspecified?: boolean;
  immersiveContentStyle?: StyleProp<ViewStyle>;
  renderImmersiveHeader?: (onClose: () => void) => ReactNode;
  listRef?: (value: DayListHandle | null) => void;
  header?: ReactNode;
  formatDayHeading?: (date: string) => string;
  topInset?: number;
  onViewportChange?: (viewport: {
    firstVisibleDate: string;
    lastVisibleDate: string;
    scrollOffset: number;
    originIndex: number;
  }) => void;
  onInteraction?: () => void;
  onOffsetChange?: (offset: number) => void;
  onReadingMotion?: (delta: number) => void;
  onReadingStopped?: () => void;
  onSummaries?: (summaries: DaySummary[]) => void;
  onMountedRowsChange?: (count: number) => void;
};

type DayFeedProps = Omit<Parameters<typeof AcceptedDayFeed>[0], "projection"> & {
  projection?: DayProjection | CoreFlightDayProjection;
  localManual?: LocalManualRead | null;
  onOpenAcceptedP1?: (itemId: string, revision: number) => void;
  onOpenLocalItem?: (
    itemId: string,
    expected: Pick<LocalManualRead, "scope" | "source">,
  ) => void;
};
export function DayFeed(props: DayFeedProps) {
  if (!props.projection && props.localManual)
    return (
      <LocalManualDayFeed
        read={props.localManual}
        date={props.date}
        dates={props.dates}
        onOpenItem={props.onOpenLocalItem}
        emptyMessage={props.emptyMessage}
        bottomInset={props.bottomInset}
        presentation={props.presentation}
        entry={props.entry}
        onReadingChange={props.onReadingChange}
      />
    );
  if (!props.projection) return null;
  return <AcceptedDayFeed {...props} projection={props.projection} />;
}

function AcceptedDayFeed({
  projection,
  date,
  dates,
  zone,
  viewMode,
  services,
  instant,
  emptyMessage,
  bottomInset = 0,
  presentation,
  query: contributedQuery,
  renderer,
  flexibleRenderer,
  ports,
  onOpenTtr,
  flexiblePublication,
  ttrSession,
  entry,
  onReadingChange,
  directItem,
  localManual,
  onOpenLocalItem,
  onOpenAcceptedP1,
}: {
  localManual?: LocalManualRead | null;
  onOpenAcceptedP1?: (itemId: string, revision: number) => void;
  onOpenLocalItem?: (
    itemId: string,
    expected: Pick<LocalManualRead, "scope" | "source">,
  ) => void;
  projection: DayProjection | CoreFlightDayProjection;
  date: string;
  dates?: readonly string[];
  zone: string | null;
  viewMode?: DayViewContext["viewMode"];
  services: Record<string, FlightService[]>;
  instant?: string;
  emptyMessage?: string;
  bottomInset?: number;
  presentation?: DayFeedPresentation;
  query?: (date: string, zone: string) => DayFeedQuery;
  renderer?: DayRowRenderer;
  flexibleRenderer?: FlexibleBlockRenderer;
  ports?: Omit<DayStreamPorts, "focus" | "immersive">;
  flexiblePublication?: FlexiblePublication;
  ttrSession?: G2TtrSessionPort;
  directItem?: { itemId: string; onClose(): void };
  entry?: DayEntry;
  onReadingChange?: (reading: DayReading) => void;
  onOpenTtr?: (
    intent: ComposedTransition["openTtr"],
    context: Pick<ComposedTransition, "key" | "inputFingerprint">,
  ) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const continuous = Boolean(dates);
  const pendingIds = new Set(localManual?.items.map((item) => item.itemId) ?? []);
  const queryForDate = (day: string): DayFeedQuery => {
    if (zone === null && (viewMode !== "FLOATING" || projection.version !== 2))
      throw new Error("DAY_ZONE_INVALID");
    if (zone === null && contributedQuery) throw new Error("DAY_ZONE_INVALID");
    const query: DayFeedQuery = contributedQuery
      ? contributedQuery(day, zone!)
      : projection.version === 2
        ? projection.query(
            day,
            zone === null ? { zone: null, viewMode: "FLOATING" } : zone,
          )
        : itemsForLocalDate(projection, day, zone!);
    if (!pendingIds.size) return query;
    return {
      ...query,
      timed: query.timed.filter((item) => !pendingIds.has(item.event.id)),
      nonComparable: query.nonComparable.filter((item) => !pendingIds.has(item.event.id)),
      unresolved: query.unresolved.filter((event) => !pendingIds.has(event.id)),
      ...(query.coreRows
        ? { coreRows: query.coreRows.filter((row) => !pendingIds.has(row.itemRef)) }
        : {}),
    };
  };
  const calendar = dates?.length ? [...new Set([...dates, date])].sort() : [date];
  const query = queryForDate(date);
  const clock = useMinuteClock(zone);
  const publication = useFlexibleSnapshot(flexiblePublication, {
    accountId: projection.accountId,
    tripId: projection.tripId,
    localDate: date,
  });
  const viewContext = JSON.stringify([
    projection.accountId,
    projection.tripId,
    continuous,
    date,
    zone,
    viewMode,
    entry?.revision,
    directItem?.itemId,
    flexiblePublication?.scope?.generation,
  ]);
  const initialFocus =
    dates && entry?.reading.focus
      ? (composeDayStream(query, instant ?? clock.instant).rows.find(
          (row) => row.focusKey === entry.reading.focus,
        )?.key ?? entry.reading.focus)
      : (entry?.reading.focus ?? null);
  const [navigationContext, setNavigationContext] = useState(viewContext);
  const [focus, setFocus] = useState<string | null>(initialFocus);
  const [immersive, setImmersive] = useState<string | null>(directItem?.itemId ?? null);
  const [choiceScopes, setChoiceScopes] = useState<Record<string, "MY" | "GROUP">>({});
  const compose = (dayQuery: DayFeedQuery) =>
    composeDayStream(dayQuery, instant ?? clock.instant, {
      occurrenceFocus: Boolean(dates),
      ...ports,
      scope: flexiblePublication
        ? { accountId: projection.accountId, tripId: projection.tripId }
        : ports?.scope,
      flexible: (flexiblePublication
        ? (publication.snapshot?.blocks ?? [])
        : ports?.flexible
      )?.map((block) =>
        "version" in block && choiceScopes[block.id]
          ? { ...block, choiceScope: choiceScopes[block.id] }
          : block,
      ),
      focus: navigationContext === viewContext ? focus : null,
      immersive: navigationContext === viewContext ? immersive : null,
    });
  const sections = calendar.map((day) => {
    const query = queryForDate(day);
    return { date: day, query, stream: compose(query) };
  });
  const rowSections = new Map(
    sections.flatMap((section) =>
      section.stream.rows.map((row) => [row.key, section] as const),
    ),
  );
  const stream =
    sections.find((section) => section.stream.immersive)?.stream ??
    sections.find((section) => section.date === date)!.stream;
  const allRows = sections.flatMap((section) => section.stream.rows);
  const placedIds = new Set(allRows.map((row) => row.item.event.id));
  const unplaced = [
    ...new Map(
      sections
        .flatMap((section) => section.query.unresolved)
        .map((event) => [event.id, event]),
    ).values(),
  ].filter(
    (event) =>
      !placedIds.has(event.id) &&
      !["cancelled", "skipped"].includes(event.status) &&
      (projection.version !== 2 ||
        projection.items.some((item) => item.itemId === event.id && !item.hidden)),
  );
  if (navigationContext !== viewContext) {
    setFocus(initialFocus);
    setImmersive(directItem?.itemId ?? null);
    setChoiceScopes({});
    setNavigationContext(viewContext);
  } else {
    if (
      focus &&
      !sections.some(
        ({ stream }) => focus === stream.focus || focus === stream.suspendedFocus,
      ) &&
      !sections.some((section) =>
        localManual
          ?.rows(section.date)
          .some(
            (row) =>
              row.family === "P1" &&
              JSON.stringify(row.rowKey) === focus &&
              localManual.items.some(
                (item) =>
                  item.itemId === row.itemRef &&
                  item.family === "P1" &&
                  !item.hidden &&
                  !["cancelled", "skipped"].includes(String(item.status)),
              ),
          ),
      )
    )
      setFocus(null);
    if (immersive && !sections.some(({ stream }) => immersive === stream.immersive))
      setImmersive(null);
  }
  const [ttrBridge] = useState(createG2TtrSessionBridge);
  const ttrView = ttrSession
    ? ttrBridge.prepare(
        composedTtrActionability(
          ttrSession.scope,
          stream,
          ports?.transitions ?? [],
          ttrSession.permitted,
        ),
      )
    : null;
  useLayoutEffect(() => {
    if (ttrView && ttrBridge.commit(ttrView, ttrSession!.sheetOpen))
      ttrSession!.onChange(ttrView);
  });
  useLayoutEffect(() => {
    const bridge = ttrBridge;
    return () => bridge.dispose();
  }, [ttrBridge]);
  const rows = allRows;
  const scroll = useRef<DayListHandle>(null),
    offset = useRef(entry?.reading.offset ?? 0),
    returnAnchor = useRef<DayScrollAnchor | null>(null);
  const interactedContext = useRef<string | null>(null);
  const savedEntryAnchor =
    entry?.reading.anchor ??
    (entry &&
    (entry.kind !== "RESUME" || entry.reading.offset > 0 || entry.reading.anchoredDate)
      ? { key: `day:${date}`, date, within: entry.reading.offset }
      : null);
  // Tab/Home resume restores the browsed Day below navigation; Focus/Immersive keeps its Item anchor.
  const initialAnchor =
    dates && entry?.kind === "RESUME" && !entry.reading.focus && savedEntryAnchor
      ? { key: `day:${savedEntryAnchor.date}`, date: savedEntryAnchor.date, within: 0 }
      : savedEntryAnchor;
  useLayoutEffect(() => {
    interactedContext.current = null;
    if (initialAnchor) scroll.current?.restoreAnchor(initialAnchor);
    // Explicit entry/date changes may reposition; ordinary scroll updates must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewContext]);
  const remember = (nextFocus: string | null, anchor = scroll.current?.saveAnchor()) => {
    if (!entry || entry.kind === "RESUME")
      onReadingChange?.({
        offset: offset.current,
        focus: nextFocus,
        ...(dates
          ? { layout: "WHOLE_TRIP" as const, anchoredDate: anchor?.date ?? date }
          : {}),
        ...(anchor ? { anchor } : {}),
      });
  };
  const summaries = sections.map((section) =>
    summarizeDay(section.query, localManual?.rows(section.date)),
  );
  const summariesKey = JSON.stringify(summaries);
  const reportSummaries = presentation?.onSummaries;
  useLayoutEffect(() => {
    reportSummaries?.(JSON.parse(summariesKey));
  }, [summariesKey, reportSummaries]);
  const depth = (id: string): Depth =>
    sections.some(({ stream }) => stream.immersive === id)
      ? "I"
      : sections.some(({ stream }) => stream.focus === id)
        ? "F"
        : "B";
  const change = (id: string, next: Depth) => {
    interactedContext.current = viewContext;
    if (next === "I" && projection.version === 2 && onOpenAcceptedP1) {
      const eventId = rows.find((row) => row.focusKey === id)?.item.event.id;
      const item = projection.items.find(
        (item) => item.itemId === eventId && item.family === "P1",
      );
      if (
        item &&
        typeof item.itemRevision === "number" &&
        Number.isSafeInteger(item.itemRevision) &&
        item.itemRevision > 0
      ) {
        onOpenAcceptedP1(item.itemId, item.itemRevision);
        return;
      }
    }
    if (next === "I") {
      returnAnchor.current = scroll.current?.saveAnchor() ?? null;
      setImmersive(id);
    } else {
      setImmersive(null);
      setFocus(next === "F" ? id : null);
      remember(next === "F" ? id : null);
    }
  };
  const close = () => {
    setImmersive(null);
    directItem?.onClose();
    // Android does not deliver Modal.onDismiss.
    if (Platform.OS !== "ios")
      requestAnimationFrame(
        () => returnAnchor.current && scroll.current?.restoreAnchor(returnAnchor.current),
      );
  };
  const render = (
    row: (typeof rows)[number],
    mode: Depth,
    withinMarker?: React.ReactNode,
  ) => {
    const ownerStream = rowSections.get(row.key)!.stream;
    const entryIndex = ownerStream.entries.findIndex(
      (entry) => entry.kind === "ITEM" && entry.row.key === row.key,
    );
    const nextEntry = entryIndex >= 0 ? ownerStream.entries[entryIndex + 1] : undefined;
    const nextFocused = nextEntry?.kind === "ITEM" && nextEntry.row.focused;
    const event = row.item.event;
    const flight = flightPresentation(
      event,
      services[event.id] ?? [],
      projection.version === 2 ? projection.flightFacts[event.id] : undefined,
    );
    const fallback = !flight ? (
      <P1Row
        event={event}
        depth={mode}
        onDepth={(next) => (mode === "I" ? close() : change(row.focusKey, next))}
        withinMarker={withinMarker}
        hideDivider={nextFocused}
        occurrence={
          row.item.roles.includes("END") && !row.item.roles.includes("START")
            ? "END"
            : "START"
        }
        context={ownerStream.context}
      />
    ) : (
      <View style={styles.flight}>
        {mode === "F" ? <View pointerEvents="none" style={styles.outline} /> : null}
        <Pressable
          disabled={mode === "I"}
          accessibilityRole={mode === "I" ? "text" : "button"}
          accessibilityLabel={event.title}
          accessibilityHint={
            mode === "I"
              ? undefined
              : t(mode === "F" ? "flight.immersiveHint" : "flight.focusHint")
          }
          onPress={() => change(row.focusKey, mode === "F" ? "I" : "F")}
        >
          {flight.qualification === "SPARSE" ? (
            <FlightFidelityGrid
              flight={flight}
              focused={mode === "F"}
              immersive={mode === "I"}
              withinMarker={withinMarker}
            />
          ) : (
            <FlightRows
              fixture={flight}
              focused={mode === "F"}
              immersive={mode === "I"}
              withinMarker={withinMarker}
            />
          )}
        </Pressable>
        {projection.version === 2 &&
        projection.source.localTargetIds?.includes(event.id) ? (
          <UiText style={styles.meta}>{t("tripCreate.itemPending")}</UiText>
        ) : null}
        {mode === "F" ? (
          <UiButton
            label={t("feed.collapse")}
            variant="text"
            onPress={() => change(row.focusKey, "B")}
          />
        ) : null}
        {mode === "I" ? (
          <UiButton label={t("common.close")} variant="text" onPress={close} />
        ) : null}
      </View>
    );
    return renderer ? (
      <ContributedRow
        renderer={renderer}
        fallback={fallback}
        row={row}
        nextFocused={nextFocused}
        container={ownerStream.containers.find((entry) => entry.id === row.containerId)}
        context={ownerStream.context}
        depth={mode}
        onDepth={(next) => (mode === "I" ? close() : change(row.focusKey, next))}
        withinMarker={withinMarker}
      />
    ) : (
      fallback
    );
  };
  const selected = rows.find((r) => r.focusKey === stream.immersive);
  const selectedBlock = stream.containers.find(
    (block) => block.version === "g2-flexible/1" && block.id === stream.immersive,
  );
  useLayoutEffect(() => {
    if (directItem && !selected) directItem.onClose();
  }, [directItem, selected]);
  const renderItem = (row: (typeof rows)[number]) => (
    <View key={row.key}>
      {row.nowBefore ? (
        <NowMarker placement={rowSections.get(row.key)!.stream.now} />
      ) : null}
      {row.transition ? (
        <TransitionRow
          transition={row.transition}
          onOpen={
            onOpenTtr
              ? () => {
                  const intent = row.transition!.openTtr;
                  const presentation = {
                    key: row.transition!.key,
                    inputFingerprint: row.transition!.inputFingerprint,
                  };
                  if (
                    !ttrSession ||
                    (ttrView && ttrBridge.accepts(ttrView, intent, presentation))
                  )
                    onOpenTtr(intent, presentation);
                }
              : undefined
          }
        />
      ) : null}
      {render(
        row,
        depth(row.focusKey) === "I" ? "F" : depth(row.focusKey),
        row.nowWithin ? (
          <NowMarker placement={rowSections.get(row.key)!.stream.now} within />
        ) : undefined,
      )}
    </View>
  );
  const choiceScope = (id: string, scope: "MY" | "GROUP") => {
    setChoiceScopes((current) => ({ ...current, [id]: scope }));
  };
  const windowRows: DayWindowRow<() => ReactNode>[] = [];
  if (unplaced.length)
    windowRows.push({
      key: "unplaced:heading",
      date: calendar[0],
      value: () => <Text style={styles.meta}>{t("dayFeed.timeUnspecified")}</Text>,
    });
  for (const event of unplaced)
    windowRows.push({
      key: `unplaced:${event.id}`,
      date: calendar[0],
      value: () => <Text style={styles.meta}>{event.title}</Text>,
    });
  for (const section of sections) {
    windowRows.push({
      key: `day:${section.date}`,
      isDayHeader: true,
      date: section.date,
      value: () =>
        presentation?.renderDayHeading ? (
          presentation.renderDayHeading(
            section.date,
            !section.stream.entries.length && !localManual?.rows(section.date).length,
          )
        ) : (
          <View>
            {dates ? (
              <Text accessibilityRole="header" style={styles.dateHeading}>
                {presentation?.formatDayHeading?.(section.date) ?? section.date}
              </Text>
            ) : null}
            {!section.stream.entries.length && !localManual?.rows(section.date).length ? (
              <Text style={styles.meta}>{emptyMessage ?? t("dayFeed.dayEmpty")}</Text>
            ) : null}
          </View>
        ),
    });
    for (const entry of section.stream.entries)
      windowRows.push({
        key: entry.kind === "ITEM" ? entry.row.key : entry.block.key,
        date: section.date,
        value: () =>
          entry.kind === "ITEM" ? (
            renderItem(entry.row)
          ) : (
            <BlockSlot
              renderer={flexibleRenderer}
              block={entry.block}
              immersive={false}
              nestedItems={
                <>
                  {rows
                    .filter((row) => row.containerId === entry.block.id)
                    .map(renderItem)}
                </>
              }
              onBlockImmersiveIntent={() => change(entry.block.id, "I")}
              onChoiceFocusIntent={(key) => change(key ?? "", key ? "F" : "B")}
              onChoiceScopeIntent={(scope) => choiceScope(entry.block.id, scope)}
              onClose={close}
              flexibleSnapshot={publication.snapshot}
              onReplaceFlexibleSnapshot={publication.replace}
            />
          ),
      });
    for (const row of localManual?.rows(section.date) ?? [])
      windowRows.push({
        key: `local:${JSON.stringify(row.rowKey)}`,
        date: section.date,
        value: () => (
          <LocalManualDayRows
            read={localManual!}
            date={section.date}
            onlyRow={row}
            p1Focus={focus}
            onP1Focus={setFocus}
            move={presentation?.p1Move}
            onOpenItem={onOpenLocalItem}
          />
        ),
      });
    if (
      section.stream.nowAfter ||
      (presentation?.showTimeUnspecified !== false &&
        section.stream.rows.some((row) => row.position === "TNS"))
    )
      windowRows.push({
        key: `footer:${section.date}`,
        date: section.date,
        value: () => (
          <View>
            {section.stream.nowAfter ? (
              <NowMarker placement={section.stream.now} />
            ) : null}
            {presentation?.showTimeUnspecified !== false &&
            section.stream.rows.some((row) => row.position === "TNS") ? (
              <Text style={styles.meta}>{t("dayFeed.timeUnspecified")}</Text>
            ) : null}
          </View>
        ),
      });
  }
  return (
    <>
      {!directItem ? (
        <View
          style={styles.root}
          pointerEvents={selectedBlock || ttrSession?.sheetOpen ? "none" : "auto"}
          accessibilityElementsHidden={!!selectedBlock || !!ttrSession?.sheetOpen}
          importantForAccessibility={
            selectedBlock || ttrSession?.sheetOpen ? "no-hide-descendants" : "auto"
          }
        >
          <WindowedDayList
            scrollEnabled={presentation?.scrollEnabled}
            listRef={(value) => {
              scroll.current = value;
              presentation?.listRef?.(value);
            }}
            rows={windowRows}
            renderRow={({ value, date: rowDate }) =>
              presentation?.wrapDayRow ? (
                presentation.wrapDayRow(rowDate, value())
              ) : presentation?.header ? (
                <View style={styles.rowInset}>{value()}</View>
              ) : (
                value()
              )
            }
            scopeKey={JSON.stringify([projection.accountId, projection.tripId])}
            layoutRevision={JSON.stringify([
              projection.version === 2 ? projection.source : null,
              localManual?.source.fingerprint,
              focus,
              immersive,
              choiceScopes,
            ])}
            initialAnchor={initialAnchor}
            topInset={presentation?.topInset ?? 0}
            bottomInset={visual.space.section + bottomInset}
            header={presentation?.header}
            style={[styles.root, presentation?.listStyle]}
            contentContainerStyle={[
              styles.content,
              presentation?.header ? styles.withIntroduction : undefined,
              presentation?.listContentStyle,
            ]}
            onViewportChange={presentation?.onViewportChange}
            onReadingMotion={presentation?.onReadingMotion}
            onReadingStopped={presentation?.onReadingStopped}
            onMountedRowsChange={presentation?.onMountedRowsChange}
            onInteraction={() => {
              interactedContext.current = viewContext;
              presentation?.onInteraction?.();
            }}
            onOffsetChange={(value) => {
              offset.current = value;
              presentation?.onOffsetChange?.(value);
            }}
            onAnchorChange={(anchor) =>
              remember(
                sections.find(({ stream }) => stream.focus)?.stream.focus ?? null,
                anchor,
              )
            }
          />
        </View>
      ) : null}
      <Modal
        visible={!!selected || !!selectedBlock}
        onRequestClose={close}
        onDismiss={() =>
          returnAnchor.current && scroll.current?.restoreAnchor(returnAnchor.current)
        }
        animationType="slide"
      >
        <View style={styles.root}>
          {presentation?.renderImmersiveHeader ? (
            <ImmersiveHeaderSlot
              renderHeader={presentation.renderImmersiveHeader}
              onClose={close}
            />
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.root}
            contentContainerStyle={[styles.content, presentation?.immersiveContentStyle]}
            contentInsetAdjustmentBehavior="automatic"
          >
            {selected ? render(selected, "I") : null}
            {selectedBlock ? (
              <BlockSlot
                renderer={flexibleRenderer}
                block={selectedBlock}
                immersive
                nestedItems={
                  <>
                    {rows
                      .filter((row) => row.containerId === selectedBlock.id)
                      .map(renderItem)}
                  </>
                }
                onBlockImmersiveIntent={() => change(selectedBlock.id, "I")}
                onChoiceFocusIntent={() => {}}
                onChoiceScopeIntent={(scope) => choiceScope(selectedBlock.id, scope)}
                onClose={close}
                flexibleSnapshot={publication.snapshot}
                onReplaceFlexibleSnapshot={publication.replace}
              />
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    dateHeading: {
      ...visual.type.section,
      color: c.textPrimary,
      paddingVertical: visual.space.row,
    },
    root: { flex: 1, backgroundColor: c.background },
    rowInset: { paddingHorizontal: visual.space.page },
    withIntroduction: { paddingTop: 0, paddingHorizontal: 0 },
    content: {
      paddingHorizontal: visual.space.page,
      paddingBottom: visual.space.section,
    },
    meta: {
      ...visual.type.meta,
      color: c.textSecondary,
      paddingVertical: visual.space.row,
    },
    flight: { paddingVertical: visual.space.heading, gap: 4 },
    outline: {
      position: "absolute",
      left: -6,
      right: -6,
      top: 3,
      bottom: 3,
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: visual.radius.control,
    },
  });
