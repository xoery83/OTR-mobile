import { useDetailCloudRefresh } from "./useDetailCloudRefresh";
import { DayReadSkeleton } from "./DayReadSkeleton";
import { flightAirportTargets, openFlightAirport } from "./flightAirportActions";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { NavigationContentFrame } from "@/components/navigationChrome";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readLocalManualFlightRepository,
  type ManualFlightRead,
} from "@/data/repositories/localManualFlightRepository";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { FlightJourneyView } from "./FlightJourneyView";
import type { ReadParticipation } from "./bookingReadPresentation";

import { flightSegmentFromRead } from "./manualFlightFormFields";
import { ManualFlightEditor } from "./ManualFlightForm";
import { useTripView } from "./TripViewContext";
export function P2Detail() {
  useUiLocale();
  const params = useLocalSearchParams<{ tripId?: string; itemId?: string }>();
  const tripId = typeof params.tripId === "string" ? params.tripId : "";
  const itemId = typeof params.itemId === "string" ? params.itemId : "";
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const [state, setState] = useState<{
    item: ManualFlightRead;
    editable: boolean;
    generation: number;
  } | null>(null);
  const [editing, setEditing] = useState(false),
    [revision, setRevision] = useState(0),
    [failed, setFailed] = useState(false);
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { reportManualOutcome } = useTripView();
  useDetailCloudRefresh(tripId, generation, editing, setRevision);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setState((previous) => (previous ? { ...previous, editable: false } : null));
      setFailed(false);
      setEditing(false);
      void (async () => {
        try {
          const repository = await readLocalManualFlightRepository();
          const item = await repository.readForForm(tripId, itemId);
          if (!active || generation !== getAccountGeneration()) return;
          setState({ item, editable: false, generation });
          let editable = false;
          try {
            await repository.createDraft(tripId, itemId, Number(item.itemRevision));
            editable = true;
          } catch {
            /* Owning repository denies accepted/Source edits; readonly details remain. */
          }
          if (active && generation === getAccountGeneration())
            setState({ item, editable, generation });
        } catch {
          if (active && generation === getAccountGeneration()) {
            setState(null);
            setFailed(true);
          }
        }
      })();
      return () => {
        active = false;
      };
      // Save invalidates the read even while the same native screen remains focused.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tripId, itemId, generation, revision]),
  );
  const visible =
    state?.generation === generation &&
    state.item.tripId === tripId &&
    state.item.itemId === itemId
      ? state
      : null;
  const segment = visible ? flightSegmentFromRead(visible.item) : null;
  const mode = visible?.item.participation.mode;
  const participation: ReadParticipation | undefined =
    visible && (mode === "WHOLE_GROUP" || mode === "SELF" || mode === "SELECTED_MEMBERS")
      ? {
          mode,
          personIds: visible.item.participation.personIds.filter(
            (id): id is string => typeof id === "string",
          ),
        }
      : undefined;
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
          accessibilityLabel={t("manualFlight.editFlight")}
          disabled={!visible?.editable}
          onPress={() => setEditing(true)}
        />
      </Stack.Toolbar>
      <NavigationContentFrame>
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          {visible && segment ? (
            <FlightJourneyView
              single={{
                id: visible.item.itemId,
                flight: { authored: segment },
                ...(flightAirportTargets({ authored: segment })
                  ? {
                      map: () =>
                        openFlightAirport(
                          flightAirportTargets({ authored: segment })!.map,
                        ),
                      navigate: () =>
                        openFlightAirport(
                          flightAirportTargets({ authored: segment })!.navigate,
                        ),
                    }
                  : {}),
                pending: visible.item.localState === "PENDING",
              }}
              facts={{
                participation,
                ...(typeof visible.item.description === "string"
                  ? { note: visible.item.description }
                  : {}),
                addExpense: () =>
                  router.push({
                    pathname: "/trip-item-expense",
                    params: {
                      journeyId: tripId,
                      returnTo: "source",
                      suggestedTitle:
                        typeof visible.item.title === "string"
                          ? visible.item.title
                          : segment.flightNumberLiteral,
                      suggestedDate: segment.departureDate,
                      mode: "manual",
                    },
                  }),
              }}
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
      {editing && visible?.editable ? (
        <ManualFlightEditor
          embedded={false}
          tripId={tripId}
          itemId={itemId}
          expectedRevision={Number(visible.item.itemRevision)}
          initialDate={null}
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
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
