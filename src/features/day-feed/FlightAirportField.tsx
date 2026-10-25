import { useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { UiButton, UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  airportTimeZone,
  airportLabel,
  airportSuggestions,
  manualAirport,
} from "./airportSuggestions";
export function FlightAirportField({
  label,
  code,
  name,
  disabled,
  onChange,
}: {
  label: string;
  code: string;
  name: string;
  disabled: boolean;
  onChange(value: { code: string; name: string; zone: string | null }): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const results = open ? airportSuggestions(query ?? (code || name)) : [];
  const close = () => {
    setOpen(false);
    setQuery(null);
    Keyboard.dismiss();
  };
  return (
    <View style={styles.field}>
      <UiText style={styles.caption}>{label}</UiText>
      <UiTextInput
        accessibilityLabel={label}
        placeholder={t("manualFlight.airportPlaceholder")}
        value={open && query !== null ? query : airportLabel(code, name)}
        maxLength={255}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        onBlur={() => {
          setOpen(false);
          setQuery(null);
        }}
        onFocus={() => {
          setQuery(code || name);
          setOpen(true);
        }}
        onChangeText={(next) => {
          setQuery(next);
          setOpen(true);
          onChange({ ...manualAirport(next), zone: null });
        }}
      />
      {open && !disabled ? (
        <View style={styles.results}>
          {results.map((airport) => (
            <UiButton
              key={`${airport.iata}:${airport.icao}:${airport.name}:${airport.country}`}
              variant="text"
              label={`${airportLabel(airport.iata ?? airport.icao ?? "", airport.name)} · ${airport.country}`}
              onPress={() => {
                onChange({
                  code: airport.iata ?? airport.icao ?? "",
                  name: airport.name,
                  zone: airportTimeZone(airport),
                });
                close();
              }}
            />
          ))}
          {(query ?? "").trim() ? (
            <>
              {!results.length ? (
                <UiText style={styles.meta}>{t("manualFlight.airportNoMatch")}</UiText>
              ) : null}
              <UiButton
                variant="text"
                label={t("manualFlight.keepAirport", { value: query!.trim() })}
                onPress={() => {
                  onChange({ ...manualAirport(query!), zone: null });
                  close();
                }}
              />
            </>
          ) : (
            <UiButton variant="text" label={t("common.done")} onPress={close} />
          )}
        </View>
      ) : null}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    field: { gap: visual.space.row },
    caption: { ...visual.type.action, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    results: { backgroundColor: colors.surface, borderRadius: visual.radius.control },
  });
