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
import { createDefaultManualRentalRepository } from "@/data/repositories/manualRentalRepository";
import { loadP4Detail, type P4DetailState } from "./p4DetailRead";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { rentalTemporalContext } from "./rentalReadPresentation";
import { RentalContent } from "./RentalRow";
import { useMinuteClock } from "./useMinuteClock";
import { calendarDate } from "./TripCalendarField";

import { P4RentalEditor } from "./P4RentalEditor";
import { useTripView } from "./TripViewContext";

export function P4Detail() {
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
  const [state, setState] = useState<P4DetailState | null>(null);
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
      void loadP4Detail(
        {
          tripId,
          itemId,
          generation,
          occurrence: params.occurrence === "RETURN" ? "RETURN" : "PICKUP",
        },
        {
          read: async (id) => (await readTripDayFeed()).trip(id),
          repository: createDefaultManualRentalRepository,
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
  const role = params.occurrence === "RETURN" ? "RETURN" : "PICKUP";
  const date =
    role === "RETURN"
      ? visible?.presentation.facts.return?.date
      : visible?.presentation.facts.pickup.date;
  const context = visible
    ? rentalTemporalContext(visible.presentation.facts, role, clock.instant, currentDate)
    : "UNKNOWN";
  const facts = visible
    ? {
        ...visible.presentation.facts,
        onAddExpense: () =>
          router.push({
            pathname: "/expenses/new",
            params: {
              journeyId: tripId,
              suggestedTitle: visible.presentation.title,
              suggestedDate: date ?? visible.presentation.facts.pickup.date,
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
          accessibilityLabel={t("tripCreate.editRental")}
          disabled={!visible?.editor}
          onPress={() => setEditing(true)}
        />
      </Stack.Toolbar>
      <NavigationContentFrame>
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          {visible ? (
            <RentalContent
              title={visible.presentation.title}
              pickup={role === "PICKUP"}
              back={role === "RETURN"}
              facts={facts!}
              pending={visible.presentation.pending}
              note={visible.presentation.note}
              nativeNavigation
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
        <P4RentalEditor
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
