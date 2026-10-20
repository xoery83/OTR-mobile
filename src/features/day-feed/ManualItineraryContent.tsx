import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { P1PlanEditor } from "./P1PlanEditor";
import { P3StayEditor } from "./P3StayEditor";
import { P4RentalEditor } from "./P4RentalEditor";
import { P5TransportEditor } from "./P5TransportEditor";

import { manualItineraryTypes } from "./manualItineraryTypes";
type Family = "P1" | "P3" | "P4" | "P5";
export function ManualItineraryContent({
  tripId,
  generation,
  initialDate,
  tripStartDate,
  onClose,
  registerDismissHandler,
  onSaved,
}: {
  tripId: string;
  generation: number;
  initialDate: string | null;
  tripStartDate?: string | null;
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
  useEffect(() => {
    let active = true;
    if (tripStartDate === undefined)
      void readLocalTripRepository()
        .then((repo) => repo.getTrip(tripId))
        .then((trip) => {
          if (active && generation === getAccountGeneration())
            setStartDate(trip?.startDate ?? null);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [tripId, generation, tripStartDate]);
  if (currentGeneration !== generation) return null;
  const props = {
    tripId,
    initialDate,
    tripStartDate: startDate,
    embedded: true,
    registerDismissHandler,
    onClose,
    onSaved: (id: string) => {
      if (generation === getAccountGeneration()) onSaved(id);
    },
  };
  if (family === "P1") return <P1PlanEditor {...props} />;
  if (family === "P3") return <P3StayEditor {...props} />;
  if (family === "P4") return <P4RentalEditor {...props} />;
  if (family === "P5") return <P5TransportEditor {...props} />;
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
        <UiText style={styles.label}>{t(type.labelKey)}</UiText>
        {"hintKey" in type ? (
          <UiText style={styles.meta}>{t(type.hintKey)}</UiText>
        ) : null}
      </Pressable>
    );
  };
  return (
    <View style={styles.body}>
      <SheetHeader
        title={t("formEntry.title")}
        leftLabel={t("common.close")}
        onLeft={onClose}
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
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
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
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
    meta: { ...visual.type.meta, color: colors.textSecondary },
    disabled: { opacity: 0.5 },
  });
