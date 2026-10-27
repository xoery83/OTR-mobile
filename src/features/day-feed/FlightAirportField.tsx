import { useState } from "react";
import { Keyboard, Modal, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { UiFormRow, UiTextInput } from "@/ui/forms";
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
  onEditingChange,
}: {
  label: string;
  code: string;
  name: string;
  disabled: boolean;
  onEditingChange?(open: boolean): void;
  onChange(value: { code: string; name: string; zone: string | null }): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const results = open ? airportSuggestions(query ?? (code || name)) : [];
  const close = () => {
    setOpen(false);
    onEditingChange?.(false);
    setQuery(null);
    Keyboard.dismiss();
  };
  return (
    <View style={styles.field}>
      <UiFormRow
        variant="field"
        horizontalInset={0}
        label={label}
        value={airportLabel(code, name) || t("manualFlight.airportPlaceholder")}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setQuery(code || name);
          setOpen(true);
          onEditingChange?.(true);
        }}
      />
      <Modal
        visible={open && !disabled}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <SafeAreaProvider>
          <SafeAreaView style={styles.host}>
            <SheetHeader
              category="picker"
              safeTop={false}
              title={label}
              leftLabel={t("common.cancel")}
              onLeft={close}
            />
            <View style={styles.search}>
              <UiTextInput
                accessibilityLabel={label}
                placeholder={t("manualFlight.airportPlaceholder")}
                value={query ?? ""}
                maxLength={255}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
              />
            </View>
            <ScrollView
              style={styles.results}
              contentContainerStyle={styles.search}
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
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
                    <UiText style={styles.meta}>
                      {t("manualFlight.airportNoMatch")}
                    </UiText>
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
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    field: { gap: visual.space.row },
    host: { flex: 1, backgroundColor: colors.background },
    search: { padding: visual.space.page, gap: visual.space.row },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    results: { flex: 1 },
  });
