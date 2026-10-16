import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { SheetHeader } from "@/components/SheetHeader";
import { UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// Actual read-only Core Item facts; this is not the capability-bearing P3 Immersive.
export function LocalCoreItemPreview({
  item,
  onClose,
}: {
  item: NonNullable<ReturnType<typeof projectCoreItem>>;
  onClose(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const schedule = item.schedule as {
    start?: { localDate?: string; localTime?: string };
    end?: { localDate?: string; localTime?: string };
  };
  const civil = (date: string) =>
    formatUiDate(new Date(`${date}T12:00:00Z`), {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider style={styles.body}>
        <SheetHeader title={item.title as string} onLeft={onClose} />
        <ScrollView style={styles.body} contentContainerStyle={styles.content}>
          <Text style={styles.title}>{item.title as string}</Text>
          {item.localState === "PENDING" ? (
            <Text style={styles.meta}>{t("tripCreate.itemPending")}</Text>
          ) : null}
          {item.family === "P3" ? (
            <Text style={styles.meta}>{t("tripCreate.stay")}</Text>
          ) : item.family === "P1" ? (
            <Text style={styles.meta}>{t("tripCreate.activity")}</Text>
          ) : null}
          {schedule.start?.localDate ? (
            <View>
              <Text style={styles.meta}>
                {t(item.family === "P3" ? "tripCreate.checkin" : "tripCreate.itemDate")}
              </Text>
              <Text style={styles.text}>{civil(schedule.start.localDate)}</Text>
              {schedule.start.localTime ? (
                <Text style={styles.text}>{schedule.start.localTime}</Text>
              ) : null}
            </View>
          ) : null}
          {schedule.end?.localDate ? (
            <View>
              <Text style={styles.meta}>
                {t(item.family === "P3" ? "tripCreate.checkout" : "tripCreate.end")}
              </Text>
              <Text style={styles.text}>{civil(schedule.end.localDate)}</Text>
              {schedule.end.localTime ? (
                <Text style={styles.text}>{schedule.end.localTime}</Text>
              ) : null}
            </View>
          ) : null}
          {typeof item.details.propertyName === "string" ? (
            <Text style={styles.text}>{item.details.propertyName}</Text>
          ) : null}
          {item.place?.authoredLabel ? (
            <Text style={styles.text}>{item.place.authoredLabel}</Text>
          ) : null}
          {item.place?.authoredAddress ? (
            <Text style={styles.text}>{item.place.authoredAddress}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaProvider>
    </Modal>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.card },
    title: { ...visual.type.section, color: colors.textPrimary },
    text: { ...visual.type.row, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
