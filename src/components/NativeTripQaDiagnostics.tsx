import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet } from "react-native";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { visual } from "@/ui/visual";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { readNativeTripQaDiagnostic } from "@/data/sync/nativeTripQaScope";

export function NativeTripQaDiagnostics() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [value, setValue] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const generation = getAccountGeneration();
      setValue(null);
      setFailed(false);
      void readNativeTripQaDiagnostic()
        .then((result) => {
          if (active && generation === getAccountGeneration())
            setValue(JSON.stringify({ observation: revision, ...result }, null, 2));
        })
        .catch(() => {
          if (active && generation === getAccountGeneration()) setFailed(true);
        });
      return () => {
        active = false;
      };
    }, [revision]),
  );
  return (
    <UiSection title={t("diagnostics.tripSync")}>
      <UiButton
        label={t("operations.refresh")}
        variant="secondary"
        onPress={() => setRevision((previous) => previous + 1)}
      />
      <UiText selectable style={styles.text}>
        {value ?? t(failed ? "operations.unavailable" : "common.loading")}
      </UiText>
    </UiSection>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    text: { ...visual.type.meta, color: colors.textSecondary },
  });
