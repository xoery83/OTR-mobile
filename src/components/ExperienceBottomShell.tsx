import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { TripQuickAddMenu } from "./TripQuickAddMenu";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  captureAccountScope,
  assertAccountRequestGeneration,
} from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { canEditLedgerExpense } from "@/data/repositories/ledgerExpenseEditAccess";
import { UiText as Text } from "@/ui/controls";
import { router, useGlobalSearchParams } from "expo-router";
import { Alert, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// S1 exposes only a selected, account-generation-scoped accepted Day.
// The Today route performs the owning read again after navigation.
export function ExperienceBottomShell({
  visible,
  pathname,
}: {
  visible: boolean;
  pathname: string;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const largeText = useWindowDimensions().fontScale > 2;
  const { view, workingTrip, resumeView, resume, quickActions } = useTripView();
  const params = useGlobalSearchParams<{
    journeyId?: string;
    view?: string;
    tripId?: string;
  }>();
  const journeyId =
    typeof params.journeyId === "string"
      ? params.journeyId
      : (workingTrip?.tripId ?? null);
  const isDay = pathname === "/" || (pathname === "/trip" && params.view === "day");
  const contextualTripId = isDay
    ? view?.tripId
    : pathname === "/trip" &&
        !["trips", "create"].includes(params.view ?? "") &&
        typeof params.tripId === "string"
      ? params.tripId
      : null;
  const activeQuickActions =
    quickActions?.tripId === contextualTripId ? quickActions : null;
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const targetKey = JSON.stringify([
    pathname,
    journeyId,
    workingTrip?.tripId,
    contextualTripId,
    generation,
  ]);
  const renderedTarget = useMemo(() => Symbol(targetKey), [targetKey]);
  const currentTarget = useRef<symbol | null>(null);
  useLayoutEffect(() => {
    currentTarget.current = renderedTarget;
    return () => {
      currentTarget.current = null;
    };
  }, [renderedTarget]);
  const tripList =
    pathname === "/trip" &&
    (!params.tripId || params.view === "trips" || params.view === "create");
  const ledger = pathname.startsWith("/expenses") && Boolean(journeyId);
  const startTrip = () =>
    Alert.alert(t("actionIsland.startTrip"), undefined, [
      { text: t("actionIsland.importPlans"), onPress: () => router.navigate("/capture") },
      {
        text: t("actionIsland.createManually"),
        onPress: () =>
          router.setParams({ tripId: "", date: "", zone: "", view: "create" }),
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  const openExpense = async (
    targetId = journeyId,
    suggestedDate: string | null = null,
    fromHome = false,
  ) => {
    if (!targetId) return;
    const target = renderedTarget;
    if (target !== currentTarget.current || generation !== getAccountGeneration()) return;
    try {
      const scope = await captureAccountScope(requireActiveUserId);
      const repo = await getDefaultLedgerReportingRepository();
      const [journeys, actor] = await Promise.all([
        repo.listJourneys(),
        repo.getActorContext(targetId),
      ]);
      assertAccountRequestGeneration(scope);
      if (!target || target !== currentTarget.current) return;
      if (
        !journeys.some((journey) => journey.journeyId === targetId) ||
        !actor?.memberId ||
        !canEditLedgerExpense(actor.role, false)
      ) {
        Alert.alert(t("actionIsland.expenseUnavailable"));
        return;
      }
      router.push({
        pathname: "/expenses/new",
        params: {
          journeyId: targetId,
          returnTo: fromHome ? "home" : "source",
          ...(suggestedDate ? { suggestedDate } : {}),
        },
      });
    } catch {
      /* Stale or unavailable authority cannot open a new Expense. */
    }
  };
  if (!visible || params.view === "create") return null;
  const openMyTrips = () => {
    if (workingTrip) {
      router.navigate({
        pathname: "/trip",
        params: { tripId: workingTrip.tripId, view: "home" },
      });
      return;
    }
    if (pathname === "/trip") router.setParams({ view: "trips" });
    else router.navigate({ pathname: "/trip", params: { view: "trips" } });
  };
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.safe}>
      <View style={[styles.row, largeText && styles.largeRow]}>
        <View style={styles.navigationIsland}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(workingTrip ? "dayFeed.tripHome" : "dayFeed.myTrips")}
            accessibilityHint={t("shell.openMyTrips")}
            accessibilityState={{ selected: pathname === "/trip" && !isDay }}
            onPress={openMyTrips}
            style={[
              styles.destination,
              largeText && styles.largeDestination,
              pathname === "/trip" && !isDay && styles.selectedDestination,
            ]}
          >
            <AppIcon
              name="suitcase"
              color={
                pathname === "/trip" && !isDay ? colors.accent : colors.textSecondary
              }
            />
            <Text
              style={[styles.label, pathname === "/trip" && !isDay && styles.activeLabel]}
            >
              {t(workingTrip ? "dayFeed.tripHome" : "dayFeed.myTrips")}
            </Text>
          </Pressable>
          {resumeView || view ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("shell.day")}
              accessibilityHint={t("shell.openSelectedDay")}
              accessibilityState={{ selected: isDay }}
              onPress={() => {
                resume();
                router.navigate("/");
              }}
              style={[
                styles.destination,
                largeText && styles.largeDestination,
                isDay && styles.selectedDestination,
              ]}
            >
              <AppIcon
                name="calendar"
                color={isDay ? colors.accent : colors.textSecondary}
              />
              <Text style={[styles.label, isDay && styles.activeLabel]}>
                {t("shell.day")}
              </Text>
            </Pressable>
          ) : null}
          {workingTrip ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("navigation.ledger")}
              accessibilityState={{ selected: pathname.startsWith("/expenses") }}
              onPress={() => router.navigate("/expenses")}
              style={[
                styles.destination,
                largeText && styles.largeDestination,
                pathname.startsWith("/expenses") && styles.selectedDestination,
              ]}
            >
              <AppIcon
                name="list.bullet.rectangle"
                color={
                  pathname.startsWith("/expenses") ? colors.accent : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.label,
                  pathname.startsWith("/expenses") && styles.activeLabel,
                ]}
              >
                {t("navigation.ledger")}
              </Text>
            </Pressable>
          ) : null}
          {workingTrip ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("updates.title")}
              accessibilityState={{ selected: pathname === "/updates" }}
              onPress={() => router.navigate("/updates")}
              style={[
                styles.destination,
                largeText && styles.largeDestination,
                pathname === "/updates" && styles.selectedDestination,
              ]}
            >
              <AppIcon
                name="bell"
                color={pathname === "/updates" ? colors.accent : colors.textSecondary}
              />
              <Text style={[styles.label, pathname === "/updates" && styles.activeLabel]}>
                {t("updates.title")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {contextualTripId ? (
          <View style={styles.actionIsland}>
            <TripQuickAddMenu
              key={contextualTripId}
              tripId={contextualTripId}
              date={
                isDay
                  ? resumeView?.tripId === view?.tripId &&
                    resumeView?.generation === view?.generation
                    ? resumeView?.date
                    : view?.date
                  : undefined
              }
              showDate={isDay}
              triggerStyle={styles.action}
              itinerary={
                activeQuickActions
                  ? (date) => {
                      router.navigate({
                        pathname: "/trip",
                        params: { tripId: contextualTripId, view: "home" },
                      });
                      activeQuickActions.itinerary(date);
                    }
                  : undefined
              }
              photos={
                activeQuickActions?.photos
                  ? () => {
                      router.navigate({
                        pathname: "/trip",
                        params: { tripId: contextualTripId, view: "home" },
                      });
                      activeQuickActions.photos?.();
                    }
                  : undefined
              }
              capture={() => {
                if (
                  renderedTarget !== currentTarget.current ||
                  generation !== getAccountGeneration()
                )
                  return;
                router.navigate({
                  pathname: "/capture",
                  params: { tripId: contextualTripId },
                });
              }}
              expense={(date) => {
                void openExpense(contextualTripId, date, true);
              }}
            />
          </View>
        ) : null}
        {tripList || ledger ? (
          <View style={styles.actionIsland}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                ledger ? "ledger.addExpense" : "actionIsland.startTrip",
              )}
              onPress={
                ledger
                  ? () => {
                      void openExpense();
                    }
                  : startTrip
              }
              style={styles.action}
            >
              <AppIcon name="plus" color={colors.accent} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    safe: { backgroundColor: c.transparent },
    row: {
      paddingHorizontal: visual.space.page,
      paddingTop: visual.space.heading,
      paddingBottom: visual.space.heading,
      flexDirection: "row",
      justifyContent: "space-between",
      gap: visual.space.heading,
    },
    largeRow: { paddingBottom: visual.space.section },
    navigationIsland: {
      flex: 1,
      padding: visual.space.heading / 2,
      shadowColor: c.shadow,
      shadowOpacity: 0.12,
      shadowRadius: visual.space.heading,
      shadowOffset: { width: 0, height: 2 },
      backgroundColor: c.floatingSurface,
      borderColor: c.separator,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: visual.radius.pill,
      flexDirection: "row",
    },
    actionIsland: {
      alignSelf: "center",
      shadowColor: c.shadow,
      shadowOpacity: 0.12,
      shadowRadius: visual.space.heading,
      shadowOffset: { width: 0, height: 2 },
      backgroundColor: c.floatingSurface,
      borderColor: c.separator,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: visual.radius.pill,
    },
    action: {
      minWidth: 48,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    destination: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      paddingHorizontal: visual.space.heading,
      flexDirection: "column",
      paddingVertical: visual.space.heading,
      borderRadius: visual.radius.pill,
      alignItems: "center",
      justifyContent: "center",
      gap: visual.space.heading,
    },
    largeDestination: {
      minHeight: 76,
      paddingVertical: visual.space.card,
    },
    selectedDestination: { backgroundColor: c.selected },
    label: {
      ...visual.type.action,
      color: c.textSecondary,
      textAlign: "center",
      flexShrink: 1,
    },
    activeLabel: { color: c.accent },
  });
