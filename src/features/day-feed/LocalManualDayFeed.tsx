import { FlightFidelityGrid } from "./FlightFidelityGrid";
import { flightSegmentFromRead } from "./manualFlightFormFields";
import { StayReadRow } from "./StayReadView";
import { localStayPresentation, localStayMapTargets } from "./localStayPresentation";
import type { BookingContext } from "./bookingReadPresentation";
import { P1Row, type P1MoveInteraction } from "./P1Row";
import { localP1Presentation } from "./localP1Presentation";
import { useLayoutEffect, useRef, useState } from "react";
import type { DayFeedPresentation } from "./DayFeed";
import type { DayEntry, DayReading } from "./TripViewContext";
import { WindowedDayList, type DayListHandle } from "./WindowedDayList";
import { summarizeDay, type DayWindowRow } from "./dayFeedWindow";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import { UiSection, UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

const civil = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
// Core rows stay Core rows; no synthetic accepted Event/certificate is built for presentation.
export function LocalManualDayFeed({
  read,
  date,
  dates,
  onOpenItem,
  emptyMessage,
  bottomInset = 0,
  presentation,
  entry,
  onReadingChange,
}: {
  read: LocalManualRead;
  date: string;
  dates?: readonly string[];
  onOpenItem?: (
    id: string,
    expected: Pick<LocalManualRead, "scope" | "source">,
    occurrence?: { role: string; date: string },
  ) => void;
  emptyMessage?: string;
  bottomInset?: number;
  presentation?: DayFeedPresentation;
  entry?: DayEntry;
  onReadingChange?: (reading: DayReading) => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const list = useRef<DayListHandle>(null);
  const [p1Focus, setP1Focus] = useState<string | null>(null);
  const calendar = dates?.length ? [...new Set([...dates, date])].sort() : [date];
  const summaries = calendar.map((day) =>
    summarizeDay({ date: day, timed: [], nonComparable: [] }, read.rows(day)),
  );
  const summariesKey = JSON.stringify(summaries);
  const reportSummaries = presentation?.onSummaries;
  useLayoutEffect(() => {
    reportSummaries?.(JSON.parse(summariesKey));
  }, [summariesKey, reportSummaries]);
  const initialAnchor =
    entry?.reading.anchor ??
    (entry &&
    (entry.kind !== "RESUME" || entry.reading.offset > 0 || entry.reading.anchoredDate)
      ? { key: `day:${date}`, date, within: entry.reading.offset }
      : null);
  const initialKey = initialAnchor?.key,
    initialDate = initialAnchor?.date,
    initialWithin = initialAnchor?.within;
  useLayoutEffect(() => {
    if (initialKey && initialDate)
      list.current?.restoreAnchor({
        key: initialKey,
        date: initialDate,
        within: initialWithin ?? 0,
      });
  }, [initialKey, initialDate, initialWithin, entry?.revision]);
  const rows: DayWindowRow<() => React.ReactNode>[] = [];
  for (const day of calendar) {
    const items = read.rows(day);
    rows.push({
      key: `day:${day}`,
      isDayHeader: true,
      date: day,
      value: () =>
        presentation?.renderDayHeading ? (
          presentation.renderDayHeading(day, !items.length)
        ) : (
          <UiSection title={presentation?.formatDayHeading?.(day) ?? civil(day)}>
            {!items.length ? (
              <Text style={styles.meta}>{emptyMessage ?? t("tripHome.today.free")}</Text>
            ) : null}
          </UiSection>
        ),
    });
    for (const row of items)
      rows.push({
        key: `local:${JSON.stringify(row.rowKey)}`,
        date: day,
        value: () => (
          <LocalManualDayRows
            read={read}
            date={day}
            onlyRow={row}
            p1Focus={p1Focus}
            onP1Focus={setP1Focus}
            move={presentation?.p1Move}
            onOpenItem={onOpenItem}
          />
        ),
      });
  }
  // Cell measurements must include spacing; FlatList estimates omit container gaps.
  return (
    <WindowedDayList
      scrollEnabled={presentation?.scrollEnabled}
      rows={rows}
      renderRow={({ value, date }) =>
        presentation?.wrapDayRow ? (
          presentation.wrapDayRow(date, value())
        ) : presentation?.header ? (
          <View style={styles.rowInset}>{value()}</View>
        ) : (
          value()
        )
      }
      listRef={(value) => {
        list.current = value;
        presentation?.listRef?.(value);
      }}
      scopeKey={JSON.stringify([
        read.scope.accountId,
        read.scope.tripId,
        read.scope.generation,
      ])}
      layoutRevision={read.source.fingerprint}
      initialAnchor={initialAnchor}
      topInset={presentation?.topInset ?? 0}
      bottomInset={visual.space.section + bottomInset}
      rowSpacing={presentation?.wrapDayRow ? 0 : visual.space.section}
      header={presentation?.header}
      style={[styles.body, presentation?.listStyle]}
      contentContainerStyle={[
        styles.content,
        presentation?.header ? styles.withIntroduction : undefined,
        presentation?.listContentStyle,
      ]}
      onViewportChange={presentation?.onViewportChange}
      onOffsetChange={presentation?.onOffsetChange}
      onReadingMotion={presentation?.onReadingMotion}
      onReadingStopped={presentation?.onReadingStopped}
      onInteraction={presentation?.onInteraction}
      onMountedRowsChange={presentation?.onMountedRowsChange}
      onAnchorChange={(anchor) => {
        if (!entry || entry.kind === "RESUME")
          onReadingChange?.({
            offset: 0,
            focus: null,
            layout: "WHOLE_TRIP",
            anchoredDate: anchor.date,
            anchor,
          });
      }}
    />
  );
}
// Row-only contribution for the existing Day scroll; it never renders accepted Items.
export function LocalManualDayRows({
  onlyRow,
  context = "UNKNOWN",
  p1Focus,
  onP1Focus,
  move,
  read,
  date,
  onOpenItem,
  onInsert,
}: {
  read: LocalManualRead;
  onInsert?: DayFeedPresentation["onLocalInsert"];
  context?: BookingContext;
  move?: P1MoveInteraction;
  p1Focus?: string | null;
  onP1Focus?(key: string | null): void;
  onlyRow?: ReturnType<LocalManualRead["rows"]>[number];
  date: string;
  onOpenItem?: (
    id: string,
    expected: Pick<LocalManualRead, "scope" | "source">,
    occurrence?: { role: string; date: string },
  ) => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <>
      {(onlyRow ? [onlyRow] : read.rows(date)).map((row) => {
        const item = read.items.find((item) => item.itemId === row.itemRef);
        const schedule = item?.schedule as
          { start?: { localDate?: string }; end?: { localDate?: string } } | undefined;
        const role = row.rowKey.projectionRole;
        const roleLabel =
          role === "CHECKIN"
            ? t("p3.role.checkin")
            : role === "CHECKOUT"
              ? t("p3.role.checkout")
              : row.family === "P3"
                ? t("tripHome.today.tonight")
                : null;
        if (item && row.family === "P2") {
          const focusKey = JSON.stringify(row.rowKey);
          const focused = p1Focus === focusKey;
          return (
            <Pressable
              key={focusKey}
              accessibilityRole="button"
              accessibilityLabel={row.title}
              style={styles.row}
              onPress={() => {
                if (focused || !onP1Focus) onOpenItem?.(row.itemRef, read);
                else onP1Focus(focusKey);
              }}
            >
              <FlightFidelityGrid
                flight={{ authored: flightSegmentFromRead(item) }}
                focused={focused}
                pending={item.localState === "PENDING"}
              />
            </Pressable>
          );
        }
        if (item && row.family === "P3")
          return (
            <LocalStayRow
              key={JSON.stringify(row.rowKey)}
              item={item}
              rowKey={`local:${JSON.stringify(row.rowKey)}`}
              date={date}
              role={
                role === "CHECKIN" ? "CHECKIN" : role === "CHECKOUT" ? "CHECKOUT" : "BASE"
              }
              focused={p1Focus === JSON.stringify(row.rowKey)}
              onFocus={() =>
                onP1Focus?.(
                  p1Focus === JSON.stringify(row.rowKey)
                    ? null
                    : JSON.stringify(row.rowKey),
                )
              }
              move={move}
              context={context}
              onInsert={
                onInsert ? (side) => onInsert(row.itemRef, role, date, side) : undefined
              }
              onOpen={() => onOpenItem?.(row.itemRef, read, { role, date })}
            />
          );
        if (item && row.family === "P1")
          return (
            <LocalP1Row
              key={JSON.stringify(row.rowKey)}
              item={item}
              move={move}
              date={date}
              rowKey={`local:${JSON.stringify(row.rowKey)}`}
              occurrence={role === "END" ? "END" : "START"}
              focused={
                p1Focus === undefined ? undefined : p1Focus === JSON.stringify(row.rowKey)
              }
              onFocus={
                onP1Focus
                  ? (next) => onP1Focus(next ? JSON.stringify(row.rowKey) : null)
                  : undefined
              }
              onOpen={() => onOpenItem?.(row.itemRef, read)}
            />
          );
        return (
          <Pressable
            key={JSON.stringify(row.rowKey)}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            accessibilityValue={{ text: t("tripCreate.itemPending") }}
            accessibilityState={{ disabled: !onOpenItem }}
            disabled={!onOpenItem}
            style={styles.row}
            onPress={() => onOpenItem?.(row.itemRef, read)}
          >
            <Text style={styles.title}>{row.title}</Text>
            {roleLabel ? <Text style={styles.meta}>{roleLabel}</Text> : null}
            {row.family === "P3" &&
            schedule?.start?.localDate &&
            schedule.end?.localDate &&
            typeof item?.details.nights === "number" ? (
              <Text style={styles.meta}>
                {t(item.details.nights === 1 ? "p3.dateRangeOne" : "p3.dateRange", {
                  start: civil(schedule.start.localDate),
                  end: civil(schedule.end.localDate),
                  nights: item.details.nights,
                })}
              </Text>
            ) : null}
            {row.displayTime?.localTime ? (
              <Text style={styles.meta}>{row.displayTime.localTime}</Text>
            ) : null}
            <Text style={styles.pending}>{t("tripCreate.itemPending")}</Text>
          </Pressable>
        );
      })}
    </>
  );
}
function LocalStayRow({
  item,
  rowKey,
  date,
  role,
  focused,
  onFocus,
  onOpen,
  move,
  context,
  onInsert,
}: {
  onInsert?(side: "BEFORE" | "AFTER"): void;
  item: LocalManualRead["items"][number];
  rowKey: string;
  date: string;
  role: "CHECKIN" | "CHECKOUT" | "BASE";
  focused: boolean;
  onFocus(): void;
  onOpen(): void;
  move?: P1MoveInteraction;
  context: BookingContext;
}) {
  const stay = localStayPresentation(item);
  if (!stay) return null;
  const targets = localStayMapTargets(item);
  const openMap = (url: string) => {
    void Linking.openURL(url).catch(() => Alert.alert(t("p3.mapUnavailable")));
  };
  if (targets) {
    stay.map = () => openMap(targets.map);
    if (targets.navigate) stay.navigate = () => openMap(targets.navigate!);
  }
  const moveId = `${item.itemId}:${role}`;
  const content = (
    <StayReadRow
      stay={stay}
      role={role}
      focused={focused}
      context={context}
      onInsert={onInsert}
      onFocus={onFocus}
      onOpen={onOpen}
      onMove={
        move?.canMove(moveId)
          ? (event) =>
              move.start(moveId, {
                x: event.nativeEvent.pageX,
                y: event.nativeEvent.pageY,
              })
          : undefined
      }
      renderTime={
        move
          ? (time, content) =>
              move.wrapClock(
                `${rowKey}:PRIMARY`,
                date,
                Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)),
                content,
              )
          : undefined
      }
    />
  );
  return move ? move.wrapRow(rowKey, date, content) : content;
}
function LocalP1Row({
  item,
  occurrence,
  move,
  rowKey,
  date,
  onOpen,
  focused,
  onFocus,
}: {
  move?: P1MoveInteraction;
  rowKey: string;
  date: string;
  focused?: boolean;
  onFocus?(focused: boolean): void;
  item: LocalManualRead["items"][number];
  occurrence: "START" | "END";
  onOpen(): void;
}) {
  const [depth, setDepth] = useState<"B" | "F">("B");
  const presentation = localP1Presentation(item, occurrence);
  const content = presentation ? (
    <P1Row
      {...presentation}
      occurrence={occurrence}
      moveGesture={
        occurrence === "START" && move?.canMove(item.itemId)
          ? { start: (point) => move.start(item.itemId, point) }
          : undefined
      }
      wrapMoveClock={
        move
          ? (role, content) => {
              const clock =
                role === "PRIMARY"
                  ? occurrence === "END"
                    ? presentation.display.clocks.end
                    : presentation.display.clocks.start
                  : presentation.display.clocks.end;
              return clock?.local_time && clock.local_date === date
                ? move.wrapClock(
                    `${rowKey}:${role}`,
                    date,
                    Number(clock.local_time.slice(0, 2)) * 60 +
                      Number(clock.local_time.slice(3, 5)),
                    content,
                  )
                : content;
            }
          : undefined
      }
      depth={focused === undefined ? depth : focused ? "F" : "B"}
      onDepth={(next) =>
        next === "I" ? onOpen() : onFocus ? onFocus(next === "F") : setDepth(next)
      }
    />
  ) : null;
  return content && move ? move.wrapRow(rowKey, date, content) : content;
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.section },
    withIntroduction: { paddingTop: 0, paddingHorizontal: 0 },
    rowInset: { paddingHorizontal: visual.space.section },
    row: {
      minHeight: 44,
      gap: visual.space.heading,
      paddingVertical: visual.space.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    title: { ...visual.type.row, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    pending: { ...visual.type.meta, color: colors.warning },
  });
