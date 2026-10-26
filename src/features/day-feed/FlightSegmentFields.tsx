import { useState } from "react";
import {
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { UiDatePicker, UiFormRow, UiTextInput } from "@/ui/forms";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { CalendarField } from "./TripCalendarField";
import { selectedAirportZone } from "./airportSuggestions";
import { FlightAirportField } from "./FlightAirportField";
import { PlanParticipantsField } from "./PlanParticipantsField";
import {
  flightNextDate,
  suggestedFlightArrivalDate,
  type FlightSegmentDraft,
} from "./manualFlightFormFields";
function FlightTimeField({
  label,
  value,
  date,
  disabled,
  onChange,
  onEditingChange,
}: {
  label: string;
  value: string;
  date: string;
  disabled: boolean;
  onChange(date: string, time: string): void;
  onEditingChange(open: boolean): void;
}) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(new Date());
  const close = () => {
    setOpen(false);
    onEditingChange(false);
  };
  return (
    <View style={styles.cell}>
      <UiFormRow
        variant="field"
        label={label}
        value={value || t("tripCreate.notSet")}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          const initial = new Date(
            `${date || new Date().toISOString().slice(0, 10)}T${value || "12:00"}:00Z`,
          );
          setSelected(initial);
          onEditingChange(true);
          setOpen(true);
        }}
      />
      {date ? (
        <UiText style={styles.meta}>
          {formatUiDate(new Date(date + "T12:00:00Z"), {
            dateStyle: "medium",
            timeZone: "UTC",
          })}
        </UiText>
      ) : null}
      <Modal
        transparent
        visible={open}
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={close}
      >
        <SafeAreaProvider style={styles.host}>
          <View style={styles.backdrop}>
            <SafeAreaView edges={["bottom", "left", "right"]} style={styles.sheet}>
              <SheetHeader
                category="picker"
                safeTop={false}
                title={label}
                onLeft={close}
                onRight={() => {
                  onChange(
                    selected.toISOString().slice(0, 10),
                    selected.toISOString().slice(11, 16),
                  );
                  close();
                }}
                rightDisabled={disabled}
              />
              <ScrollView keyboardShouldPersistTaps="handled">
                <UiDatePicker
                  mode="datetime"
                  display="spinner"
                  timeZoneName="UTC"
                  value={selected}
                  accessibilityLabel={label}
                  onChange={(_, next) => {
                    if (next) setSelected(next);
                  }}
                />
                <UiButton
                  variant="text"
                  label={t("tripCreate.clearTime")}
                  disabled={disabled}
                  onPress={() => {
                    onChange(date, "");
                    close();
                  }}
                />
              </ScrollView>
            </SafeAreaView>
          </View>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
