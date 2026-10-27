import { PendingSyncDot } from "./PendingSyncDot";
import { FlightFidelityGrid } from "./FlightFidelityGrid";
import { flightSegmentFromRead } from "./manualFlightFormFields";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// Actual read-only Core Item facts; this is not the capability-bearing P3 Immersive.
export function LocalCoreItemPreview({
  item,
  onClose,
  onEdit,
  editError = false,
}: {
  item: NonNullable<ReturnType<typeof projectCoreItem>>;
  onClose(): void;
  onEdit?(): void;
  editError?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const schedule = item.schedule as {
    start?: { localDate?: string; localTime?: string };
    end?: { localDate?: string; localTime?: string };
    origin?: {
      time?: { localDate?: string; localTime?: string };
      place?: { authoredLabel?: string };
    };
    destination?: {
      time?: { localDate?: string; localTime?: string };
      place?: { authoredLabel?: string };
    };
  };
  const origin = item.family === "P5" ? schedule.origin : undefined;
  const destination = item.family === "P5" ? schedule.destination : undefined;
  const pickupPlace = item.details.pickupPlace as { authoredLabel?: string } | undefined;
  const returnPlace = item.details.returnPlace as { authoredLabel?: string } | undefined;
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.body}
          contentContainerStyle={styles.content}
        >
          {item.family === "P2" ? (
            <FlightFidelityGrid
              flight={{ authored: flightSegmentFromRead(item) }}
              immersive
              pending={item.localState === "PENDING"}
            />
          ) : (
            <Text style={styles.title}>
              {item.title as string}
              {item.localState === "PENDING" ? <PendingSyncDot /> : null}
            </Text>
          )}
          {item.family === "P3" ? (
            <Text style={styles.meta}>{t("tripCreate.stay")}</Text>
          ) : item.family === "P4" ? (
            <Text style={styles.meta}>{t("tripCreate.rental")}</Text>
          ) : item.family === "P1" ? (
            <Text style={styles.meta}>{t("tripCreate.activity")}</Text>
          ) : item.family === "P5" ? (
            <Text style={styles.meta}>{t("tripCreate.transport")}</Text>
          ) : null}
          {item.family === "P5" ? (
            <>
              <Text style={styles.meta}>{t("tripCreate.departureDate")}</Text>
              {origin?.time?.localDate ? (
                <Text style={styles.text}>{civil(origin.time.localDate)}</Text>
              ) : null}
              {origin?.time?.localTime ? (
                <Text style={styles.text}>{origin.time.localTime}</Text>
              ) : null}
              {origin?.place?.authoredLabel ? (
                <Text style={styles.text}>{origin.place.authoredLabel}</Text>
              ) : null}
              {destination?.time?.localDate ||
              destination?.time?.localTime ||
              destination?.place?.authoredLabel ? (
                <>
                  <Text style={styles.meta}>{t("tripCreate.arrivalDate")}</Text>
                  {destination.time?.localDate ? (
                    <Text style={styles.text}>{civil(destination.time.localDate)}</Text>
                  ) : null}
                  {destination.time?.localTime ? (
                    <Text style={styles.text}>{destination.time.localTime}</Text>
                  ) : null}
                  {destination.place?.authoredLabel ? (
                    <Text style={styles.text}>{destination.place.authoredLabel}</Text>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {schedule.start?.localDate ? (
            <View>
              <Text style={styles.meta}>
                {t(
                  item.family === "P4"
                    ? "tripCreate.rentalPickupDate"
                    : item.family === "P3"
                      ? "tripCreate.checkin"
                      : "tripCreate.itemDate",
                )}
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
                {t(
                  item.family === "P4"
                    ? "tripCreate.rentalReturnDate"
                    : item.family === "P3"
                      ? "tripCreate.checkout"
                      : "tripCreate.end",
                )}
              </Text>
              <Text style={styles.text}>{civil(schedule.end.localDate)}</Text>
              {schedule.end.localTime ? (
                <Text style={styles.text}>{schedule.end.localTime}</Text>
              ) : null}
            </View>
          ) : null}
          {item.family === "P3" &&
          typeof item.details.propertyName === "string" &&
          item.details.propertyName.trim() &&
          item.details.propertyName !== item.title ? (
            <View>
              <Text style={styles.meta}>{t("tripCreate.stayPropertyName")}</Text>
              <Text style={styles.text}>{item.details.propertyName}</Text>
            </View>
          ) : null}
          {item.family === "P3" &&
          typeof item.details.permittedCheckinFrom === "string" ? (
            <Text style={styles.text}>
              {t("tripCreate.stayArrivalFrom")}: {item.details.permittedCheckinFrom}
            </Text>
          ) : null}
          {item.family === "P3" &&
          typeof item.details.permittedCheckinUntil === "string" ? (
            <Text style={styles.text}>
              {t("tripCreate.stayArrivalUntil")}: {item.details.permittedCheckinUntil}
            </Text>
          ) : null}
          {item.family === "P3" &&
          typeof item.details.permittedCheckoutBy === "string" ? (
            <Text style={styles.text}>
              {t("tripCreate.stayCheckoutBy")}: {item.details.permittedCheckoutBy}
            </Text>
          ) : null}
          {item.place?.authoredLabel ? (
            <Text style={styles.text}>{item.place.authoredLabel}</Text>
          ) : null}
          {item.place?.authoredAddress ? (
            <Text style={styles.text}>{item.place.authoredAddress}</Text>
          ) : null}
          {item.family === "P4" ? (
            <>
              {typeof item.details.actualVehicleModel === "string" ? (
                <Text style={styles.text}>{item.details.actualVehicleModel}</Text>
              ) : null}
              {typeof item.details.verifiedPlate === "string" ? (
                <Text style={styles.text}>{item.details.verifiedPlate}</Text>
              ) : null}
              {typeof pickupPlace?.authoredLabel === "string" ? (
                <Text style={styles.text}>
                  {t("tripCreate.rentalPickupPlace")}: {pickupPlace.authoredLabel}
                </Text>
              ) : null}
              {typeof returnPlace?.authoredLabel === "string" ? (
                <Text style={styles.text}>
                  {t("tripCreate.rentalReturnPlace")}: {returnPlace.authoredLabel}
                </Text>
              ) : null}
            </>
          ) : null}
          {(item.family === "P1" ||
            item.family === "P3" ||
            item.family === "P4" ||
            item.family === "P5") &&
          typeof item.description === "string" &&
          item.description.trim() ? (
            <View>
              <Text style={styles.meta}>
                {t(
                  item.family === "P4"
                    ? "tripCreate.rentalNotes"
                    : item.family === "P5"
                      ? "tripCreate.transportNotes"
                      : item.family === "P3"
                        ? "tripCreate.stayNotes"
                        : "tripCreate.planNotes",
                )}
              </Text>
              <Text style={styles.text}>{item.description}</Text>
            </View>
          ) : null}
          {onEdit ? (
            <UiButton
              label={t(
                item.family === "P2"
                  ? "manualFlight.editFlight"
                  : item.family === "P4"
                    ? "tripCreate.editRental"
                    : item.family === "P5"
                      ? "tripCreate.editTransport"
                      : item.family === "P3"
                        ? "tripCreate.editStay"
                        : "tripCreate.editPlan",
              )}
              onPress={onEdit}
            />
          ) : null}
          {editError ? (
            <Text accessibilityRole="alert" style={styles.meta}>
              {t(
                item.family === "P4"
                  ? "tripCreate.rentalUnavailable"
                  : item.family === "P5"
                    ? "tripCreate.transportUnavailable"
                    : item.family === "P3"
                      ? "tripCreate.stayUnavailable"
                      : "tripCreate.planUnavailable",
              )}
            </Text>
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
