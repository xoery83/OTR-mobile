import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { AppIcon } from "@/components/AppIcon";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { Trip } from "@/domain/trip/types";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import type { TripListSummary } from "@/data/repositories/tripDiscoveryRepository";
import { UiButton, UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { tripCoverId, tripCoverSource, builtInTripCoverSource } from "./tripCovers";
import { groupLocalTrips } from "./tripListPresentation";
import { TripCoverVisual } from "./TripCoverVisual";

export type TodayEntry = Readonly<{ date: string; zone: string }>;
type Props = {
  pastOnly?: boolean;
  trips: readonly Trip[];
  remoteTrips: readonly TripListSummary[];
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
const knownDate = (value: string | null) => {
  if (!value) return null;
  try {
    return validateCalendarDate(value);
  } catch {
    return null;
  }
};
const dateLabel = (
  trip: Readonly<{ startDate: string | null; endDate: string | null }>,
) => {
  const start = knownDate(trip.startDate),
    end = knownDate(trip.endDate);
  return start && end
    ? t("myTrips.dateRange", {
        start: displayDate(start),
        end: displayDate(end),
      })
    : start
      ? t("myTrips.starts", { date: displayDate(start) })
      : end
        ? t("myTrips.ends", { date: displayDate(end) })
        : t("myTrips.datesToBeDecided");
};
type ListedTrip = Trip | TripListSummary;
const cardLabel = (trip: ListedTrip) =>
  trip.destination
    ? t("myTrips.openTripDetails", {
        name: trip.name,
        date: dateLabel(trip),
        destination: trip.destination,
      })
    : t("myTrips.openTripDated", { name: trip.name, date: dateLabel(trip) });

export function MyTripsList({
  pastOnly = false,
  trips,
  remoteTrips,
  today,
  eligibleToday,
  onOpen,
  onOpenToday,
  onCreate,
}: Props) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const insets = useSafeAreaInsets();
  const localIds = new Set(trips.map((trip) => trip.id));
  const groups = groupLocalTrips<ListedTrip>(
    [...trips, ...remoteTrips],
    today,
    new Set(Object.keys(eligibleToday).filter((id) => localIds.has(id))),
  );
  if (!pastOnly && !trips.length && !remoteTrips.length)
    return (
      <View style={styles.empty}>
        <TripCoverVisual
          source={builtInTripCoverSource("coast")}
          style={styles.emptyImage}
        />
        <View style={styles.emptyBody}>
          <Text style={styles.emptyTitle}>{t("myTrips.emptyTitle")}</Text>
          <Text style={styles.meta}>{t("myTrips.emptyHint")}</Text>
          <UiButton
            label={t("actionIsland.importPlans")}
            onPress={() => router.navigate("/capture")}
          />
          <UiButton
            label={t("actionIsland.createManually")}
            variant="secondary"
            onPress={onCreate}
          />
        </View>
      </View>
    );

  const compact = (trip: ListedTrip) => (
    <Pressable
      key={trip.id}
      accessibilityRole="button"
      accessibilityLabel={cardLabel(trip)}
      accessibilityHint={!localIds.has(trip.id) ? t("myTrips.cachedDetails") : undefined}
      onPress={() => onOpen(trip.id)}
      style={styles.compact}
    >
      <TripCoverVisual
        key={tripCoverId(trip)}
        tripId={trip.id}
        rawSelection={trip.selectedCoverAssetIdRaw}
        source={tripCoverSource(trip)}
        assetId={tripCoverId(trip)}
        style={styles.thumbnail}
      />
      <View style={styles.compactBody}>
        <Text style={styles.title} numberOfLines={2}>
          {trip.name}
        </Text>
        <Text style={styles.date} numberOfLines={1}>
          {localIds.has(trip.id)
            ? dateLabel(trip)
            : t("myTrips.cachedDateSummary", { date: dateLabel(trip) })}
        </Text>
        {trip.destination ? (
          <Text style={styles.meta} numberOfLines={1}>
            {trip.destination}
          </Text>
        ) : null}
      </View>
      <View style={styles.chevron} accessible={false}>
        <AppIcon name="chevron.right" color={colors.textSecondary} size={16} />
      </View>
    </Pressable>
  );
  if (pastOnly)
    return (
      <FlatList
        style={styles.pastRoot}
        contentContainerStyle={[
          styles.pastContent,
          { paddingBottom: insets.bottom + visual.space.page },
        ]}
        data={groups.past}
        keyExtractor={(trip) => trip.id}
        renderItem={({ item }) => compact(item)}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={<Text style={styles.meta}>{t("myTrips.noPast")}</Text>}
      />
    );
  return (
    <View style={styles.list}>
      {groups.active.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionHeading}>
            {t("myTrips.active")}
          </Text>
          <View style={styles.groupContent}>
            {groups.active.map((trip) => (
              <TripCoverVisual
                key={`${trip.id}:${tripCoverId(trip)}`}
                tripId={trip.id}
                rawSelection={trip.selectedCoverAssetIdRaw}
                source={tripCoverSource(trip)}
                assetId={tripCoverId(trip)}
                style={styles.heroImage}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={cardLabel(trip)}
                  onPress={() => onOpen(trip.id)}
                  style={styles.heroDetails}
                >
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {trip.name}
                  </Text>
                  <Text style={styles.heroDate}>{dateLabel(trip)}</Text>
                  {trip.destination ? (
                    <Text style={styles.heroMeta} numberOfLines={1}>
                      {trip.destination}
                    </Text>
                  ) : null}
                  {!localIds.has(trip.id) ? (
                    <Text style={styles.heroMeta}>{t("myTrips.cachedDetails")}</Text>
                  ) : null}
                </Pressable>
                {localIds.has(trip.id) && eligibleToday[trip.id] ? (
                  <View style={styles.heroAction}>
                    <UiButton
                      label={t("myTrips.openToday")}
                      variant="secondary"
                      onPress={() => onOpenToday(trip.id)}
                    />
                  </View>
                ) : null}
              </TripCoverVisual>
            ))}
          </View>
        </View>
      ) : null}
      {groups.upcoming.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionHeading}>
            {t("myTrips.upcoming")}
          </Text>
          <View style={styles.groupContent}>{groups.upcoming.map(compact)}</View>
        </View>
      ) : null}
      {groups.undated.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionHeading}>
            {t("myTrips.undated")}
          </Text>
          <View style={styles.groupContent}>{groups.undated.map(compact)}</View>
        </View>
      ) : null}
      {groups.past.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionHeading}>
            {t("myTrips.past")}
          </Text>
          <View style={styles.groupContent}>
            {groups.past.slice(0, 3).map(compact)}
            {groups.past.length > 3 ? (
              <UiButton
                label={t("myTrips.seeAllPastCount", { count: groups.past.length })}
                variant="text"
                onPress={() => router.push("/past-trips")}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    pastRoot: { flex: 1, backgroundColor: c.background },
    pastContent: { padding: visual.space.page },
    rowGap: { height: visual.space.card },
    list: { gap: visual.space.section },
    section: { gap: visual.space.heading },
    sectionHeading: { ...visual.type.tripSectionLabel, color: c.textSecondary },
    groupContent: { gap: visual.space.card },
    empty: {
      backgroundColor: c.surface,
      borderRadius: visual.radius.hero,
      overflow: "hidden",
    },
    emptyImage: { width: "100%", height: 170 },
    emptyBody: { gap: visual.space.card, padding: visual.space.page },
    emptyTitle: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    date: { ...visual.type.tripDate, color: c.textSecondary },
    title: { ...visual.type.tripRowTitle, color: c.textPrimary },
    compact: {
      minHeight: 88,
      flexDirection: "row",
      gap: visual.space.card,
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: visual.radius.card,
      overflow: "hidden",
    },
    thumbnail: { width: 88, alignSelf: "stretch" },
    chevron: { paddingRight: visual.space.card },
    compactBody: {
      flex: 1,
      minWidth: 0,
      gap: visual.space.heading / 2,
      paddingVertical: visual.space.card,
    },
    heroImage: { width: "100%", minHeight: 240, borderRadius: visual.radius.hero },
    heroDetails: {
      flexGrow: 1,
      minHeight: 240,
      justifyContent: "flex-end",
      gap: visual.space.heading / 2,
      padding: visual.space.page,
      paddingTop: 96,
    },
    heroTitle: {
      ...visual.type.tripHeroTitle,
      color: c.mediaText,
      textShadowColor: c.mediaBackground,
      textShadowRadius: 4,
      textShadowOffset: { width: 0, height: 1 },
    },
    heroDate: {
      ...visual.type.tripDate,
      color: c.mediaText,
    },
    heroMeta: {
      ...visual.type.meta,
      color: c.mediaText,
      opacity: 0.85,
      textShadowColor: c.mediaBackground,
      textShadowRadius: 4,
      textShadowOffset: { width: 0, height: 1 },
    },
    heroAction: {
      paddingHorizontal: visual.space.page,
      paddingBottom: visual.space.page,
      alignItems: "flex-start",
    },
  });
