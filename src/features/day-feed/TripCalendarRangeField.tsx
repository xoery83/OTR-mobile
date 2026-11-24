import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSheetScrollDismissal } from "@/components/SheetHost";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { UiFormRow } from "@/ui/forms";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { dayFeedCalendarCells } from "./DayFeedCalendarSheet";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { OpenCalendarRangePickerContext } from "./calendarRangePickerHandoff";
import { calendarDate } from "./TripCalendarField";

export type TripDateRange = { start: string; end: string };
export function selectTripRange(range: TripDateRange, date: string): TripDateRange {
  if (!range.start || range.end) return { start: date, end: "" };
  return date < range.start
    ? { start: date, end: "" }
    : { start: range.start, end: date };
}
const monthNumber = (month: string) =>
  (Number(month.slice(0, 4)) - 1) * 12 + Number(month.slice(5, 7)) - 1;
export function adjacentTripMonth(month: string, step: number) {
  const index = Math.min(9999 * 12 - 1, Math.max(0, monthNumber(month) + step));
  return `${String(Math.floor(index / 12) + 1).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
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

export type TripCalendarRangePickerProps = {
  value: TripDateRange;
  label: string;
  referenceRange?: TripDateRange;
  markToday?: boolean;
  startWithCheckin?: boolean;
  initialNavigationDate?: string | null;
};

type TripCalendarRangeFieldProps = Omit<TripCalendarRangePickerProps, "label"> & {
  disabled?: boolean;
  presentation?: "row" | "field";
  label?: string;
  onChange(range: TripDateRange): void;
  onOpenChange?(open: boolean): boolean | void;
};

export function TripCalendarRangeField({
  presentation = "row",
  label = t("tripForm.dates"),
  ...props
}: TripCalendarRangeFieldProps) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const openHosted = useContext(OpenCalendarRangePickerContext);
  const latest = useRef<TripCalendarRangeFieldProps | null>(null);
  const hostedOpen = useRef(false);
  const generation = getAccountGeneration();
  useLayoutEffect(() => {
    latest.current = { ...props, label };
    return () => {
      latest.current = null;
    };
  });
  const [open, setOpen] = useState(false);
  const { value, referenceRange, disabled, onOpenChange, onChange } = props;
  const title = label === t("tripForm.dates") ? t("tripForm.dateTitle") : label;
  const close = () => {
    if (onOpenChange?.(false) !== false) setOpen(false);
  };

  return (
    <View>
      <UiFormRow
        variant={presentation}
        placeholder={!value.start && !value.end}
        label={label}
        value={
          referenceRange && value.start && !value.end
            ? displayDate(value.start)
            : tripRangeLabel(value)
        }
        stacked
        horizontalInset={0}
        disabled={disabled}
        onPress={() => {
          if (disabled || hostedOpen.current || onOpenChange?.(true) === false) return;
          if (openHosted) {
            hostedOpen.current = true;
            const started = openHosted(() => {
              if (generation !== getAccountGeneration() || !latest.current) return null;
              return {
                ...latest.current,
                label: latest.current.label ?? label,
                onClose: () => {
                  hostedOpen.current = false;
                  latest.current?.onOpenChange?.(false);
                },
              };
            });
            if (!started) {
              hostedOpen.current = false;
              onOpenChange?.(false);
            }
          } else setOpen(true);
        }}
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onRequestClose={close}
      >
        {open ? (
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <TripCalendarRangePicker
              {...props}
              label={label}
              onDone={(range) => {
                onChange(range);
                close();
              }}
            >
              {(confirm, content) => (
                <>
                  <SheetHeader
                    category="picker"
                    title={title}
                    safeTop={false}
                    leftLabel={t("common.cancel")}
                    onLeft={close}
                    onRight={confirm}
                  />
                  {content}
                </>
              )}
            </TripCalendarRangePicker>
          </SafeAreaView>
        ) : null}
      </Modal>
    </View>
  );
}

export function TripCalendarRangePicker({
  value,
  referenceRange,
  markToday = true,
  startWithCheckin = false,
  initialNavigationDate,
  onDone,
  hosted = false,
  children,
}: TripCalendarRangePickerProps & {
  hosted?: boolean;
  onDone(range: TripDateRange): void;
  children(confirm: () => void, content: ReactNode): ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  useUiLocale();
  const dismissal = useSheetScrollDismissal(hosted);
  const { fontScale, width } = useWindowDimensions();
  const [listWidth, setListWidth] = useState<number | null>(null);
  const cellSize = Math.max(44, Math.ceil(24 * fontScale));
  const availableWidth = (listWidth ?? width) - 2 * visual.space.page;
  const gridWidth = Math.max(availableWidth, cellSize * 7);
  const [draft, setDraft] = useState(value);
  const [choosingEnd, setChoosingEnd] = useState(false);
  const today = markToday ? calendarDate(new Date()) : null;
  const seed = (
    value.start ||
    value.end ||
    initialNavigationDate ||
    calendarDate(new Date())
  ).slice(0, 7);
  const [bounds, setBounds] = useState({
    first: adjacentTripMonth(seed, -12),
    last: adjacentTripMonth((value.end || value.start || `${seed}-01`).slice(0, 7), 12),
  });
  const months: string[] = [];
  for (let at = bounds.first; at <= bounds.last; at = adjacentTripMonth(at, 1)) {
    months.push(at);
    if (at === bounds.last) break;
  }
  const initialMonthIndex = monthNumber(seed) - monthNumber(adjacentTripMonth(seed, -12));
  const gridHeight = cellSize * 7;
  const monthHeight = cellSize + visual.space.card + gridHeight;
  return children(
    () => onDone(draft),
    <>
      <View style={styles.content}>
        <UiText style={styles.meta}>
          {t(draft.start && !draft.end ? "tripForm.chooseEnd" : "tripForm.chooseStart")}
        </UiText>
        <UiText style={styles.label}>{tripRangeLabel(draft)}</UiText>
      </View>
      <FlatList
        {...dismissal}
        keyboardShouldPersistTaps="handled"
        style={styles.sheet}
        onLayout={({ nativeEvent }) => {
          if (nativeEvent.layout.width > 0) setListWidth(nativeEvent.layout.width);
        }}
        data={months}
        keyExtractor={(month) => month}
        initialScrollIndex={initialMonthIndex}
        getItemLayout={(_, index) => ({
          length: monthHeight,
          offset: monthHeight * index,
          index,
        })}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onStartReached={() =>
          setBounds((previous) => {
            const first = adjacentTripMonth(previous.first, -12);
            return first === previous.first ? previous : { ...previous, first };
          })
        }
        onEndReached={() =>
          setBounds((previous) => {
            const last = adjacentTripMonth(previous.last, 12);
            return last === previous.last ? previous : { ...previous, last };
          })
        }
        renderItem={({ item: month }) => {
          const dates = dayFeedCalendarCells(month);
          return (
            <View style={[styles.month, { height: monthHeight }]}>
              <UiText
                accessibilityRole="header"
                numberOfLines={1}
                style={[styles.label, { height: cellSize }]}
              >
                {formatUiDate(new Date(`${month}-01T12:00:00Z`), {
                  year: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
              </UiText>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                horizontal
                scrollEnabled={gridWidth > availableWidth}
                showsHorizontalScrollIndicator={false}
                style={{ height: gridHeight, flexGrow: 0, flexShrink: 0 }}
                contentContainerStyle={{ height: gridHeight }}
              >
                <View style={{ width: gridWidth, height: gridHeight }}>
                  <View style={[styles.week, { height: cellSize }]}>
                    {Array.from({ length: 7 }, (_, index) => (
                      <UiText
                        key={index}
                        style={[
                          styles.weekday,
                          { width: gridWidth / 7, height: cellSize },
                        ]}
                      >
                        {formatUiDate(new Date(`2021-11-0${index + 1}T12:00:00Z`), {
                          weekday: "narrow",
                          timeZone: "UTC",
                        })}
                      </UiText>
                    ))}
                  </View>
                  {Array.from({ length: 6 }, (_, week) => (
                    <View key={week} style={[styles.week, { height: cellSize }]}>
                      {Array.from({ length: 7 }, (_, day) => {
                        const index = week * 7 + day;
                        const date = dates[index] ?? null;
                        const reference =
                          !!date &&
                          !!referenceRange?.start &&
                          date >= referenceRange.start &&
                          date <= (referenceRange.end || referenceRange.start);
                        const chosen =
                          !!date &&
                          !!draft.start &&
                          date >= draft.start &&
                          date <= (draft.end || draft.start);
                        return date ? (
                          <Pressable
                            key={date}
                            accessibilityRole="button"
                            accessibilityLabel={accessibleDate(date)}
                            accessibilityHint={
                              date === today
                                ? t("search.today")
                                : reference
                                  ? t("tripCreate.tripDateReference")
                                  : undefined
                            }
                            accessibilityState={{
                              selected: date === draft.start || date === draft.end,
                            }}
                            style={[
                              styles.day,
                              { width: gridWidth / 7, height: cellSize },
                              reference && styles.inRange,
                              chosen &&
                                (referenceRange ? styles.activityRange : styles.inRange),
                              (date === draft.start || date === draft.end) &&
                                styles.endpoint,
                              date === today && !chosen && styles.todayDay,
                            ]}
                            onPress={() => {
                              const next =
                                startWithCheckin && !choosingEnd
                                  ? { start: date, end: "" }
                                  : selectTripRange(draft, date);
                              setDraft(next);
                              setChoosingEnd(
                                startWithCheckin && !!next.start && !next.end,
                              );
                            }}
                          >
                            {date === today && chosen ? (
                              <View
                                pointerEvents="none"
                                testID="calendar-today-selected"
                                style={[
                                  styles.todayTint,
                                  referenceRange && styles.todayActivityTint,
                                ]}
                              />
                            ) : null}
                            <UiText
                              style={[
                                styles.label,
                                referenceRange && chosen && styles.activityText,
                              ]}
                            >
                              {formatUiNumber(+date.slice(8))}
                            </UiText>
                          </Pressable>
                        ) : (
                          <View
                            key={`blank-${index}`}
                            style={[
                              styles.day,
                              { width: gridWidth / 7, height: cellSize },
                            ]}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          );
        }}
      />
      <View style={styles.content}>
        {referenceRange?.start ? (
          <>
            <UiText style={styles.meta}>
              {t("tripCreate.tripDateReference")} · {tripRangeLabel(referenceRange)}
            </UiText>
            <UiText style={styles.meta}>
              {t(
                startWithCheckin
                  ? "tripCreate.stayDateReferenceHint"
                  : "tripCreate.activityDateReferenceHint",
              )}
            </UiText>
          </>
        ) : null}
        <UiButton
          variant="text"
          label={t("tripForm.clearDates")}
          onPress={() => {
            setDraft({ start: "", end: "" });
            setChoosingEnd(false);
          }}
        />
      </View>
    </>,
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.card },
    month: { paddingHorizontal: visual.space.page, gap: visual.space.card },
    week: { flexDirection: "row" },
    weekday: {
      textAlign: "center",
      ...visual.type.meta,
      color: c.textSecondary,
    },
    day: { justifyContent: "center", alignItems: "center" },
    inRange: { backgroundColor: c.selected },
    activityRange: { backgroundColor: c.accent },
    activityText: { color: c.onAccent },
    endpoint: {
      borderWidth: 1,
      borderColor: c.accent,
    },
    todayDay: { backgroundColor: c.separator },
    todayTint: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.accent,
      opacity: 0.12,
    },
    todayActivityTint: { backgroundColor: c.textPrimary, opacity: 0.08 },
    label: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
