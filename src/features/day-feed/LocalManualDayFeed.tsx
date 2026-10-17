import { useLayoutEffect, useRef } from "react";
import type { DayFeedPresentation } from "./DayFeed";
import type { DayEntry, DayReading } from "./TripViewContext";
import { WindowedDayList, type DayListHandle } from "./WindowedDayList";
import { summarizeDay, type DayWindowRow } from "./dayFeedWindow";
import { Pressable, StyleSheet } from "react-native";
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
  onOpenItem?: (id: string, expected: Pick<LocalManualRead, "scope" | "source">) => void;
  emptyMessage?: string;
  bottomInset?: number;
  presentation?: DayFeedPresentation;
  entry?: DayEntry;
  onReadingChange?: (reading: DayReading) => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const list = useRef<DayListHandle>(null);
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
      value: () => (
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
            onOpenItem={onOpenItem}
          />
        ),
      });
  }
  return (
    <WindowedDayList
      rows={rows}
      renderRow={({ value }) => value()}
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
      header={presentation?.header}
      style={styles.body}
      contentContainerStyle={styles.content}
      onViewportChange={presentation?.onViewportChange}
      onOffsetChange={presentation?.onOffsetChange}
      onReadingMotion={presentation?.onReadingMotion}
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
  read,
  date,
  onOpenItem,
}: {
  read: LocalManualRead;
  onlyRow?: ReturnType<LocalManualRead["rows"]>[number];
  date: string;
  onOpenItem?: (id: string, expected: Pick<LocalManualRead, "scope" | "source">) => void;
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
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.section, gap: visual.space.section },
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
