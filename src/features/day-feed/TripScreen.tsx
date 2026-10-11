import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readTripDayFeed,
  type createTripDayFeedReader,
} from "@/data/repositories/tripDayFeedRepository";
import { UiButton } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { boundaryZone, viewContext } from "./presentation";
import { DayFeed } from "./DayFeed";
import { useTripView } from "./TripViewContext";
type Reader = ReturnType<typeof createTripDayFeedReader>;
type TripRead = Awaited<ReturnType<Reader["trip"]>>;
type Candidates = Awaited<ReturnType<Reader["candidates"]>>;
const value = (p: string | string[] | undefined) => (typeof p === "string" ? p : "");

export function TripScreen({ today = false }: { today?: boolean }) {
  const params = useLocalSearchParams();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { view } = useTripView();
  return (
    <TripContent
      key={JSON.stringify([generation, today ? view : params])}
      today={today}
    />
  );
}
function TripContent({ today = false }: { today?: boolean }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { view, select } = useTripView();
  const params = useLocalSearchParams<{
    tripId?: string;
    date?: string;
    zone?: string;
    view?: string;
  }>();
  const [key, setKey] = useState(value(params.tripId));
  const [date, setDate] = useState(value(params.date));
  const [zone, setZone] = useState(value(params.zone));
  const [trip, setTrip] = useState<TripRead | null>(null);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [status, setStatus] = useState<"LOADING" | "UNAVAILABLE" | "READY">("LOADING");
  const [contextError, setContextError] = useState(false);
  const home = params.view !== "day";
  const request = useRef(0);
  const requested = today ? (view?.tripId ?? "") : value(params.tripId);
  const visibleTrip =
    trip?.scope.generation === generation &&
    trip.observed?.projection.tripId === requested
      ? trip
      : null;
  const visibleCandidates =
    candidates?.scope.generation === generation ? candidates.candidates : [];
  const load = useCallback(async () => {
    const captured = getAccountGeneration(),
      ticket = ++request.current;
    await Promise.resolve();
    setStatus("LOADING");
    try {
      const reader = await readTripDayFeed();
      if (requested) {
        const result = await reader.trip(requested);
        if (getAccountGeneration() !== captured || ticket !== request.current) return;
        setTrip(result);
        setStatus(result.observed ? "READY" : "UNAVAILABLE");
        if (!today && result.observed)
          setZone(
            (previous) => previous || boundaryZone(result.observed!.projection) || "",
          );
      } else if (!today) {
        const result = await reader.candidates();
        if (getAccountGeneration() !== captured || ticket !== request.current) return;
        setCandidates(result);
        setStatus("READY");
      } else setStatus("READY");
    } catch {
      if (getAccountGeneration() === captured && ticket === request.current) {
        setTrip(null);
        setCandidates(null);
        setStatus("UNAVAILABLE");
      }
    }
  }, [requested, today]);
  useEffect(() => {
    void Promise.resolve().then(load);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      request.current += 1;
      sub.remove();
    };
  }, [load, generation]);
  const open = (id: string) => {
    select(null);
    router.setParams({ tripId: id.trim(), date: "", zone: "", view: "home" });
  };
  const enterDay = () => {
    try {
      const context = viewContext(date, zone);
      if (!visibleTrip?.observed) return;
      select({ tripId: requested, ...context, generation });
      router.setParams({ tripId: requested, ...context, view: "day" });
      setContextError(false);
    } catch {
      setContextError(true);
    }
  };
  const selected = today ? view : !home && view?.tripId === requested ? view : null;
  if (visibleTrip?.observed && selected)
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.heading}>{selected.date}</Text>
          <Text style={styles.meta}>{selected.zone}</Text>
          {visibleTrip.observed.sourceStatus === "HISTORICAL_ACCEPTED_PROJECTION" ? (
            <Text style={styles.meta}>{t("dayFeed.historical")}</Text>
          ) : null}
          <UiButton
            label={t("dayFeed.tripHome")}
            variant="text"
            onPress={() =>
              today
                ? router.navigate({
                    pathname: "/trip",
                    params: {
                      tripId: selected.tripId,
                      date: selected.date,
                      zone: selected.zone,
                      view: "home",
                    },
                  })
                : router.setParams({ view: "home" })
            }
          />
        </View>
        <DayFeed
          key={`${requested}/${selected.date}/${selected.zone}/${generation}`}
          projection={visibleTrip.observed.projection}
          date={selected.date}
          zone={selected.zone}
          services={visibleTrip.services}
        />
      </View>
    );
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>
        {t(
          today
            ? "navigation.today"
            : visibleTrip?.observed
              ? "dayFeed.tripHome"
              : "dayFeed.myTrips",
        )}
      </Text>
      {status === "LOADING" ? (
        <Text style={styles.meta}>{t("dayFeed.loading")}</Text>
      ) : null}
      {status === "UNAVAILABLE" ? (
        <Text style={styles.meta}>{t("dayFeed.unavailable")}</Text>
      ) : null}
      {today ? (
        <>
          <Text style={styles.meta}>{t("dayFeed.todayContext")}</Text>
          <UiButton
            label={t("dayFeed.myTrips")}
            onPress={() => router.navigate("/trip")}
          />
        </>
      ) : (
        <>
          {visibleTrip?.observed ? (
            <>
              <Text style={styles.meta}>{t("dayFeed.admitted", { id: requested })}</Text>
              {visibleTrip.observed.sourceStatus === "HISTORICAL_ACCEPTED_PROJECTION" ? (
                <Text style={styles.meta}>{t("dayFeed.historical")}</Text>
              ) : null}
              <Text style={styles.meta}>{t("dayFeed.date")}</Text>
              <UiTextInput
                accessibilityLabel={t("dayFeed.date")}
                value={date}
                onChangeText={setDate}
                autoCapitalize="none"
              />
              <Text style={styles.meta}>{t("dayFeed.zone")}</Text>
              <UiTextInput
                accessibilityLabel={t("dayFeed.zone")}
                value={zone}
                onChangeText={setZone}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.meta}>{t("dayFeed.contextHint")}</Text>
              {contextError ? (
                <Text accessibilityRole="alert" style={styles.meta}>
                  {t("dayFeed.contextInvalid")}
                </Text>
              ) : null}
              <UiButton label={t("dayFeed.openDay")} onPress={enterDay} />
              <UiButton
                label={t("dayFeed.myTrips")}
                variant="text"
                onPress={() => {
                  select(null);
                  router.setParams({ tripId: "", date: "", zone: "", view: "" });
                }}
              />
            </>
          ) : (
            <>
              <Text style={styles.meta}>{t("dayFeed.partial")}</Text>
              {status === "READY" && !visibleCandidates.length ? (
                <Text style={styles.meta}>{t("dayFeed.noCandidates")}</Text>
              ) : null}
              {visibleCandidates.map((c) => (
                <UiButton
                  key={c.journeyId}
                  label={c.title}
                  variant="secondary"
                  onPress={() => open(c.journeyId)}
                />
              ))}
              <Text style={styles.meta}>{t("dayFeed.explicitId")}</Text>
              <UiTextInput
                accessibilityLabel={t("dayFeed.explicitId")}
                value={key}
                onChangeText={setKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <UiButton
                label={t("dayFeed.lookup")}
                onPress={() => open(key)}
                disabled={!key.trim()}
              />
            </>
          )}
        </>
      )}
      <UiButton
        label={t("capture.activityRefresh")}
        variant="text"
        onPress={() => {
          void load();
        }}
      />
      <UiButton
        label={t("navigation.capture")}
        variant="text"
        onPress={() => router.navigate("/capture")}
      />
      <UiButton
        label={t("navigation.ledger")}
        variant="text"
        onPress={() => router.navigate("/expenses")}
      />
      <UiButton
        label={t("dayFeed.validation")}
        variant="text"
        onPress={() => router.push("/trip-validation")}
      />
    </ScrollView>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.heading },
    header: { paddingHorizontal: visual.space.page, paddingTop: visual.space.heading },
    heading: { ...visual.type.metric, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
