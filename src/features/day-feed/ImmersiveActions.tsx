import { StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiButton } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
type Action = "addPhoto" | "addAttachment" | "addExpense" | "linkExpense";
export function ImmersiveActions({
  actions = {},
  linkExpenseFirst = false,
}: {
  actions?: Partial<Record<Action, () => void>>;
  linkExpenseFirst?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  return (
    <View style={styles.actions}>
      {(linkExpenseFirst
        ? (["linkExpense", "addExpense", "addPhoto", "addAttachment"] as const)
        : (["addPhoto", "addAttachment", "addExpense", "linkExpense"] as const)
      ).map((kind) => (
        <View key={kind} style={styles.cell}>
          <UiButton
            label={t(`fidelity.${kind}`)}
            variant="secondary"
            size="tile"
            disabled={!actions[kind]}
            onPress={actions[kind] ?? (() => {})}
            icon={
              <View style={styles.icon}>
                <AppIcon
                  name={kind === "linkExpense" ? "arrow.up.right" : "plus"}
                  size={18}
                  color={actions[kind] ? colors.accent : colors.textSecondary}
                />
              </View>
            }
          />
        </View>
      ))}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    cell: { flexBasis: "47%", flexGrow: 1 },
    icon: {
      padding: 8,
      borderRadius: visual.radius.control,
      backgroundColor: c.selected,
    },
  });
