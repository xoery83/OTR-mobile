import { DayReadSkeleton } from "./DayReadSkeleton";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Alert, Linking, ScrollView, StyleSheet } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { NavigationContentFrame } from "@/components/navigationChrome";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import { createDefaultManualStayRepository } from "@/data/repositories/manualStayRepository";
import { loadP3Detail, type P3DetailState } from "./p3DetailRead";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { StayReadView } from "./StayReadView";
import { useMinuteClock } from "./useMinuteClock";
import { localCalendarDate } from "@/domain/trip/dayReadModel";
import { P3StayEditor } from "./P3StayEditor";
import { useTripView } from "./TripViewContext";

export function P3Detail() {
  useUiLocale();
  const params = useLocalSearchParams<{
    tripId?: string;
    itemId?: string;
    occurrence?: string;
    date?: string;
  }>();
  const tripId = typeof params.tripId === "string" ? params.tripId : "";
  const itemId = typeof params.itemId === "string" ? params.itemId : "";
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { reportManualOutcome } = useTripView();
  const [state, setState] = useState<P3DetailState | null>(null);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setState((previous) => (previous ? { ...previous, editor: null } : null));
      setFailed(false);
      setEditing(false);
      void loadP3Detail(
        {
          tripId,
          itemId,
          generation,
          occurrence:
            params.occurrence === "CHECKOUT"
              ? "CHECKOUT"
              : params.occurrence === "BASE"
                ? "BASE"
                : "CHECKIN",
        },
        {
          read: async (id) => (await readTripDayFeed()).trip(id),
          repository: createDefaultManualStayRepository,
          generation: getAccountGeneration,
          onReadable: (next) => {
            if (active && generation === getAccountGeneration()) setState(next);
          },
        },
      )
        .then((next) => {
          if (active && next) setState(next);
        })
        .catch(() => {
          if (active && generation === getAccountGeneration()) {
            setState(null);
            setFailed(true);
          }
        });
      return () => {
        active = false;
      };
      // A successful Repository save invalidates this same Item read.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tripId, itemId, generation, params.occurrence, revision]),
  );
  const visible =
    state?.generation === generation && state.tripId === tripId && state.itemId === itemId
      ? state
      : null;
  const clock = useMinuteClock(visible?.presentation.zone ?? null);
  const currentDate = visible?.presentation.zone
    ? localCalendarDate(clock.instant, visible.presentation.zone)
    : null;
  const role =
    params.occurrence === "CHECKOUT"
      ? "CHECKOUT"
      : params.occurrence === "BASE"
        ? "BASE"
        : "CHECKIN";
  const date =
    role === "CHECKOUT"
      ? visible?.presentation.end
      : role === "BASE" &&
          typeof params.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(params.date) &&
          visible &&
          params.date >= visible.presentation.start &&
          params.date <= visible.presentation.end
        ? params.date
        : visible?.presentation.start;
  const context =
    currentDate && date
      ? date < currentDate
        ? "PAST"
        : date === currentDate
          ? "TODAY"
          : "FUTURE"
      : "UNKNOWN";
  const targets = visible?.mapTargets;
  const openMap = (url: string) => {
    void Linking.openURL(url).catch(() => Alert.alert(t("p3.mapUnavailable")));
  };
  const presentation = visible
    ? {
        ...visible.presentation,
        addExpense: () =>
          router.push({
            pathname: "/trip-item-expense",
            params: {
              journeyId: tripId,
              returnTo: "source",
              suggestedTitle: visible.presentation.title,
              suggestedDate: date ?? visible.presentation.start,
              mode: "manual",
            },
          }),
        ...(targets
          ? {
              map: () => openMap(targets.map),
              ...(targets.navigate ? { navigate: () => openMap(targets.navigate!) } : {}),
            }
          : {}),
      }
    : null;
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "",
          headerTitle: "",
          headerBackVisible: true,
          headerBackButtonDisplayMode: "minimal",
          headerTransparent: true,
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel={t("tripCreate.editStay")}
          disabled={!visible?.editor}
          onPress={() => setEditing(true)}
        />
      </Stack.Toolbar>
      <NavigationContentFrame>
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          {visible ? (
            <StayReadView stay={presentation!} role={role} context={context} />
          ) : failed ? (
            <UiText accessibilityRole="alert" style={styles.meta}>
              {t("dayFeed.unavailable")}
            </UiText>
          ) : (
            <DayReadSkeleton />
          )}
        </ScrollView>
      </NavigationContentFrame>
      {editing && visible?.editor ? (
        <P3StayEditor
          tripId={tripId}
          itemId={itemId}
          opened={visible.editor}
          onClose={() => setEditing(false)}
          onSaved={(id) => {
            if (generation !== getAccountGeneration()) return;
            setEditing(false);
            reportManualOutcome(tripId, generation, id);
            setRevision((value) => value + 1);
          }}
        />
      ) : null}
    </>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: visual.space.feedGutter,
      paddingBottom: visual.space.section,
    },
    meta: {
      ...visual.type.meta,
      color: colors.textSecondary,
      padding: visual.space.page,
    },
  });
