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
          accessibilityLabel="Open app menu"
          accessibilityRole="button"
          onPress={open}
          style={styles.trigger}
        >
          <AppIcon color="#0F766E" name="line.3.horizontal" size={20} />
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
            accessibilityLabel="App menu"
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
                accessibilityHint="Opens account management"
                accessibilityRole="button"
                onPress={() => {
                  setVisible(false);
                  onIdentityPress();
                }}
                style={styles.identity}
              >
                <AppIcon color="#0F766E" name="person.crop.circle" size={24} />
                <View style={styles.identityCopy}>
                  <Text accessibilityRole="header" style={styles.identityPrimary}>
                    {identity.primary}
                  </Text>
                  {identity.secondary ? (
                    <Text style={styles.identitySecondary}>{identity.secondary}</Text>
                  ) : null}
                </View>
                <AppIcon color="#64748B" name="chevron.right" size={14} />
              </Pressable>
              {sections.map((items, sectionIndex) => (
                <View key={sectionIndex} style={styles.section}>
                  {items.map((item) => {
                    const color = item.destructive
                      ? "#B42318"
                      : item.selected
                        ? "#0F766E"
                        : "#475569";
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
                          <AppIcon color="#0F766E" name="checkmark" size={14} />
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

const styles = StyleSheet.create({
  trigger: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  overlay: { backgroundColor: "rgba(15, 23, 42, 0.08)", flex: 1 },
  menu: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE7",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    position: "absolute",
    shadowColor: "#0F172A",
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
  identityPrimary: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  identitySecondary: { color: "#64748B", fontSize: 13, marginTop: 2 },
  section: {
    borderTopColor: "#E5E7EB",
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
  selectedRow: { backgroundColor: "#E7F5F1" },
  label: { color: "#1E293B", flex: 1, fontSize: 16, fontWeight: "500" },
  selectedLabel: { color: "#0F766E", fontWeight: "700" },
  destructiveLabel: { color: "#B42318", fontWeight: "600" },
});
