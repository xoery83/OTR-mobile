import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
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
};

export function AppNavigationMenu({ sections }: { sections: AppNavigationMenuItem[][] }) {
  const trigger = useRef<View>(null);
  const { width } = useWindowDimensions();
  const [anchor, setAnchor] = useState({ x: 12, y: 80, height: 44 });
  const [visible, setVisible] = useState(false);
  const menuLeft = Math.max(12, Math.min(anchor.x, width - 232));
  const menuTop = anchor.y + anchor.height + 4;
  const menuHeight =
    sections.flat().length * 44 + Math.max(0, sections.length - 1) * 6 + 12;
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
            style={[styles.dismissArea, { height: menuTop, left: 0, right: 0, top: 0 }]}
          />
          <Pressable
            accessible={false}
            onPress={() => setVisible(false)}
            style={[
              styles.dismissArea,
              { bottom: 0, left: 0, right: 0, top: menuTop + menuHeight },
            ]}
          />
          <Pressable
            accessible={false}
            onPress={() => setVisible(false)}
            style={[
              styles.dismissArea,
              { height: menuHeight, left: 0, top: menuTop, width: menuLeft },
            ]}
          />
          <Pressable
            accessible={false}
            onPress={() => setVisible(false)}
            style={[
              styles.dismissArea,
              {
                height: menuHeight,
                left: menuLeft + 220,
                right: 0,
                top: menuTop,
              },
            ]}
          />
          <View
            accessibilityRole="menu"
            style={[
              styles.menu,
              {
                left: menuLeft,
                top: menuTop,
              },
            ]}
          >
            {sections.map((items, sectionIndex) => (
              <View key={sectionIndex} style={sectionIndex ? styles.section : undefined}>
                {items.map((item) => (
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
                    <AppIcon
                      color={item.selected ? "#0F766E" : "#475569"}
                      name={item.icon}
                      size={18}
                    />
                    <Text style={[styles.label, item.selected && styles.selectedLabel]}>
                      {item.label}
                    </Text>
                    {item.selected ? (
                      <AppIcon color="#0F766E" name="checkmark" size={14} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
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
  overlay: { flex: 1 },
  dismissArea: { position: "absolute" },
  menu: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE7",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
    position: "absolute",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    width: 220,
    zIndex: 1,
  },
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
  },
  selectedRow: { backgroundColor: "#E7F5F1" },
  label: { color: "#1E293B", flex: 1, fontSize: 16, fontWeight: "500" },
  selectedLabel: { color: "#0F766E", fontWeight: "700" },
});
