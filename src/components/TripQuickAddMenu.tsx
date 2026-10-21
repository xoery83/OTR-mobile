import { ManualItineraryContent } from "@/features/day-feed/ManualItineraryContent";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readCaptureTripPrior } from "@/features/capture/captureTripPrior";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "./AppIcon";
import { SheetHeader } from "./SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { UiDatePicker, UiFormRow } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import {
  captureAccountScope,
  assertAccountRequestGeneration,
} from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { canEditLedgerExpense } from "@/data/repositories/ledgerExpenseEditAccess";

export function validSuggestedDate(value: string): string | null {
  try {
    return validateCalendarDate(value);
  } catch {
    return null;
  }
}
export function shiftSuggestedDate(value: string, direction: -1 | 1): string | null {
  const known = validSuggestedDate(value);
  if (!known) return null;
  const date = new Date(`${known}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + direction);
  return validSuggestedDate(date.toISOString().slice(0, 10));
}
// Only menu-local weak context; no Feed, Focus, bookmark or Capture fact mutation.
export function TripQuickAddMenu({
  tripId,
  date,
  showDate,
  itinerary,
  onManualSaved,
  photos,
  expense,
  capture,
  triggerStyle,
}: {
  tripId: string;
  date?: string;
  showDate: boolean;
  itinerary?: (date: string | null) => void;
  onManualSaved?: (itemId: string) => void;
  photos?: () => void;
  expense: (date: string | null) => void;
  capture?: () => void;
  triggerStyle: StyleProp<ViewStyle>;
}) {
  useUiLocale();
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const [manual, setManual] = useState(false);
  const [openedScope, setOpenedScope] = useState<{
    tripId: string;
    generation: number;
  } | null>(null);
  const [visible, setVisible] = useState(false),
    [suggested, setSuggested] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState(new Date());
  const [expenseReady, setExpenseReady] = useState(false);
  const [captureReady, setCaptureReady] = useState(false);
  const request = useRef(0);
  const openedContext = useRef<{ tripId: string; generation: number } | null>(null);
  const manualDismiss = useRef<(() => void) | null>(null);
  const current = () =>
    openedContext.current?.tripId === tripId &&
    openedContext.current.generation === getAccountGeneration();
  const registerDismissHandler = (handler: () => void) => {
    manualDismiss.current = handler;
    return () => {
      if (manualDismiss.current === handler) manualDismiss.current = null;
    };
  };
  useLayoutEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const close = () => {
    request.current += 1;
    openedContext.current = null;
    setOpenedScope(null);
    manualDismiss.current = null;
    setVisible(false);
    setPickerOpen(false);
    setManual(false);
  };
  const open = async () => {
    const ticket = ++request.current;
    openedContext.current = { tripId, generation };
    setOpenedScope({ tripId, generation });
    setManual(false);
    setSuggested(validSuggestedDate(date ?? "") ?? "");
    setExpenseReady(false);
    setCaptureReady(false);
    setVisible(true);
    try {
      const scope = await captureAccountScope(requireActiveUserId);
      const prior = await readCaptureTripPrior(tripId, scope);
      if (ticket !== request.current) return;
      setCaptureReady(Boolean(prior));
      const repo = await getDefaultLedgerReportingRepository();
      const [journeys, actor] = await Promise.all([
        repo.listJourneys(),
        repo.getActorContext(tripId),
      ]);
      assertAccountRequestGeneration(scope);
      if (ticket !== request.current) return;
      setExpenseReady(
        journeys.some((j) => j.journeyId === tripId) &&
          Boolean(actor?.memberId) &&
          canEditLedgerExpense(actor?.role, false),
      );
    } catch {
      /* Remains visibly unavailable; no inferred permission. */
    }
  };
  const invoke = (action: (() => void) | undefined) => {
    if (!action || !current()) return;
    close();
    action();
  };
  const knownDate = validSuggestedDate(suggested);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("actionIsland.addToTrip")}
        onPress={() => {
          void open();
        }}
        style={triggerStyle}
      >
        <AppIcon size={visual.bottomShell.icon} name="plus" color={colors.accent} />
      </Pressable>
      <Modal
        visible={
          visible &&
          openedScope?.tripId === tripId &&
          openedScope?.generation === generation
        }
        onRequestClose={() => {
          if (manualDismiss.current) manualDismiss.current();
          else close();
        }}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
      >
        <SafeAreaProvider style={styles.modalHost}>
          {manual &&
          onManualSaved &&
          openedScope?.tripId === tripId &&
          openedScope?.generation === generation ? (
            <ManualItineraryContent
              key={`${tripId}:${generation}`}
              tripId={tripId}
              generation={generation}
              initialDate={showDate ? knownDate : null}
              onClose={close}
              registerDismissHandler={registerDismissHandler}
              onSaved={(id) => {
                if (!current()) return;
                close();
                onManualSaved(id);
              }}
            />
          ) : (
            <View style={styles.backdrop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                style={StyleSheet.absoluteFill}
                onPress={close}
              />
              <SafeAreaView edges={["bottom", "left", "right"]} style={styles.menuSheet}>
                <SheetHeader
                  category="action"
                  title={t("actionIsland.addToTrip")}
                  leftLabel={t("common.cancel")}
                  onLeft={close}
                  safeTop={false}
                />
                <ScrollView
                  style={styles.menuScroll}
                  contentContainerStyle={styles.content}
                >
                  {showDate ? (
                    <View style={styles.dates}>
                      <View style={styles.dateRow}>
                        <AppIcon name="calendar" size={24} color={colors.textPrimary} />
                        <View style={styles.dateCopy}>
                          <UiText style={styles.meta}>{t("quickAdd.selectedDay")}</UiText>
                          <UiFormRow
                            label={t("actionIsland.suggestedDate")}
                            value={
                              knownDate
                                ? formatUiDate(new Date(`${knownDate}T12:00:00Z`), {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    timeZone: "UTC",
                                  })
                                : t("actionIsland.selectDate")
                            }
                            onPress={() => {
                              setPickerValue(
                                knownDate
                                  ? new Date(
                                      +knownDate.slice(0, 4),
                                      +knownDate.slice(5, 7) - 1,
                                      +knownDate.slice(8, 10),
                                      12,
                                    )
                                  : new Date(),
                              );
                              setPickerOpen(true);
                            }}
                          />
                        </View>
                        <View style={styles.arrows}>
                          {([-1, 1] as const).map((direction) => (
                            <Pressable
                              key={direction}
                              accessibilityRole="button"
                              accessibilityLabel={t(
                                direction === -1
                                  ? "actionIsland.previousDate"
                                  : "actionIsland.nextDate",
                              )}
                              accessibilityState={{ disabled: !knownDate }}
                              disabled={!knownDate}
                              onPress={() =>
                                setSuggested(
                                  shiftSuggestedDate(suggested, direction) ?? "",
                                )
                              }
                              style={styles.dateArrow}
                            >
                              <AppIcon
                                name={direction === -1 ? "chevron.left" : "chevron.right"}
                                size={18}
                                color={knownDate ? colors.textPrimary : colors.disabled}
                              />
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      {pickerOpen ? (
                        <View>
                          <UiDatePicker
                            value={pickerValue}
                            mode="date"
                            display="spinner"
                            accessibilityLabel={t("actionIsland.suggestedDate")}
                            onChange={(_, value) => {
                              if (value) setPickerValue(value);
                            }}
                          />
                          <UiButton
                            label={t("common.done")}
                            onPress={() => {
                              setSuggested(
                                [
                                  pickerValue.getFullYear(),
                                  String(pickerValue.getMonth() + 1).padStart(2, "0"),
                                  String(pickerValue.getDate()).padStart(2, "0"),
                                ].join("-"),
                              );
                              setPickerOpen(false);
                            }}
                          />
                        </View>
                      ) : null}
                      <UiText style={styles.meta}>
                        {t(
                          knownDate ? "actionIsland.weakDate" : "actionIsland.selectDate",
                        )}
                      </UiText>
                    </View>
                  ) : null}
                  <UiFormRow
                    variant="action"
                    value={t(
                      captureReady
                        ? "quickAdd.importHint"
                        : "actionIsland.tripCaptureUnavailable",
                    )}
                    label={t("actionIsland.importPlans")}
                    leading={
                      <View style={styles.icon}>
                        <AppIcon
                          name="doc.badge.arrow.up"
                          size={26}
                          color={colors.accent}
                        />
                      </View>
                    }
                    trailing={
                      <AppIcon
                        name="chevron.right"
                        size={16}
                        color={colors.textSecondary}
                      />
                    }
                    disabled={!capture || !captureReady}
                    onPress={() => invoke(capture)}
                  />
                  <View style={styles.grid}>
                    <View style={styles.tile}>
                      <UiFormRow
                        variant="action"
                        value={t("quickAdd.itineraryHint")}
                        label={t("actionIsland.itinerary")}
                        leading={
                          <View style={styles.icon}>
                            <AppIcon
                              name="calendar.badge.plus"
                              size={25}
                              color={colors.accent}
                            />
                          </View>
                        }
                        disabled={
                          (!itinerary && !onManualSaved) || (showDate && !knownDate)
                        }
                        onPress={() => {
                          if (!current()) return;
                          if (onManualSaved) setManual(true);
                          else invoke(itinerary ? () => itinerary(knownDate) : undefined);
                        }}
                      />
                    </View>
                    <View style={styles.tile}>
                      <UiFormRow
                        variant="action"
                        value={t("quickAdd.expenseHint")}
                        label={t("ledger.addExpense")}
                        leading={
                          <View style={styles.expenseIcon}>
                            <AppIcon name="banknote" size={25} color={colors.warning} />
                          </View>
                        }
                        disabled={!expenseReady || (showDate && !knownDate)}
                        onPress={() => invoke(() => expense(knownDate))}
                      />
                    </View>
                    <View style={styles.tile}>
                      <UiFormRow
                        variant="action"
                        value={t("actionIsland.membersUnavailable")}
                        label={t("actionIsland.member")}
                        leading={
                          <View style={styles.icon}>
                            <AppIcon
                              name="person.badge.plus"
                              size={25}
                              color={colors.textSecondary}
                            />
                          </View>
                        }
                        disabled
                        onPress={() => {}}
                      />
                    </View>
                    <View style={styles.tile}>
                      <UiFormRow
                        variant="action"
                        value={t("quickAdd.photosHint")}
                        label={t("tripPhotos.choose")}
                        leading={
                          <View style={styles.icon}>
                            <AppIcon name="photo" size={25} color={colors.accent} />
                          </View>
                        }
                        disabled={!photos}
                        onPress={() => invoke(photos)}
                      />
                    </View>
                  </View>
                </ScrollView>
              </SafeAreaView>
            </View>
          )}
        </SafeAreaProvider>
      </Modal>
    </>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: c.background },
    modalHost: { flex: 1 },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay },
    menuSheet: {
      maxHeight: "90%",
      backgroundColor: c.background,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      overflow: "hidden",
    },
    menuScroll: { flexGrow: 0, flexShrink: 1 },
    content: { padding: visual.space.page, gap: visual.space.card },
    dates: { gap: visual.space.heading },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tile: { flexBasis: "47%", flexGrow: 1 },
    icon: {
      width: 44,
      minHeight: 48,
      borderRadius: visual.radius.card,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accentSurface,
    },
    expenseIcon: {
      width: 44,
      minHeight: 48,
      borderRadius: visual.radius.card,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.warningSurface,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      gap: 10,
      borderRadius: visual.radius.card,
      backgroundColor: c.selected,
    },
    dateCopy: { flex: 1 },
    arrows: { flexDirection: "row", gap: 6 },
    dateArrow: {
      minWidth: 44,
      minHeight: 44,
      borderRadius: visual.radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
    },
    heading: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
