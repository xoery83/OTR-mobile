import { useSyncExternalStore } from "react";
import { ScrollView, StyleSheet } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { AccountScope } from "@/data/auth/accountRequestContext";
import type { AccountAiUsageRead } from "@/data/auth/accountAiUsageReader";
import { providerCostLabel } from "@/domain/auth/accountAiUsage";
import { UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export function AccountAiUsageView({
  scope,
  result,
}: {
  scope: AccountScope;
  result: AccountAiUsageRead;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  if (
    generation !== scope.generation ||
    (result.status === "READY" && result.snapshot.accountId !== scope.accountId)
  )
    return null;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={styles.screen} contentContainerStyle={styles.content}>
      <UiSection title={t("aiUsage.title")}>
        <UiText style={styles.hint}>{t("aiUsage.allowanceUnknown")}</UiText>
        {result.status === "UNAVAILABLE" ? (
          <UiText style={styles.text}>{t("aiUsage.unavailable")}</UiText>
        ) : (
          <>
            {result.snapshot.evidence === "SYNTHETIC" ? (
              <UiText accessibilityRole="alert" style={styles.hint}>
                {t("aiUsage.synthetic")}
              </UiText>
            ) : null}
            {!result.snapshot.records.length ? (
              <UiText style={styles.text}>{t("aiUsage.empty")}</UiText>
            ) : null}
            {result.snapshot.records.map((record) => (
              <UiSection
                key={record.receiptId}
                title={t(`aiUsage.feature.${record.feature}`)}
              >
                <UiText style={styles.text}>
                  {t(
                    record.costQuality === "ESTIMATED"
                      ? "aiUsage.estimatedProviderCost"
                      : "aiUsage.providerCost",
                  )}
                  : {providerCostLabel(record) ?? t("aiUsage.unknown")}
                </UiText>
                <UiText style={styles.text}>
                  {t("aiUsage.inputTokens")}: {record.inputTokens ?? t("aiUsage.unknown")}
                </UiText>
                <UiText style={styles.text}>
                  {t("aiUsage.outputTokens")}:{" "}
                  {record.outputTokens ?? t("aiUsage.unknown")}
                </UiText>
                {record.cacheHit ? (
                  <UiText style={styles.hint}>{t("aiUsage.cacheHit")}</UiText>
                ) : null}
                {record.metering === "PENDING" ? (
                  <UiText style={styles.hint}>{t("aiUsage.pending")}</UiText>
                ) : null}
              </UiSection>
            ))}
          </>
        )}
      </UiSection>
    </ScrollView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    text: { ...visual.type.row, color: colors.textPrimary },
    hint: { ...visual.type.meta, color: colors.textSecondary },
  });
