import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { UiButton } from "@/ui/controls";
import { systemMessage } from "@/ui/domainLabels";
import { router, Stack } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";

import { useReceiptCapture } from "@/hooks/useReceiptCapture";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";

export function ReceiptCaptureScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { expenseId, scan, receipts, selecting, message, pickPhoto, pickDocument } =
    useReceiptCapture();
  const full = Boolean(expenseId) && receipts.length >= MAX_EXPENSE_ATTACHMENTS;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerTitle: scan ? t("ledgerMigration.copy53") : t("ui.addAttachment"),
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={scan ? t("common.cancel") : t("common.close")}
          onPress={() => router.back()}
        >
          {scan ? t("common.cancel") : t("common.close")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {scan ? (
        <>
          <Text style={styles.note}>{t("ledgerMigration.copy54")}</Text>
          <UiButton label={t("common.back")} onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Text style={styles.note}>
            {t("receipt.slotsRemaining", {
              count: Math.max(0, MAX_EXPENSE_ATTACHMENTS - receipts.length),
            })}
          </Text>
          <UiButton
            label={t("ui.camera")}
            disabled={full || selecting}
            onPress={() => void pickPhoto(true)}
          />
          <UiButton
            label={t("ui.photoLibrary")}
            disabled={full || selecting}
            onPress={() => void pickPhoto(false)}
          />
          <UiButton
            label={t("ui.files")}
            disabled={full || selecting}
            onPress={() => void pickDocument()}
          />
          {message ? (
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {systemMessage(message)}
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: { gap: 12, padding: 20 },
    note: {
      ...visual.type.meta,
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 21,
    },
    message: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  });