export function FlightSegmentFields({
  value,
  full,
  disabled,
  participantOptions,
  initialNavigationDate,
  onPickerChange,
  onChange,
}: {
  value: FlightSegmentDraft;
  full: boolean;
  disabled: boolean;
  participantOptions: readonly { personId: string; displayName: string }[];
  initialNavigationDate?: string | null;
  onChange(changes: Partial<FlightSegmentDraft>): void;
  onPickerChange(field: string, open: boolean): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const [automaticArrival, setAutomaticArrival] = useState(!value.arrivalDate);
  const arrivalDate = value.arrivalDate || value.departureDate;
  const nextDay =
    !!value.departureDate && arrivalDate === flightNextDate(value.departureDate);
  const changeDeparture = (departureDate: string, departureTime = value.departureTime) =>
    onChange({
      departureDate,
      departureTime,
      ...(automaticArrival && value.arrivalTime
        ? {
            arrivalDate: suggestedFlightArrivalDate(
              departureDate,
              departureTime,
              value.arrivalTime,
            ),
          }
        : {}),
    });
  const text = (
    field:
      | "flightNumberLiteral"
      | "originCode"
      | "originName"
      | "departureZone"
      | "destinationCode"
      | "destinationName"
      | "arrivalZone",
    label: string,
    capitals = false,
  ) => (
    <View>
      <UiText style={styles.caption}>{label}</UiText>
      <UiTextInput
        accessibilityLabel={label}
        placeholder={label}
        value={value[field]}
        maxLength={255}
        autoCapitalize={capitals ? "characters" : "none"}
        autoCorrect={false}
        editable={!disabled}
        onChangeText={(next) => onChange({ [field]: next })}
      />
    </View>
  );
  return (
    <View style={styles.fields}>
      {text("flightNumberLiteral", t("manualFlight.number"), true)}
      <CalendarField
        variant="field"
        label={t("manualFlight.departureDate")}
        onEditingChange={(open) => onPickerChange("departureDate", open)}
        value={value.departureDate}
        initialNavigationDate={initialNavigationDate}
        disabled={disabled}
        onChange={(departureDate) => changeDeparture(departureDate)}
      />
      {full ? (
        <>
          <FlightAirportField
            label={t("manualFlight.originAirport")}
            code={value.originCode}
            name={value.originName}
            disabled={disabled}
            onChange={({ code, name, zone }) =>
              onChange({ originCode: code, originName: name, departureZone: zone ?? "" })
            }
          />
          <FlightAirportField
            label={t("manualFlight.destinationAirport")}
            code={value.destinationCode}
            name={value.destinationName}
            disabled={disabled}
            onChange={({ code, name, zone }) =>
              onChange({
                destinationCode: code,
                destinationName: name,
                arrivalZone: zone ?? "",
              })
            }
          />
          {(value.originCode || value.originName) &&
          !selectedAirportZone(value.originCode, value.originName)
            ? text("departureZone", t("manualFlight.departureZone"))
            : null}
          {(value.destinationCode || value.destinationName) &&
          !selectedAirportZone(value.destinationCode, value.destinationName)
            ? text("arrivalZone", t("manualFlight.arrivalZone"))
            : null}
          <View style={[styles.times, fontScale > 1.5 && styles.stacked]}>
            <FlightTimeField
              label={t("manualFlight.departureLocal")}
              date={value.departureDate}
              value={value.departureTime}
              disabled={disabled}
              onEditingChange={(open) => onPickerChange("departureTime", open)}
              onChange={changeDeparture}
            />
            <View style={styles.cell}>
              <FlightTimeField
                label={t("manualFlight.arrivalLocal")}
                date={arrivalDate}
                value={value.arrivalTime}
                disabled={disabled}
                onEditingChange={(open) => onPickerChange("arrivalTime", open)}
                onChange={(date, arrivalTime) => {
                  const automatic = automaticArrival && date === arrivalDate;
                  if (!automatic) setAutomaticArrival(false);
                  onChange({
                    arrivalTime,
                    arrivalDate: automatic
                      ? arrivalTime
                        ? suggestedFlightArrivalDate(
                            value.departureDate,
                            value.departureTime,
                            arrivalTime,
                          )
                        : ""
                      : date,
                  });
                }}
              />
              <UiButton
                variant={nextDay ? "secondary" : "text"}
                label={t(
                  nextDay ? "manualFlight.nextDaySelected" : "manualFlight.nextDay",
                )}
                disabled={disabled || !value.departureDate}
                onPress={() => {
                  setAutomaticArrival(false);
                  onChange({
                    arrivalDate: nextDay
                      ? value.departureDate
                      : flightNextDate(value.departureDate),
                  });
                }}
              />
            </View>
          </View>
        </>
      ) : null}
      <PlanParticipantsField
        compact
        value={value.participation}
        options={participantOptions}
        disabled={disabled}
        onChange={(participation) => onChange({ participation })}
      />
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    fields: { gap: visual.space.row },
    caption: { ...visual.type.action, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    times: { flexDirection: "row", gap: visual.space.row, alignItems: "flex-start" },
    stacked: { flexDirection: "column" },
    cell: { flex: 1, minWidth: 0, gap: visual.space.heading },
    host: { flex: 1 },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      maxHeight: "70%",
    },
  });
