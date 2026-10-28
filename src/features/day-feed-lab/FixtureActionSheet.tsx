import { Modal, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import type { ReadDocument } from "@/features/day-feed/bookingReadPresentation";
export type FixtureAction = {
  title: string;
  text?: string;
  choices?: readonly ReadDocument[];
};
// DEV only: no fixture action obtains a real Document, upload or mutation capability.
export function FixtureActionSheet({
  value,
  onClose,
}: {
  value: FixtureAction | null;
  onClose(): void;
}) {
  useUiLocale();
  const s = useThemedStyles(styles);
  return (
    <Modal visible={!!value} onRequestClose={onClose} animationType="slide">
      <SafeAreaView style={s.root}>
        <SheetHeader
          category="action"
          surface="background"
          safeTop={false}
          title={value?.title ?? ""}
          onLeft={onClose}
        />
        <ScrollView contentContainerStyle={s.content}>
          <UiText style={s.meta}>{t("fidelity.previewOnly")}</UiText>
          {value?.text ? <UiText style={s.body}>{value.text}</UiText> : null}
          {value?.choices?.map((doc) => (
            <UiButton
              key={doc.id}
              variant="text"
              label={doc.title}
              disabled={!doc.onOpen}
              onPress={doc.onOpen ?? (() => {})}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { padding: 18, gap: 12 },
    body: { fontSize: 15, lineHeight: 22.5, color: c.textPrimary },
    meta: { fontSize: 12, color: c.textSecondary },
  });
