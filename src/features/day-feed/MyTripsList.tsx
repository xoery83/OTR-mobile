import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Trip } from "@/domain/trip/types";
import { UiButton, UiSection } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { tripCoverId, tripCoverSource, builtInTripCoverSource } from "./tripCovers";
import { groupLocalTrips } from "./tripListPresentation";
import { TripCoverVisual } from "./TripCoverVisual";

export type TodayEntry = Readonly<{ date: string; zone: string }>;
type Props = {
  trips: readonly Trip[];
  today: string;
  eligibleToday: Readonly<Record<string, TodayEntry>>;
  onOpen(id: string): void;
  onOpenToday(id: string): void;
  onCreate(): void;
};

const displayDate = (value: string) =>
  formatUiDate(new Date(`${value}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const dateLabel = (trip: Trip) =>
  trip.startDate && trip.endDate
    ? t("myTrips.dateRange", {
        start: displayDate(trip.startDate),
        end: displayDate(trip.endDate),
      })
    : trip.startDate
      ? t("myTrips.starts", { date: displayDate(trip.startDate) })
      : trip.endDate
        ? t("myTrips.ends", { date: displayDate(trip.endDate) })
        : t("myTrips.datesToBeDecided");
const cardLabel = (trip: Trip) =>
  trip.destination
    ? t("myTrips.openTripDetails", {
        name: trip.name,
        date: dateLabel(trip),
        destination: trip.destination,
      })
    : t("myTrips.openTripDated", { name: trip.name, date: dateLabel(trip) });

export function MyTripsList({
  trips,
  today,
  eligibleToday,
  onOpen,
  onOpenToday,
  onCreate,
}: Props) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [allPast, setAllPast] = useState(false);
  const groups = groupLocalTrips(trips, today, new Set(Object.keys(eligibleToday)));
  if (!trips.length)
    return (
      <View style={styles.empty}>
        <TripCoverVisual
          source={builtInTripCoverSource("coast")}
          style={styles.emptyImage}
        />
        <View style={styles.emptyBody}>
          <Text style={styles.emptyTitle}>{t("myTrips.emptyTitle")}</Text>
          <Text style={styles.meta}>{t("myTrips.emptyHint")}</Text>
          <UiButton label={t("myTrips.createFirst")} onPress={onCreate} />
        </View>
      </View>
    );

  const compact = (trip: Trip) => (
    <Pressable
      key={trip.id}
      accessibilityRole="button"
      accessibilityLabel={cardLabel(trip)}
      onPress={() => onOpen(trip.id)}
      style={styles.compact}
    >
      <TripCoverVisual
        key={tripCoverId(trip)}
        source={tripCoverSource(trip)}
        style={styles.thumbnail}
      />
      <View style={styles.compactBody}>
        <Text style={styles.title} numberOfLines={2}>
          {trip.name}
        </Text>
        <Text style={styles.meta}>{dateLabel(trip)}</Text>
        {trip.destination ? (
          <Text style={styles.meta} numberOfLines={1}>
            {trip.destination}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
  return (
    <View style={styles.list}>
      {groups.active.length ? (
        <UiSection title={t("myTrips.active")}>
          {groups.active.map((trip) => (
            <View key={trip.id} style={styles.heroCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={cardLabel(trip)}
                onPress={() => onOpen(trip.id)}
                style={styles.heroBody}
              >
                <TripCoverVisual
                  key={tripCoverId(trip)}
                  source={tripCoverSource(trip)}
                  style={styles.heroImage}
                />
                <View style={styles.heroDetails}>
                  <Text style={styles.title} numberOfLines={2}>
                    {trip.name}
                  </Text>
                  <Text style={styles.meta}>{dateLabel(trip)}</Text>
                  {trip.destination ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {trip.destination}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {eligibleToday[trip.id] ? (
                <View style={styles.heroAction}>
                  <UiButton
                    label={t("myTrips.openToday")}
                    variant="secondary"
                    onPress={() => onOpenToday(trip.id)}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </UiSection>
      ) : null}
      {groups.upcoming.length ? (
        <UiSection title={t("myTrips.upcoming")}>
          {groups.upcoming.map(compact)}
        </UiSection>
      ) : null}
      {groups.undated.length ? (
        <UiSection title={t("myTrips.undated")}>{groups.undated.map(compact)}</UiSection>
      ) : null}
      {groups.past.length ? (
        <UiSection title={t("myTrips.past")}>
          {(allPast ? groups.past : groups.past.slice(0, 3)).map(compact)}
          {!allPast && groups.past.length > 3 ? (
            <UiButton
              label={t("myTrips.seeAllPast")}
              variant="text"
              onPress={() => setAllPast(true)}
            />
          ) : null}
        </UiSection>
      ) : null}
    </View>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    list: { gap: visual.space.section },
    empty: {
      backgroundColor: c.surface,
      borderRadius: visual.radius.hero,
      overflow: "hidden",
    },
    emptyImage: { width: "100%", height: 170 },
    emptyBody: { gap: visual.space.card, padding: visual.space.page },
    emptyTitle: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    title: { ...visual.type.section, color: c.textPrimary },
    compact: {
      minHeight: 88,
      flexDirection: "row",
      gap: visual.space.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: visual.radius.card,
      overflow: "hidden",
    },
    thumbnail: { width: 104, height: 88 },
    compactBody: {
      flex: 1,
      gap: visual.space.heading,
      paddingVertical: visual.space.card,
      paddingRight: visual.space.card,
    },
    heroCard: {
      backgroundColor: c.surface,
      borderRadius: visual.radius.hero,
      overflow: "hidden",
    },
    heroBody: { minHeight: 44 },
    heroImage: { width: "100%", height: 192 },
    heroDetails: { gap: visual.space.heading, padding: visual.space.page },
    heroAction: {
      paddingHorizontal: visual.space.page,
      paddingBottom: visual.space.page,
      alignItems: "flex-start",
    },
  });
