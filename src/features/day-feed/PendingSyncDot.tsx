import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
export function PendingSyncDot() {
  const styles = useThemedStyles((colors) => ({
    dot: { color: colors.warningIndicator, fontSize: 8 },
  }));
  return (
    <UiText accessibilityLabel={t("tripCreate.itemPending")} style={styles.dot}>
      {" "}
      ●
    </UiText>
  );
}
