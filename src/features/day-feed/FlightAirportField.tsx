import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  OpenFlightAirportContext,
  type FlightAirportChoice,
  type FlightAirportFieldProps,
} from "./hostedFlightAirport";

export function FlightAirportField(props: FlightAirportFieldProps) {
  useUiLocale();
  const { label, code, name, disabled, onChange, onEditingChange } = props;
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const host = useContext(OpenFlightAirportContext);
  const latest = useRef<FlightAirportFieldProps | null>(null);
  const hostedOpen = useRef(false);
  const generation = getAccountGeneration();
  useLayoutEffect(() => {
    latest.current = props;
    return () => {
      latest.current = null;
    };
  }, [props]);

  const close = () => {
    setOpen(false);
    onEditingChange?.(false);
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
          if (disabled || hostedOpen.current) return;
          Keyboard.dismiss();
          if (host) {
            const closeHosted = () => {
              hostedOpen.current = false;
              latest.current?.onEditingChange?.(false);
            };
            hostedOpen.current = true;
            onEditingChange?.(true);
            const initialQuery = code || name;
            if (
              !host(() => {
                if (generation !== getAccountGeneration() || !latest.current) return null;
                return { ...latest.current, initialQuery, onClose: closeHosted };
              })
            )
              closeHosted();
          } else {
            setOpen(true);
            onEditingChange?.(true);
          }
        }}
      />
      <Modal
        visible={open && !disabled}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        {open && !disabled ? (
          <SafeAreaProvider>
            <SafeAreaView style={styles.host}>
              <SheetHeader
                category="picker"
                safeTop={false}
                title={label}
                leftLabel={t("common.cancel")}
                onLeft={close}
              />
              <FlightAirportPicker
                label={label}
                initialQuery={code || name}
                onClose={close}
                onSelect={(value) => {
                  onChange(value);
                  close();
                }}
              >
                {(search, results) => (
                  <>
                    {search}
                    <ScrollView
                      style={styles.results}
                      automaticallyAdjustKeyboardInsets
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="interactive"
                    >
                      {results}
                    </ScrollView>
                  </>
                )}
              </FlightAirportPicker>
            </SafeAreaView>
          </SafeAreaProvider>
        ) : null}
      </Modal>
    </View>
  );
}

export function FlightAirportPicker({
  label,
  initialQuery,
  onClose,
  onSelect,
  doneInToolbar = false,
  children,
}: {
  label: string;
  initialQuery: string;
  onClose(): void;
  onSelect(value: FlightAirportChoice): void;
  doneInToolbar?: boolean;
  children(search: ReactNode, results: ReactNode): ReactNode;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState(initialQuery);
  const results = airportSuggestions(query);
  return children(
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
    </View>,
    <View style={styles.search}>
      {results.map((airport) => (
        <UiButton
          key={`${airport.iata}:${airport.icao}:${airport.name}:${airport.country}`}
          variant="text"
          label={`${airportLabel(airport.iata ?? airport.icao ?? "", airport.name)} · ${airport.country}`}
          onPress={() => {
            onSelect({
              code: airport.iata ?? airport.icao ?? "",
              name: airport.name,
              zone: airportTimeZone(airport),
            });
          }}
        />
      ))}
      {query.trim() ? (
        <>
          {!results.length ? (
            <UiText style={styles.meta}>{t("manualFlight.airportNoMatch")}</UiText>
          ) : null}
          <UiButton
            variant="text"
            label={t("manualFlight.keepAirport", { value: query.trim() })}
            onPress={() => {
              onSelect({ ...manualAirport(query), zone: null });
            }}
          />
        </>
      ) : doneInToolbar ? null : (
        <UiButton variant="text" label={t("common.done")} onPress={onClose} />
      )}
    </View>,
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
