import { useLayoutEffect, useRef } from "react";
import { ScrollView, Pressable, StyleSheet, View } from "react-native";
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
}: {
  read: LocalManualRead;
  date: string;
  dates?: readonly string[];
  onOpenItem?: (id: string, expected: Pick<LocalManualRead, "scope" | "source">) => void;
  emptyMessage?: string;
  bottomInset?: number;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  useLayoutEffect(() => {
    const y = offsets.current[date];
    if (y !== undefined) scroll.current?.scrollTo({ y, animated: false });
  }, [date, read.source.fingerprint]);
  const calendar = dates?.length ? [...new Set([...dates, date])].sort() : [date];
  return (
    <ScrollView
      ref={scroll}
      style={styles.body}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: visual.space.section + bottomInset },
      ]}
      scrollIndicatorInsets={{ bottom: bottomInset }}
    >
      {calendar.map((day) => {
        const rows = read.rows(day);
        return (
          <View
            key={day}
            onLayout={(event) => {
              offsets.current[day] = event.nativeEvent.layout.y;
              if (day === date)
                scroll.current?.scrollTo({
                  y: event.nativeEvent.layout.y,
                  animated: false,
                });
            }}
          >
            <UiSection title={civil(day)}>
              {rows.length ? (
                <LocalManualDayRows read={read} date={day} onOpenItem={onOpenItem} />
              ) : (
                <View>
                  <Text style={styles.meta}>
                    {emptyMessage ?? t("tripHome.today.free")}
                  </Text>
                </View>
              )}
            </UiSection>
          </View>
        );
      })}
    </ScrollView>
  );
}
// Row-only contribution for the existing Day scroll; it never renders accepted Items.
export function LocalManualDayRows({
  read,
  date,
  onOpenItem,
}: {
  read: LocalManualRead;
  date: string;
  onOpenItem?: (id: string, expected: Pick<LocalManualRead, "scope" | "source">) => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <>
      {read.rows(date).map((row) => {
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
