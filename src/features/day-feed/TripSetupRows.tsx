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
      <UiText accessibilityRole="header" style={styles.title}>
        {t("tripForm.setup")}
      </UiText>
      {metadata ? (
        <>
          <UiFormRow
            label={t("tripForm.dates")}
            value={tripRangeLabel({
              start: metadata.startDate ?? "",
              end: metadata.endDate ?? "",
            })}
            disabled={!onEdit}
            onPress={() => onEdit?.()}
            stacked
          />
          <UiFormRow
            label={t("tripCreate.destination")}
            value={metadata.destination || t("tripCreate.notSet")}
            disabled={!onEdit}
            onPress={() => onEdit?.()}
            stacked
          />
        </>
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

export function TripMembersSummary({ setup }: { setup: TripPreparationSetup | null }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.rows}>
      <UiText accessibilityRole="header" style={styles.title}>
        {t("tripHome.members")}
      </UiText>
      <UiText style={styles.meta}>
        {setup?.members.state === "AVAILABLE"
          ? t("tripForm.namedPeople", { count: formatUiNumber(setup.members.namedCount) })
          : t("tripForm.membersUnknown")}
      </UiText>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    rows: { gap: visual.space.card },
    title: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
