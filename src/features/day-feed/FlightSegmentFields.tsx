import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { UiButton, UiText } from "@/ui/controls";
import { UiDatePicker, UiFormRow, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { CalendarField } from "./TripCalendarField";
import { selectedAirportZone } from "./airportSuggestions";
import { FlightAirportField } from "./FlightAirportField";
import { PlanParticipantsField } from "./PlanParticipantsField";
import type { FlightSegmentDraft } from "./manualFlightFormFields";
function FlightTimeField({
  label,
  value,
  disabled,
  onChange,
  onEditingChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange(value: string): void;
  onEditingChange(open: boolean): void;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(new Date());
  return (
    <View>
      <UiFormRow
        variant="field"
        label={label}
        value={value || t("tripCreate.notSet")}
        disabled={disabled}
        onPress={() => {
          const initial = new Date();
          if (value)
            initial.setHours(Number(value.slice(0, 2)), Number(value.slice(3, 5)), 0, 0);
          setSelected(initial);
          onEditingChange(true);
          setOpen(true);
        }}
      />
      {open ? (
        <View>
          <UiDatePicker
            mode="time"
            display="spinner"
            value={selected}
            accessibilityLabel={label}
            onChange={(_, next) => {
              if (next) setSelected(next);
            }}
          />
          <UiButton
            variant="text"
            label={t("common.done")}
            onPress={() => {
              onChange(
                `${String(selected.getHours()).padStart(2, "0")}:${String(selected.getMinutes()).padStart(2, "0")}`,
              );
              setOpen(false);
              onEditingChange(false);
            }}
          />
          <UiButton
            variant="text"
            label={t("common.cancel")}
            onPress={() => {
              setOpen(false);
              onEditingChange(false);
            }}
          />
          <UiButton
            variant="text"
            label={t("tripCreate.clearTime")}
            onPress={() => {
              onChange("");
              setOpen(false);
              onEditingChange(false);
            }}
          />
        </View>
      ) : null}
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
        onChange={(departureDate) => onChange({ departureDate })}
      />
      {full ? (
        <>
          <UiText style={styles.section}>{t("manualFlight.departure")}</UiText>
          <FlightAirportField
            label={t("manualFlight.originAirport")}
            code={value.originCode}
            name={value.originName}
            disabled={disabled}
            onChange={({ code, name, zone }) =>
              onChange({ originCode: code, originName: name, departureZone: zone ?? "" })
            }
          />
          <FlightTimeField
            label={t("manualFlight.departureTime")}
            onEditingChange={(open) => onPickerChange("departureTime", open)}
            value={value.departureTime}
            disabled={disabled}
            onChange={(departureTime) => onChange({ departureTime })}
          />
          {value.departureZone &&
          selectedAirportZone(value.originCode, value.originName) ===
            value.departureZone ? (
            <UiText style={styles.meta}>
              {t("manualFlight.airportZone", { zone: value.departureZone })}
            </UiText>
          ) : (
            text("departureZone", t("manualFlight.departureZone"))
          )}
          <UiText style={styles.section}>{t("manualFlight.arrival")}</UiText>
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
          <CalendarField
            variant="field"
            label={t("manualFlight.arrivalDate")}
            onEditingChange={(open) => onPickerChange("arrivalDate", open)}
            value={value.arrivalDate}
            initialNavigationDate={value.departureDate || initialNavigationDate}
            disabled={disabled}
            onChange={(arrivalDate) => onChange({ arrivalDate })}
          />
          <FlightTimeField
            label={t("manualFlight.arrivalTime")}
            onEditingChange={(open) => onPickerChange("arrivalTime", open)}
            value={value.arrivalTime}
            disabled={disabled}
            onChange={(arrivalTime) => onChange({ arrivalTime })}
          />
          {value.arrivalZone &&
          selectedAirportZone(value.destinationCode, value.destinationName) ===
            value.arrivalZone ? (
            <UiText style={styles.meta}>
              {t("manualFlight.airportZone", { zone: value.arrivalZone })}
            </UiText>
          ) : (
            text("arrivalZone", t("manualFlight.arrivalZone"))
          )}
          <UiText style={styles.meta}>{t("manualFlight.unknownHint")}</UiText>
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
    section: {
      ...visual.type.section,
      color: colors.textPrimary,
      marginTop: visual.space.heading,
    },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
