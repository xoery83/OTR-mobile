import { Pressable, StyleSheet, View } from "react-native";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";
import { UiText } from "@/ui/controls";
import { t, type MessageKey } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

const sources = [
  ["camera", "ui.camera", "extra.copy0"],
  ["photo", "ui.photoLibrary", "extra.copy1"],
  ["file", "ui.files", "extra.copy2"],
] as const satisfies readonly (readonly [string, MessageKey, MessageKey])[];

export type ReceiptScanSource = (typeof sources)[number][0];

export function ReceiptScanSourceFields({ count, slots, onChoose, onCancel }: {
  count: number;
  slots: number;
  onChoose(source: ReceiptScanSource): void;
  onCancel?(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.body}>
      <UiText style={styles.hint}>{t("ui.scanOneReceiptOrAddMultiplePartsOfALong")}</UiText>
      <UiText style={styles.hint}>
        {count === 0 ? t("entry.upToImages", { count: MAX_EXPENSE_ATTACHMENTS }) : t("entry.slots", { count: slots })}
      </UiText>
      {sources.map(([kind, title, subtitle]) => (
        <Pressable key={kind} accessibilityRole="button"
          accessibilityLabel={`${t(title)}. ${t(subtitle)}`} disabled={slots === 0}
          accessibilityState={{ disabled: slots === 0 }}
          style={styles.option} onPress={() => onChoose(kind)}>
          <UiText style={styles.title}>{t(title)}</UiText>
          <UiText style={styles.hint}>{t(subtitle)}</UiText>
        </Pressable>
      ))}
      {onCancel ? (
        <Pressable accessibilityRole="button" style={styles.option} onPress={onCancel}>
          <UiText style={styles.title}>{t("ui.cancel")}</UiText>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: UiColors) => StyleSheet.create({
  body: { gap: visual.space.card },
  option: {
    backgroundColor: colors.groupedBackground,
    borderRadius: 10,
    padding: visual.space.card,
    minHeight: 44,
    gap: 4,
  },
  hint: { ...visual.type.meta, color: colors.textSecondary },
  title: { ...visual.type.row, color: colors.accent },
});
