import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import { UiText } from "@/ui/controls";
import { UiFormRow } from "@/ui/forms";
import { formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { tripRangeLabel } from "./TripCalendarRangeField";
import { TripMembersSheet } from "./TripMembersSheet";

export type TripSetupMetadata = {
  startDate: string | null;
  endDate: string | null;
  destination: string | null;
};

export function TripCurrencyRow({
  setup,
  onOpen,
}: {
  setup: TripPreparationSetup | null;
  onOpen?: () => void;
}) {
  useUiLocale();
  const currency = setup?.currency;
  const available = currency?.state === "AVAILABLE";
  const canChange =
    available &&
    currency.permission === "OWNER" &&
    currency.lock === "NOT_OBSERVED" &&
    !!onOpen;
  return (
    <UiFormRow
      label={t("tripForm.currency")}
      value={
        available
          ? t(
              currency.lock === "FINALIZED"
                ? "tripForm.currencyLocked"
                : canChange
                  ? "tripForm.currencyChange"
                  : "tripForm.currencyReadOnly",
              { code: currency.code },
            )
          : t("tripForm.currencyUnknown")
      }
      stacked
      disabled={!canChange}
      onPress={() => {
        if (canChange) onOpen?.();
      }}
    />
  );
}

export function TripSetupRows({
  setup,
  metadata,
  onEdit,
  onCurrency,
  onCover,
}: {
  setup: TripPreparationSetup | null;
  metadata?: TripSetupMetadata;
  onEdit?: () => void;
  onCurrency?: () => void;
  onCover?: () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.rows}>
      {metadata &&
      ((!metadata.startDate && !metadata.endDate) || !metadata.destination?.trim()) ? (
        <UiText accessibilityRole="header" style={styles.title}>
          {t("tripForm.setup")}
        </UiText>
      ) : null}
      {metadata && !metadata.startDate && !metadata.endDate ? (
        <UiFormRow
          label={t("tripForm.dates")}
          value={tripRangeLabel({ start: "", end: "" })}
          disabled={!onEdit}
          onPress={() => onEdit?.()}
          stacked
        />
      ) : null}
      {metadata && !metadata.destination?.trim() ? (
        <UiFormRow
          label={t("tripCreate.destination")}
          value={t("tripCreate.notSet")}
          disabled={!onEdit}
          onPress={() => onEdit?.()}
          stacked
        />
      ) : null}
      <TripCurrencyRow setup={setup} onOpen={onCurrency} />
      {onCover ? (
        <UiFormRow
          label={t("tripHome.coverTools")}
          value={t("tripForm.changeCover")}
          onPress={onCover}
        />
      ) : null}
    </View>
  );
}

export function TripMembersSummary({
  setup,
  tripId,
  generation,
}: {
  setup: TripPreparationSetup | null;
  tripId: string;
  generation: number;
}) {
  const current =
    setup?.context.tripId === tripId && setup.context.generation === generation
      ? setup
      : null;
  return (
    <ScopedMembersSummary
      key={JSON.stringify([tripId, generation, current?.context.accountId ?? null])}
      setup={current}
    />
  );
}
function ScopedMembersSummary({ setup }: { setup: TripPreparationSetup | null }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.rows}>
      <UiFormRow
        label={t("tripHome.members")}
        value={
          setup?.members.state === "AVAILABLE"
            ? t("tripForm.namedPeople", {
                count: formatUiNumber(setup.members.namedCount),
              })
            : t("tripForm.membersUnknown")
        }
        onPress={() => setOpen(true)}
      />
      {setup?.members.state === "AVAILABLE" ? (
        <UiText style={styles.meta}>{t("tripForm.namedPeopleHint")}</UiText>
      ) : null}
      <TripMembersSheet
        visible={open}
        members={open ? (setup?.members ?? null) : null}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    rows: { gap: visual.space.card },
    title: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
