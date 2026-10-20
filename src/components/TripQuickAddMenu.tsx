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
              <SafeAreaView edges={["bottom", "left", "right"]} style={styles.menuSheet}>
                <SheetHeader
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
                      <UiText style={styles.heading}>
                        {t("actionIsland.suggestedDate")}
                      </UiText>
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
                      <View style={styles.arrows}>
                        <UiButton
                          variant="text"
                          label={t("actionIsland.previousDate")}
                          disabled={!knownDate}
                          onPress={() =>
                            setSuggested(shiftSuggestedDate(suggested, -1) ?? "")
                          }
                        />
                        <UiButton
                          variant="text"
                          label={t("actionIsland.nextDate")}
                          disabled={!knownDate}
                          onPress={() =>
                            setSuggested(shiftSuggestedDate(suggested, 1) ?? "")
                          }
                        />
                      </View>
                      <UiText style={styles.meta}>
                        {t(
                          knownDate ? "actionIsland.weakDate" : "actionIsland.selectDate",
                        )}
                      </UiText>
                    </View>
                  ) : null}
                  <UiFormRow
                    value=""
                    label={t("actionIsland.importCapture")}
                    disabled={!capture || !captureReady}
                    onPress={() => invoke(capture)}
                  />
                  <UiText style={styles.meta}>
                    {t(
                      captureReady
                        ? "actionIsland.tripCapturePrior"
                        : "actionIsland.tripCaptureUnavailable",
                    )}
                  </UiText>
                  <UiFormRow
                    value=""
                    label={t("actionIsland.itinerary")}
                    disabled={(!itinerary && !onManualSaved) || (showDate && !knownDate)}
                    onPress={() => {
                      if (!current()) return;
                      if (onManualSaved) setManual(true);
                      else invoke(itinerary ? () => itinerary(knownDate) : undefined);
                    }}
                  />
                  <UiFormRow
                    value=""
                    label={t("ledger.addExpense")}
                    disabled={!expenseReady || (showDate && !knownDate)}
                    onPress={() => invoke(() => expense(knownDate))}
                  />
                  <UiFormRow
                    value={t("cleanup.unavailable")}
                    label={t("actionIsland.member")}
                    disabled
                    onPress={() => {}}
                  />
                  <UiFormRow
                    value=""
                    label={t("tripPhotos.choose")}
                    disabled={!photos}
                    onPress={() => invoke(photos)}
                  />
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
      borderTopLeftRadius: visual.radius.card,
      borderTopRightRadius: visual.radius.card,
      overflow: "hidden",
    },
    menuScroll: { flexGrow: 0, flexShrink: 1 },
    content: { padding: visual.space.page, gap: visual.space.card },
    dates: { gap: visual.space.heading },
    arrows: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    heading: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
