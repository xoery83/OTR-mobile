import { DayReadSkeleton } from "./DayReadSkeleton";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { NavigationContentFrame } from "@/components/navigationChrome";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import { createDefaultManualActivityRepository } from "@/data/repositories/manualActivityRepository";
import { loadP6Detail, type P6DetailState } from "./p6DetailRead";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { localCalendarDate } from "@/domain/trip/dayReadModel";
import { TicketedActivityContent } from "./TicketedActivityRow";
import { useMinuteClock } from "./useMinuteClock";
import { calendarDate } from "./TripCalendarField";

import { P6ActivityEditor } from "./P6ActivityEditor";
import { useTripView } from "./TripViewContext";

export function P6Detail() {
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
  const [state, setState] = useState<P6DetailState | null>(null);
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
      void loadP6Detail(
        {
          tripId,
          itemId,
          generation,
        },
        {
          read: async (id) => (await readTripDayFeed()).trip(id),
          repository: createDefaultManualActivityRepository,
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
  const clock = useMinuteClock(null);
  const currentDate = calendarDate(new Date(clock.instant));
  const authored = visible?.presentation.facts;
  const today = authored?.start.zone
    ? localCalendarDate(clock.instant, authored.start.zone)
    : currentDate;
  const lastDate = authored?.end?.date ?? authored?.start.date;
  const context = !authored?.start.date
    ? "UNKNOWN"
    : lastDate && lastDate < today
      ? "PAST"
      : authored.start.date > today
        ? "FUTURE"
        : "TODAY";
  const date = params.occurrence === "END" ? authored?.end?.date : authored?.start.date;
  const facts = visible
    ? {
        ...visible.presentation.facts,
        pending: visible.presentation.pending,
        onAddExpense: () =>
          router.push({
            pathname: "/trip-item-expense",
            params: {
              journeyId: tripId,
              returnTo: "source",
              suggestedTitle: visible.presentation.title,
              suggestedDate: date ?? visible.presentation.facts.start.date,
              mode: "manual",
            },
          }),
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
          accessibilityLabel={t("p6.edit")}
          disabled={!visible?.editor}
          onPress={() => setEditing(true)}
        />
      </Stack.Toolbar>
      <NavigationContentFrame>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.root}
          contentContainerStyle={styles.content}
        >
          {visible ? (
            <TicketedActivityContent
              facts={facts!}
              depth="I"
              context={context}
              onDepth={() => {}}
            />
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
        <P6ActivityEditor
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
