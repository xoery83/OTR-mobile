import { LocalManualDayFeed, LocalManualDayRows } from "./LocalManualDayFeed";
import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import { useLayoutEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { DayProjection } from "@/domain/trip/dayReadModel";
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
import { UiButton } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { P1Row } from "./P1Row";
import { TransitionRow, type ComposedTransition } from "./TransitionRow";
import { FlightRows } from "./FlightRows";
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

type DayFeedProps = Omit<Parameters<typeof AcceptedDayFeed>[0], "projection"> & {
  projection?: DayProjection | CoreFlightDayProjection;
  localManual?: LocalManualRead | null;
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
  services,
  instant,
  emptyMessage,
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
}: {
  localManual?: LocalManualRead | null;
  onOpenLocalItem?: (
    itemId: string,
    expected: Pick<LocalManualRead, "scope" | "source">,
  ) => void;
  projection: DayProjection | CoreFlightDayProjection;
  date: string;
  dates?: readonly string[];
  zone: string;
  services: Record<string, FlightService[]>;
  instant?: string;
  emptyMessage?: string;
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
    const query: DayFeedQuery = contributedQuery
      ? contributedQuery(day, zone)
      : projection.version === 2
        ? projection.query(day, zone)
        : itemsForLocalDate(projection, day, zone);
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
  // shortcut: existing ScrollView renders the owned calendar; virtualize this same stream for long-Trip scale.
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
  const scroll = useRef<ScrollView>(null),
    offset = useRef(entry?.reading.offset ?? 0),
    returnOffset = useRef(0),
    sectionOffsets = useRef<Record<string, number>>({});
  const restoredContext = useRef<string | null>(null);
  const readingOffset = entry?.reading.offset ?? 0;
  const wholeTripReading = entry?.reading.layout === "WHOLE_TRIP";
  const restoreReading = () => {
    if (restoredContext.current === viewContext || !scroll.current) return;
    const anchor = continuous && !wholeTripReading ? sectionOffsets.current[date] : 0;
    if (anchor === undefined) return;
    restoredContext.current = viewContext;
    offset.current = anchor + readingOffset;
    scroll.current?.scrollTo({ y: offset.current, animated: false });
  };
  useLayoutEffect(() => {
    restoredContext.current = null;
    const anchor = continuous && !wholeTripReading ? sectionOffsets.current[date] : 0;
    if (anchor !== undefined && scroll.current) {
      offset.current = anchor + readingOffset;
      scroll.current.scrollTo({ y: offset.current, animated: false });
      restoredContext.current = viewContext;
    }
  }, [viewContext, continuous, wholeTripReading, date, readingOffset]);
  const remember = (nextFocus: string | null, nextOffset = offset.current) => {
    if (!entry || entry.kind === "RESUME") {
      const anchoredDate =
        [...calendar]
          .reverse()
          .find(
            (day) =>
              sectionOffsets.current[day] !== undefined &&
              sectionOffsets.current[day] <= nextOffset,
          ) ?? date;
      onReadingChange?.({
        offset: nextOffset,
        focus: nextFocus,
        ...(dates ? { layout: "WHOLE_TRIP" as const, anchoredDate } : {}),
      });
    }
  };
  const depth = (id: string): Depth =>
    sections.some(({ stream }) => stream.immersive === id)
      ? "I"
      : sections.some(({ stream }) => stream.focus === id)
        ? "F"
        : "B";
  const change = (id: string, next: Depth) => {
    if (next === "I") {
      returnOffset.current = offset.current;
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
      requestAnimationFrame(() =>
        scroll.current?.scrollTo({ y: returnOffset.current, animated: false }),
      );
  };
  const render = (
    row: (typeof rows)[number],
    mode: Depth,
    withinMarker?: React.ReactNode,
  ) => {
    const ownerStream = rowSections.get(row.key)!.stream;
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
              : t(mode === "F" ? "p1r.immersiveHint" : "p1r.focusHint")
          }
          onPress={() => change(row.focusKey, mode === "F" ? "I" : "F")}
        >
          <FlightRows
            fixture={flight}
            focused={mode === "F"}
            immersive={mode === "I"}
            withinMarker={withinMarker}
          />
        </Pressable>
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
          <ScrollView
            ref={scroll}
            style={styles.root}
            contentContainerStyle={styles.content}
            scrollEventThrottle={16}
            onContentSizeChange={restoreReading}
            onScroll={(e) => {
              offset.current = e.nativeEvent.contentOffset.y;
              remember(sections.find(({ stream }) => stream.focus)?.stream.focus ?? null);
            }}
          >
            {unplaced.length ? (
              <View>
                <Text style={styles.meta}>{t("dayFeed.timeUnspecified")}</Text>
                {unplaced.map((event) => (
                  <Text key={event.id} style={styles.meta}>
                    {event.title}
                  </Text>
                ))}
              </View>
            ) : null}
            {sections.map((section) => (
              <View
                key={section.date}
                onLayout={({ nativeEvent }) => {
                  sectionOffsets.current[section.date] = nativeEvent.layout.y;
                  restoreReading();
                }}
              >
                {dates ? (
                  <Text accessibilityRole="header" style={styles.dateHeading}>
                    {section.date}
                  </Text>
                ) : null}
                {!section.stream.entries.length &&
                !localManual?.rows(section.date).length ? (
                  <Text style={styles.meta}>{emptyMessage ?? t("dayFeed.dayEmpty")}</Text>
                ) : null}
                {section.stream.entries.map((entry) =>
                  entry.kind === "ITEM" ? (
                    renderItem(entry.row)
                  ) : (
                    <View key={entry.block.key}>
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
                        onChoiceScopeIntent={(scope) =>
                          choiceScope(entry.block.id, scope)
                        }
                        onClose={close}
                        flexibleSnapshot={publication.snapshot}
                        onReplaceFlexibleSnapshot={publication.replace}
                      />
                    </View>
                  ),
                )}
                {localManual ? (
                  <LocalManualDayRows
                    read={localManual}
                    date={section.date}
                    onOpenItem={onOpenLocalItem}
                  />
                ) : null}
                {section.stream.nowAfter ? (
                  <NowMarker placement={section.stream.now} />
                ) : null}
                {section.stream.rows.some((row) => row.position === "TNS") ? (
                  <Text style={styles.meta}>{t("dayFeed.timeUnspecified")}</Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Modal
        visible={!!selected || !!selectedBlock}
        onRequestClose={close}
        onDismiss={() =>
          scroll.current?.scrollTo({ y: returnOffset.current, animated: false })
        }
        animationType="slide"
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.content}
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
