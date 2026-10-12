import type { ComponentType, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { UiButton } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { composeDayStream } from "./composition";

type Block = ReturnType<typeof composeDayStream>["containers"][number];
export type FlexibleBlockRendererProps = Readonly<{
  block: Block;
  immersive: boolean;
  nestedItems: ReactNode;
  onBlockImmersiveIntent: () => void;
  onChoiceFocusIntent: (key: string | null) => void;
  onChoiceScopeIntent: (scope: "MY" | "GROUP") => void;
  onClose: () => void;
}>;
export type FlexibleBlockRenderer = ComponentType<FlexibleBlockRendererProps>;

export function FlexibleBlockRow({
  block,
  immersive,
  nestedItems,
  onBlockImmersiveIntent,
  onChoiceFocusIntent,
  onChoiceScopeIntent,
  onClose,
}: FlexibleBlockRendererProps) {
  const styles = useThemedStyles(createStyles);
  const title = block.title || t("flexible.untitledBlock");
  return (
    <View style={styles.block} testID="flexible-block-row">
      {immersive ? (
        <Text style={styles.title}>{title}</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint={t("flexible.openBlock")}
          onPress={onBlockImmersiveIntent}
        >
          <Text style={styles.title}>{title}</Text>
        </Pressable>
      )}
      {block.softWindow && "startMinute" in block.softWindow ? (
        <Text style={styles.meta}>
          {clock(block.softWindow.startMinute)}–{clock(block.softWindow.endMinute)}
        </Text>
      ) : null}
      {nestedItems}
      {block.availableScopes.length > 1 ? (
        <View style={styles.scopes}>
          {(["MY", "GROUP"] as const).map((scope) => (
            <UiChoiceChip
              key={scope}
              label={t(scope === "MY" ? "flexible.my" : "flexible.group")}
              selected={block.choiceScope === scope}
              onPress={() => onChoiceScopeIntent(scope)}
            />
          ))}
        </View>
      ) : null}
      {block.choices.map((choice) => (
        <Pressable
          key={choice.key}
          accessibilityRole="button"
          accessibilityLabel={choice.name}
          accessibilityState={{ selected: choice.key === block.focusedChoiceKey }}
          onPress={() =>
            onChoiceFocusIntent(choice.key === block.focusedChoiceKey ? null : choice.key)
          }
          style={choice.key === block.focusedChoiceKey ? styles.focused : undefined}
        >
          <Text style={styles.choice}>{choice.name}</Text>
        </Pressable>
      ))}
      {immersive ? (
        <UiButton label={t("common.close")} variant="text" onPress={onClose} />
      ) : null}
    </View>
  );
}
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    block: { paddingVertical: visual.space.section, gap: visual.space.row },
    title: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    scopes: { flexDirection: "row", gap: visual.space.row },
    choice: {
      ...visual.type.row,
      color: c.textPrimary,
      paddingVertical: visual.space.row,
    },
    focused: {
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: visual.radius.control,
    },
  });
