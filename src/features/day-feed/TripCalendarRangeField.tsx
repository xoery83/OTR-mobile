import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { UiFormRow } from "@/ui/forms";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { dayFeedCalendarCells } from "./DayFeedCalendarSheet";
import { calendarDate } from "./TripCalendarField";

export type TripDateRange = { start: string; end: string };
export function selectTripRange(range: TripDateRange, date: string): TripDateRange {
  if (!range.start || range.end) return { start: date, end: "" };
  return date < range.start
    ? { start: date, end: range.start }
    : { start: range.start, end: date };
}
export function adjacentTripMonth(month: string, step: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + step);
  return date.toISOString().slice(0, 7);
}
const displayDate = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
const accessibleDate = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), { dateStyle: "full", timeZone: "UTC" });
export function tripRangeLabel({ start, end }: TripDateRange) {
  return start && end
    ? t("myTrips.dateRange", { start: displayDate(start), end: displayDate(end) })
    : start
      ? t("myTrips.starts", { date: displayDate(start) })
      : end
        ? t("myTrips.ends", { date: displayDate(end) })
        : t("myTrips.datesToBeDecided");
}

export function TripCalendarRangeField({
  value,
  disabled = false,
  onChange,
}: {
  value: TripDateRange;
  disabled?: boolean;
  onChange(range: TripDateRange): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const cellSize = Math.max(44, Math.ceil(24 * fontScale));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState(
    (value.start || calendarDate(new Date())).slice(0, 7),
  );
  return (
    <View>
      <UiFormRow
        label={t("tripForm.dates")}
        value={tripRangeLabel(value)}
        stacked
        disabled={disabled}
        onPress={() => {
          setDraft(value);
          setMonth((value.start || value.end || calendarDate(new Date())).slice(0, 7));
          setOpen(true);
        }}
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <SheetHeader
            title={t("tripForm.dates")}
            safeTop={false}
            leftLabel={t("common.cancel")}
            onLeft={() => setOpen(false)}
            onRight={() => {
              onChange(draft);
              setOpen(false);
            }}
          />
          <ScrollView style={styles.sheet} contentContainerStyle={styles.content}>
            <UiText style={styles.meta}>
              {t(
                draft.start && !draft.end ? "tripForm.chooseEnd" : "tripForm.chooseStart",
              )}
            </UiText>
            <UiText style={styles.label}>{tripRangeLabel(draft)}</UiText>
            <View style={styles.monthNavigation}>
              <UiButton
                variant="text"
                label={t("tripForm.previousMonth")}
                onPress={() => setMonth(adjacentTripMonth(month, -1))}
              />
              <UiButton
                variant="text"
                label={t("tripForm.nextMonth")}
                onPress={() => setMonth(adjacentTripMonth(month, 1))}
              />
            </View>
            <UiText accessibilityRole="header" style={styles.label}>
              {formatUiDate(new Date(`${month}-01T12:00:00Z`), {
                year: "numeric",
                month: "long",
                timeZone: "UTC",
              })}
            </UiText>
            <ScrollView horizontal>
              <View style={[styles.grid, { width: cellSize * 7 }]}>
                {Array.from({ length: 7 }, (_, index) => (
                  <UiText key={index} style={[styles.weekday, { width: cellSize }]}>
                    {formatUiDate(new Date(`2021-11-0${index + 1}T12:00:00Z`), {
                      weekday: "narrow",
                      timeZone: "UTC",
                    })}
                  </UiText>
                ))}
                {dayFeedCalendarCells(month).map((date, index) =>
                  date ? (
                    <Pressable
                      key={date}
                      accessibilityRole="button"
                      accessibilityLabel={accessibleDate(date)}
                      accessibilityState={{
                        selected: date === draft.start || date === draft.end,
                      }}
                      style={[
                        styles.day,
                        { width: cellSize, minHeight: cellSize },
                        draft.start &&
                        draft.end &&
                        date >= draft.start &&
                        date <= draft.end
                          ? styles.inRange
                          : null,
                        (date === draft.start || date === draft.end) && styles.endpoint,
                      ]}
                      onPress={() => setDraft(selectTripRange(draft, date))}
                    >
                      <UiText style={styles.label}>
                        {formatUiNumber(+date.slice(8))}
                      </UiText>
                    </Pressable>
                  ) : (
                    <View
                      key={`blank-${index}`}
                      style={[styles.day, { width: cellSize, minHeight: cellSize }]}
                    />
                  ),
                )}
              </View>
            </ScrollView>
            <UiButton
              variant="text"
              label={t("tripForm.clearDates")}
              onPress={() => setDraft({ start: "", end: "" })}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.card },
    monthNavigation: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    weekday: {
      textAlign: "center",
      ...visual.type.meta,
      color: c.textSecondary,
    },
    day: { justifyContent: "center", alignItems: "center" },
    inRange: { backgroundColor: c.selected },
    endpoint: {
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: visual.radius.control,
    },
    label: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
