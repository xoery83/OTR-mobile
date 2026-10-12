import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { DayFeed } from "@/features/day-feed/DayFeed";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton } from "@/ui/controls";
import { UiChoiceChip, UiFormRow } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { getFixtureCatalog, selectLabContext } from "./fixtureCatalog";

// The selector formats a calendar key without shifting it to the device timezone.
const dateLabel = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function DayFeedLabScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const fixtureCatalog = getFixtureCatalog();
  const [context, setContext] = useState(() => selectLabContext(fixtureCatalog[0].id));
  const [choosing, setChoosing] = useState(false);
  const { trip, date } = selectLabContext(context.trip.id, context.date, fixtureCatalog);
  const index = trip.dates.indexOf(date);
  const selectDate = (value: string) => setContext(selectLabContext(trip.id, value));
  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <UiFormRow
          label={t("dayLab.trip")}
          value={trip.title}
          onPress={() => setChoosing(true)}
        />
        <View style={styles.navigation}>
          <UiButton
            label={t("dayLab.previous")}
            variant="text"
            disabled={index === 0}
            onPress={() => selectDate(trip.dates[index - 1])}
          />
          <ScrollView
            horizontal
            style={styles.dateStrip}
            contentContainerStyle={styles.dates}
          >
            {trip.dates.map((value) => (
              <UiChoiceChip
                key={value}
                label={dateLabel(value)}
                selected={date === value}
                onPress={() => selectDate(value)}
              />
            ))}
          </ScrollView>
          <UiButton
            label={t("dayLab.next")}
            variant="text"
            disabled={index === trip.dates.length - 1}
            onPress={() => selectDate(trip.dates[index + 1])}
          />
        </View>
        <Text style={styles.meta}>
          {t("dayLab.diagnostics", {
            id: trip.id,
            date,
            version: trip.projection.version,
            instant: trip.instant,
          })}
        </Text>
        <Text style={styles.meta}>{t("dayLab.deferred")}</Text>
      </View>
      <DayFeed
        key={`${trip.id}/${date}`}
        projection={trip.projection}
        services={trip.services}
        date={date}
        zone={trip.zone}
        instant={trip.instant}
      />
      <Modal
        visible={choosing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setChoosing(false)}
      >
        <View style={styles.root}>
          <SheetHeader title={t("dayLab.trip")} onLeft={() => setChoosing(false)} />
          <ScrollView contentContainerStyle={styles.controls}>
            {fixtureCatalog.map((entry) => (
              <UiChoiceChip
                key={entry.id}
                label={entry.title}
                selected={entry.id === trip.id}
                onPress={() => {
                  setContext(selectLabContext(entry.id));
                  setChoosing(false);
                }}
              />
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    controls: { padding: visual.space.page, gap: visual.space.heading },
    navigation: { flexDirection: "row", alignItems: "center" },
    dateStrip: { flex: 1 },
    dates: { gap: visual.space.heading, alignItems: "center" },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
