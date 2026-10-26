import { useCallback, useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { NavigationContentFrame } from "@/components/navigationChrome";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import { createDefaultManualPlanRepository } from "@/data/repositories/manualPlanRepository";
import { loadP1Detail, type P1DetailState } from "./p1DetailRead";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { P1Row } from "./P1Row";
import { P1PlanEditor } from "./P1PlanEditor";
import { useTripView } from "./TripViewContext";

export function P1Detail() {
  useUiLocale();
  const params = useLocalSearchParams<{
    tripId?: string;
    itemId?: string;
    occurrence?: string;
  }>();
  const tripId = typeof params.tripId === "string" ? params.tripId : "";
  const itemId = typeof params.itemId === "string" ? params.itemId : "";
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { reportManualOutcome } = useTripView();
  const [state, setState] = useState<P1DetailState | null>(null);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setState(null);
      setFailed(false);
      setEditing(false);
      void loadP1Detail(
        {
          tripId,
          itemId,
          generation,
          occurrence: params.occurrence === "END" ? "END" : "START",
        },
        {
          read: async (id) => (await readTripDayFeed()).trip(id),
          repository: createDefaultManualPlanRepository,
          generation: getAccountGeneration,
        },
      )
        .then((next) => {
          if (active && next) setState(next);
        })
        .catch(() => {
          if (active && generation === getAccountGeneration()) setFailed(true);
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
          accessibilityLabel={t("tripCreate.editPlan")}
          disabled={!visible?.editor}
          onPress={() => setEditing(true)}
        />
      </Stack.Toolbar>
      <NavigationContentFrame>
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          {visible ? (
            <P1Row
              {...visible.presentation}
              actions={{
                addExpense: () =>
                  router.push({
                    pathname: "/expenses/new",
                    params: {
                      journeyId: tripId,
                      suggestedTitle: visible.presentation.display.title,
                      suggestedDate:
                        visible.presentation.display.clocks.start?.local_date ??
                        undefined,
                      mode: "manual",
                    },
                  }),
              }}
              depth="I"
              showHeader={false}
              onDepth={() => router.back()}
            />
          ) : (
            <UiText style={styles.meta}>
              {t(failed ? "dayFeed.unavailable" : "dayFeed.loading")}
            </UiText>
          )}
        </ScrollView>
      </NavigationContentFrame>
      {editing && visible?.editor ? (
        <P1PlanEditor
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
    content: { paddingBottom: visual.space.section },
    meta: {
      ...visual.type.meta,
      color: colors.textSecondary,
      padding: visual.space.page,
    },
  });
