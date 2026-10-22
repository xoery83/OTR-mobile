import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import { ManualFlightEditor } from "./ManualFlightForm";
import { P1PlanEditor } from "./P1PlanEditor";
import { P3StayEditor } from "./P3StayEditor";
import { P4RentalEditor } from "./P4RentalEditor";
import { P5TransportEditor } from "./P5TransportEditor";

import { manualItineraryTypes } from "./manualItineraryTypes";
type Family = "P2" | "P1" | "P3" | "P4" | "P5";
export function ManualItineraryContent({
  tripId,
  generation,
  initialDate,
  tripStartDate,
  tripEndDate,
  onClose,
  registerDismissHandler,
  onSaved,
}: {
  tripId: string;
  generation: number;
  initialDate: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  onClose(): void;
  registerDismissHandler?: (handler: () => void) => () => void;
  onSaved(itemId: string): void;
}) {
  useUiLocale();
  const currentGeneration = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const [family, setFamily] = useState<Family | null>(null);
  const [startDate, setStartDate] = useState(tripStartDate ?? null);
  const [endDate, setEndDate] = useState(tripEndDate ?? null);
  useEffect(() => {
    let active = true;
    if (tripStartDate === undefined || tripEndDate === undefined)
      void readLocalTripRepository()
        .then((repo) => repo.getTrip(tripId))
        .then((trip) => {
          if (active && generation === getAccountGeneration()) {
            setStartDate(
              tripStartDate === undefined ? (trip?.startDate ?? null) : tripStartDate,
            );
            setEndDate(tripEndDate === undefined ? (trip?.endDate ?? null) : tripEndDate);
          }
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [tripId, generation, tripStartDate, tripEndDate]);
  if (currentGeneration !== generation) return null;
  const props = {
    tripId,
    initialDate,
    tripStartDate: startDate,
    tripEndDate: endDate,
    embedded: true,
    registerDismissHandler,
    onClose,
    onSaved: (id: string) => {
      if (generation === getAccountGeneration()) onSaved(id);
    },
  };
  const editor =
    family === "P2" ? (
      <ManualFlightEditor {...props} />
    ) : family === "P1" ? (
      <P1PlanEditor {...props} />
    ) : family === "P3" ? (
      <P3StayEditor {...props} />
    ) : family === "P4" ? (
      <P4RentalEditor {...props} />
    ) : family === "P5" ? (
      <P5TransportEditor {...props} />
    ) : null;
  if (editor) return <View style={styles.body}>{editor}</View>;
  const choice = (type: (typeof manualItineraryTypes)[number], compact: boolean) => {
    const hint =
      "reasonKey" in type
        ? t(type.reasonKey)
        : "hintKey" in type
          ? t(type.hintKey)
          : undefined;
    return (
      <Pressable
        key={type.id}
        accessibilityRole="button"
        accessibilityLabel={t(type.labelKey)}
        accessibilityHint={hint}
        accessibilityState={{ disabled: !type.enabled }}
        disabled={!type.enabled}
        onPress={() => {
          if (type.enabled && generation === getAccountGeneration())
            setFamily(type.id as Family);
        }}
        style={[
          styles.choice,
          compact ? styles.compact : styles.large,
          !type.enabled && styles.disabled,
        ]}
      >
        {compact ? (
          <View style={styles.compactIcon}>
            <AppIcon name={type.icon} color={colors.textPrimary} size={24} />
          </View>
        ) : (
          <AppIcon name={type.icon} color={colors.textPrimary} size={28} />
        )}
        <UiText style={compact ? styles.compactLabel : styles.label}>
          {t(type.labelKey)}
        </UiText>
        {"hintKey" in type ? (
          <UiText style={styles.meta}>{t(type.hintKey)}</UiText>
        ) : null}
      </Pressable>
    );
  };
  return (
    <View style={styles.backdrop}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
      <SafeAreaView edges={["bottom", "left", "right"]} style={styles.sheet}>
        <SheetHeader
          category="action"
          safeTop={false}
          title={t("formEntry.title")}
          leftLabel={t("common.close")}
          onLeft={onClose}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.choices}
          contentContainerStyle={styles.content}
        >
          <UiText style={styles.prompt}>{t("formEntry.prompt")}</UiText>
          <View style={styles.row}>
            {manualItineraryTypes.slice(0, 2).map((type) => choice(type, false))}
          </View>
          <View style={styles.row}>
            {manualItineraryTypes.slice(2).map((type) => choice(type, true))}
          </View>
          {manualItineraryTypes
            .filter((type) => !type.enabled)
            .map((type) => (
              <UiText key={type.id} style={styles.meta}>
                {t("reasonKey" in type ? type.reasonKey : "formEntry.prompt")}
              </UiText>
            ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
    sheet: {
      maxHeight: "90%",
      backgroundColor: colors.background,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      overflow: "hidden",
    },
    choices: { flexGrow: 0, flexShrink: 1, backgroundColor: colors.background },
    content: {
      padding: visual.space.page,
      gap: visual.space.card,
      paddingBottom: visual.space.page * 2,
    },
    prompt: { ...visual.type.row, color: colors.textSecondary },
    row: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    choice: { gap: visual.space.heading, minHeight: 88 },
    large: {
      flexGrow: 1,
      flexBasis: "44%",
      alignItems: "flex-start",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
      backgroundColor: colors.surface,
      borderRadius: visual.radius.card,
      padding: visual.space.heading,
    },
    compact: { flexGrow: 1, flexBasis: "15%", alignItems: "center", minWidth: 52 },
    compactIcon: {
      minWidth: 44,
      minHeight: 58,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
      backgroundColor: colors.surface,
      borderRadius: visual.radius.card,
    },
    label: { ...visual.type.row, color: colors.textPrimary },
    compactLabel: { ...visual.type.meta, color: colors.textPrimary, textAlign: "center" },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    disabled: { opacity: 0.5 },
  });
