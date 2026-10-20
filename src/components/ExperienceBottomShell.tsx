import { openTripHome } from "./openTripHome";
import { isTripWorkspacePath } from "./tripShellNavigation";
import { shellShowsUpdates } from "./bottomBarVisibility";
import { useUpdatesSignal } from "@/features/updates/useUpdatesSignal";
import { requireOptionalNativeModule } from "expo-modules-core";
import type { ComponentType } from "react";
import type { GlassViewProps } from "expo-glass-effect";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { TripQuickAddMenu } from "./TripQuickAddMenu";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BottomTabBarHeightCallbackContext } from "expo-router/js-tabs";
import {
  captureAccountScope,
  assertAccountRequestGeneration,
} from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { canEditLedgerExpense } from "@/data/repositories/ledgerExpenseEditAccess";
import { UiText as Text } from "@/ui/controls";
import { router, useGlobalSearchParams } from "expo-router";
import {
  AccessibilityInfo,
  Alert,
  ActionSheetIOS,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// S1 exposes only a selected, account-generation-scoped accepted Day.
// The Today route performs the owning read again after navigation.
function installedGlassView(): ComponentType<GlassViewProps> | null {
  try {
    const module = requireOptionalNativeModule<{
      isLiquidGlassAvailable?: boolean;
      isGlassEffectAPIAvailable?: boolean;
    }>("ExpoGlassEffect");
    if (
      module?.isLiquidGlassAvailable !== true ||
      module.isGlassEffectAPIAvailable !== true
    )
      return null;
    return (require("expo-glass-effect") as typeof import("expo-glass-effect")).GlassView;
  } catch {
    return null;
  }
}
const Glass = installedGlassView();
const Material = Glass ?? View;
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
  const largeText = useWindowDimensions().fontScale > 1.5;
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const [reducedTransparency, setReducedTransparency] = useState(false);
  useEffect(() => {
    let active = true,
      eventObserved = false;
    const initial = AccessibilityInfo?.isReduceTransparencyEnabled?.();
    void initial
      ?.then((value) => {
        if (active && !eventObserved) setReducedTransparency(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo?.addEventListener?.(
      "reduceTransparencyChanged",
      (value) => {
        eventObserved = true;
        if (active) setReducedTransparency(value);
      },
    );
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  const {
    view,
    workingTrip,
    resumeView,
    resume,
    quickActions,
    dayShellChrome,
    reportManualOutcome,
  } = useTripView();
  const params = useGlobalSearchParams<{
    journeyId?: string;
    view?: string;
    tripId?: string;
  }>();
  const journeyId =
    typeof params.journeyId === "string"
      ? params.journeyId
      : (workingTrip?.tripId ?? null);
  const isDay =
    pathname === "/" || (isTripWorkspacePath(pathname) && params.view === "day");
  const contextualTripId = isDay
    ? (view?.tripId ??
      (workingTrip?.generation === getAccountGeneration() ? workingTrip.tripId : null))
    : isTripWorkspacePath(pathname) &&
        !["trips", "create"].includes(params.view ?? "") &&
        typeof params.tripId === "string"
      ? params.tripId
      : null;
  const activeQuickActions =
    quickActions?.tripId === contextualTripId &&
    quickActions.generation === getAccountGeneration()
      ? quickActions
      : null;
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const matchesRoute = (tripId: string) =>
    !isTripWorkspacePath(pathname) || !params.tripId || params.tripId === tripId;
  const shellTripId =
    activeQuickActions?.tripId ??
    (workingTrip?.generation === generation && matchesRoute(workingTrip.tripId)
      ? workingTrip.tripId
      : view?.generation === generation && matchesRoute(view.tripId)
        ? view.tripId
        : null);
  const unreadActionable = useUpdatesSignal(
    shellTripId ?? null,
    pathname,
    visible && params.view !== "create" && workingTrip?.generation === generation,
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
  useLayoutEffect(() => {
    if (!visible || params.view === "create") onHeightChange?.(0);
  }, [visible, params.view, onHeightChange]);
  const tripList =
    pathname === "/trip" &&
    (!params.tripId || params.view === "trips" || params.view === "create");
  const ledger = pathname.startsWith("/expenses") && Boolean(journeyId);
  const startTrip = () => {
    const invoke = (index: number) => {
      if (
        generation !== getAccountGeneration() ||
        renderedTarget !== currentTarget.current
      )
        return;
      if (index === 0) router.navigate("/capture");
      if (index === 1)
        router.setParams({ tripId: "", date: "", zone: "", view: "create" });
    };
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t("actionIsland.startTrip"),
          options: [
            t("actionIsland.importPlans"),
            t("actionIsland.createManually"),
            t("common.cancel"),
          ],
          cancelButtonIndex: 2,
        },
        invoke,
      );
    else
      Alert.alert(t("actionIsland.startTrip"), undefined, [
        { text: t("actionIsland.importPlans"), onPress: () => invoke(0) },
        { text: t("actionIsland.createManually"), onPress: () => invoke(1) },
        { text: t("common.cancel"), style: "cancel" },
      ]);
  };
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
    if (generation !== getAccountGeneration() || renderedTarget !== currentTarget.current)
      return;
    if (shellTripId) {
      openTripHome(shellTripId, pathname, params.view);
      return;
    }
    if (pathname === "/trip") router.setParams({ view: "trips" });
    else router.navigate({ pathname: "/trip", params: { view: "trips" } });
  };
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      pointerEvents="box-none"
      onLayout={({ nativeEvent }) => onHeightChange?.(nativeEvent.layout.height)}
      style={styles.safe}
    >
      <View
        pointerEvents="box-none"
        style={[styles.row, tripList && styles.actionsOnly, largeText && styles.largeRow]}
      >
        {!tripList ? (
          <Material
            {...(Glass
              ? { glassEffectStyle: "regular" as const, isInteractive: true }
              : {})}
            accessibilityElementsHidden={
              isDay &&
              dayShellChrome?.tripId === shellTripId &&
              dayShellChrome?.generation === generation &&
              !dayShellChrome.navigationVisible
            }
            pointerEvents={
              isDay &&
              dayShellChrome?.tripId === shellTripId &&
              !dayShellChrome.navigationVisible
                ? "none"
                : "auto"
            }
            style={[
              styles.navigationIsland,
              isDay &&
                dayShellChrome?.tripId === shellTripId &&
                dayShellChrome?.generation === generation &&
                !dayShellChrome.navigationVisible && { opacity: 0 },
              Glass && styles.nativeMaterial,
              reducedTransparency && styles.reducedMaterial,
              largeText && styles.largeNavigationIsland,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(shellTripId ? "shell.home" : "dayFeed.myTrips")}
              accessibilityHint={t("shell.openMyTrips")}
              accessibilityState={{ selected: isTripWorkspacePath(pathname) && !isDay }}
              onPress={openMyTrips}
              style={[
                styles.destination,
                largeText && styles.largeDestination,
                isTripWorkspacePath(pathname) && !isDay && styles.selectedDestination,
              ]}
            >
              <AppIcon
                size={visual.bottomShell.icon}
                name="house"
                color={
                  isTripWorkspacePath(pathname) && !isDay
                    ? colors.accent
                    : colors.textPrimary
                }
              />
              <Text
                numberOfLines={largeText ? undefined : 1}
                style={[
                  styles.label,
                  isTripWorkspacePath(pathname) && !isDay && styles.activeLabel,
                ]}
              >
                {t(shellTripId ? "shell.home" : "dayFeed.myTrips")}
              </Text>
            </Pressable>
            {shellTripId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("shell.day")}
                accessibilityHint={t("shell.openSelectedDay")}
                accessibilityState={{ selected: isDay }}
                onPress={() => {
                  if (
                    generation !== getAccountGeneration() ||
                    renderedTarget !== currentTarget.current
                  )
                    return;
                  const savedDay = resumeView ?? view;
                  if (
                    savedDay?.tripId === shellTripId &&
                    savedDay.generation === generation
                  ) {
                    resume();
                    // The legacy root Tab has JS header actions; resume in the native Trip Stack.
                    router.navigate({
                      pathname: "/trip-home",
                      params: {
                        tripId: savedDay.tripId,
                        view: "day",
                        date: savedDay.date,
                        zone: savedDay.zone ?? "",
                        viewMode: savedDay.zone === null ? "FLOATING" : "NAMED_ZONE",
                      },
                    });
                  } else if (activeQuickActions?.chooseDay) {
                    activeQuickActions.chooseDay();
                  } else {
                    router.navigate({
                      pathname: "/trip-home",
                      params: { tripId: shellTripId, view: "day" },
                    });
                  }
                }}
                style={[
                  styles.destination,
                  largeText && styles.largeDestination,
                  isDay && styles.selectedDestination,
                ]}
              >
                <AppIcon
                  size={visual.bottomShell.icon}
                  name="calendar"
                  color={isDay ? colors.accent : colors.textPrimary}
                />
                <Text
                  numberOfLines={largeText ? undefined : 1}
                  style={[styles.label, isDay && styles.activeLabel]}
                >
                  {t("shell.day")}
                </Text>
              </Pressable>
            ) : null}
            {shellTripId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("navigation.ledger")}
                accessibilityState={{ selected: pathname.startsWith("/expenses") }}
                onPress={() => {
                  if (
                    generation !== getAccountGeneration() ||
                    renderedTarget !== currentTarget.current
                  )
                    return;
                  router.navigate({
                    pathname: "/expenses",
                    params: { journeyId: shellTripId },
                  });
                }}
                style={[
                  styles.destination,
                  largeText && styles.largeDestination,
                  pathname.startsWith("/expenses") && styles.selectedDestination,
                ]}
              >
                <AppIcon
                  size={visual.bottomShell.icon}
                  name="list.bullet.rectangle"
                  color={
                    pathname.startsWith("/expenses") ? colors.accent : colors.textPrimary
                  }
                />
                <Text
                  numberOfLines={largeText ? undefined : 1}
                  style={[
                    styles.label,
                    pathname.startsWith("/expenses") && styles.activeLabel,
                  ]}
                >
                  {t("navigation.ledger")}
                </Text>
              </Pressable>
            ) : null}
            {shellShowsUpdates(pathname, params, Boolean(shellTripId)) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("updates.title")}
                accessibilityHint={
                  unreadActionable && unreadActionable > 0
                    ? t("updates.unreadActionableBadge", {
                        count: formatUiNumber(unreadActionable),
                      })
                    : undefined
                }
                accessibilityState={{ selected: pathname === "/updates" }}
                onPress={() => router.navigate("/updates")}
                style={[
                  styles.destination,
                  largeText && styles.largeDestination,
                  pathname === "/updates" && styles.selectedDestination,
                ]}
              >
                <View style={styles.badgeAnchor}>
                  <AppIcon
                    size={visual.bottomShell.icon}
                    name="bell"
                    color={pathname === "/updates" ? colors.accent : colors.textPrimary}
                  />
                  {unreadActionable && unreadActionable > 0 ? (
                    <View
                      style={styles.badge}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Text style={styles.badgeText}>
                        {formatUiNumber(unreadActionable)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={largeText ? undefined : 1}
                  style={[styles.label, pathname === "/updates" && styles.activeLabel]}
                >
                  {t("updates.title")}
                </Text>
              </Pressable>
            ) : null}
          </Material>
        ) : null}
        {!tripList && !ledger && contextualTripId ? (
          <Material
            {...(Glass
              ? { glassEffectStyle: "regular" as const, isInteractive: true }
              : {})}
            style={[
              styles.actionIsland,
              Glass && styles.nativeMaterial,
              reducedTransparency && styles.reducedMaterial,
            ]}
          >
            <TripQuickAddMenu
              key={`${targetKey}:${generation}`}
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
              onManualSaved={(id) => {
                if (
                  generation !== getAccountGeneration() ||
                  renderedTarget !== currentTarget.current
                )
                  return;
                reportManualOutcome(contextualTripId, generation, id);
              }}
              photos={
                activeQuickActions?.photos
                  ? () => {
                      router.navigate({
                        pathname: "/trip-home",
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
          </Material>
        ) : null}
        {tripList || ledger ? (
          <Material
            {...(Glass
              ? { glassEffectStyle: "regular" as const, isInteractive: true }
              : {})}
            style={[
              styles.actionIsland,
              Glass && styles.nativeMaterial,
              reducedTransparency && styles.reducedMaterial,
            ]}
          >
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
              <AppIcon size={visual.bottomShell.icon} name="plus" color={colors.accent} />
            </Pressable>
          </Material>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    safe: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: c.transparent,
    },
    nativeMaterial: { backgroundColor: c.transparent },
    reducedMaterial: { backgroundColor: c.floatingSurface },
    actionsOnly: { justifyContent: "flex-end" },
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
      padding: visual.bottomShell.gap,
      minHeight: visual.bottomShell.height,
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowRadius: visual.space.heading,
      shadowOffset: { width: 0, height: 2 },
      backgroundColor: c.floatingSurface,
      borderColor: c.separator,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: visual.radius.pill,
      flexDirection: "row",
    },
    largeNavigationIsland: { flexWrap: "wrap" },
    actionIsland: {
      alignSelf: "center",
      minWidth: visual.bottomShell.height,
      minHeight: visual.bottomShell.height,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowRadius: visual.space.heading,
      shadowOffset: { width: 0, height: 2 },
      backgroundColor: c.floatingSurface,
      borderColor: c.separator,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: visual.radius.pill,
    },
    action: {
      minWidth: visual.bottomShell.height,
      minHeight: visual.bottomShell.height,
      alignItems: "center",
      justifyContent: "center",
    },
    destination: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      paddingHorizontal: visual.bottomShell.gap,
      flexDirection: "column",
      paddingVertical: visual.bottomShell.gap,
      borderRadius: visual.radius.card,
      alignItems: "center",
      justifyContent: "center",
      gap: visual.bottomShell.gap,
    },
    largeDestination: {
      flexBasis: "50%",
      flexGrow: 0,
      flexShrink: 0,
      minHeight: 76,
      paddingVertical: visual.space.card,
    },
    badgeAnchor: { position: "relative" },
    badge: {
      position: "absolute",
      top: -visual.space.heading,
      right: -visual.space.card,
      borderRadius: visual.radius.pill,
      backgroundColor: c.destructiveSurface,
      paddingHorizontal: visual.space.heading / 2,
    },
    badgeText: { ...visual.type.meta, color: c.destructive },
    selectedDestination: { backgroundColor: c.floatingSelected },
    label: {
      ...visual.type.navigation,
      color: c.textSecondary,
      textAlign: "center",
      flexShrink: 1,
    },
    activeLabel: { color: c.accent },
  });
