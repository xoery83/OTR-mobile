import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AppIcon } from "./AppIcon";

export type AppNavigationMenuItem = {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  onPress: () => void;
  selected?: boolean;
  destructive?: boolean;
};

export type AppNavigationMenuIdentity = {
  primary: string;
  secondary?: string | null;
};

export function AppNavigationMenu({
  identity,
  onIdentityPress,
  sections,
}: {
  identity: AppNavigationMenuIdentity;
  onIdentityPress: () => void;
  sections: AppNavigationMenuItem[][];
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const trigger = useRef<View>(null);
  const { height: windowHeight, width } = useWindowDimensions();
  const [anchor, setAnchor] = useState({ x: 12, y: 80, height: 44 });
  const [visible, setVisible] = useState(false);
  const menuWidth = Math.min(280, width - 24);
  const menuLeft = Math.max(12, Math.min(anchor.x, width - menuWidth - 12));
  const menuTop = anchor.y + anchor.height + 4;
  const open = () =>
    trigger.current?.measureInWindow((x, y, _width, height) => {
      setAnchor({ x, y, height });
      setVisible(true);
    });

  return (
    <>
      <View ref={trigger} collapsable={false}>
        <Pressable
          accessibilityLabel={t("navigation.openMenu")}
          accessibilityRole="button"
          onPress={open}
          style={styles.trigger}
        >
          <AppIcon color={colors.accent} name="line.3.horizontal" size={20} />
        </Pressable>
      </View>
      <Modal
        animationType="fade"
        onRequestClose={() => setVisible(false)}
        transparent
        visible={visible}
      >
        <View style={styles.overlay}>
          <Pressable
            accessible={false}
            onPress={() => setVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityLabel={t("navigation.menu")}
            accessibilityRole="menu"
            accessibilityViewIsModal
            style={[
              styles.menu,
              {
                left: menuLeft,
                maxHeight: Math.max(220, windowHeight - menuTop - 12),
                top: menuTop,
                width: menuWidth,
              },
            ]}
          >
            <ScrollView bounces={false} contentContainerStyle={styles.menuContent}>
              <Pressable
                accessibilityLabel={[identity.primary, identity.secondary]
                  .filter(Boolean)
                  .join(", ")}
                accessibilityHint={t("navigation.openAccount")}
                accessibilityRole="button"
                onPress={() => {
                  setVisible(false);
                  onIdentityPress();
                }}
                style={styles.identity}
              >
                <AppIcon color={colors.accent} name="person.crop.circle" size={24} />
                <View style={styles.identityCopy}>
                  <Text accessibilityRole="header" style={styles.identityPrimary}>
                    {identity.primary}
                  </Text>
                  {identity.secondary ? (
                    <Text style={styles.identitySecondary}>{identity.secondary}</Text>
                  ) : null}
                </View>
                <AppIcon color={colors.textSecondary} name="chevron.right" size={14} />
              </Pressable>
              {sections.map((items, sectionIndex) => (
                <View key={sectionIndex} style={styles.section}>
                  {items.map((item) => {
                    const color = item.destructive
                      ? colors.destructive
                      : item.selected
                        ? colors.accent
                        : colors.textTertiary;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: Boolean(item.selected) }}
                        key={item.label}
                        onPress={() => {
                          setVisible(false);
                          item.onPress();
                        }}
                        style={[styles.row, item.selected && styles.selectedRow]}
                      >
                        <AppIcon color={color} name={item.icon} size={18} />
                        <Text
                          style={[
                            styles.label,
                            item.selected && styles.selectedLabel,
                            item.destructive && styles.destructiveLabel,
                          ]}
                        >
                          {item.label}
                        </Text>
                        {item.selected ? (
                          <AppIcon color={colors.accent} name="checkmark" size={14} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    trigger: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      minWidth: 44,
    },
    overlay: { backgroundColor: colors.overlay, flex: 1 },
    menu: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      position: "absolute",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.16,
      shadowRadius: 14,
      zIndex: 1,
    },
    menuContent: { padding: 6 },
    identity: {
      alignItems: "center",
      flexDirection: "row",
      gap: 11,
      minHeight: 56,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    identityCopy: { flex: 1 },
    identityPrimary: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    identitySecondary: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    section: {
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      marginTop: 5,
      paddingTop: 5,
    },
    row: {
      alignItems: "center",
      borderRadius: 7,
      flexDirection: "row",
      gap: 11,
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    selectedRow: { backgroundColor: colors.selected },
    label: { color: colors.textPrimary, flex: 1, fontSize: 16, fontWeight: "500" },
    selectedLabel: { color: colors.accent, fontWeight: "700" },
    destructiveLabel: { color: colors.destructive, fontWeight: "600" },
  });
