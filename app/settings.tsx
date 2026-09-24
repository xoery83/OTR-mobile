import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";

export default function SettingsRoute() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Settings
      </Text>
      <View style={styles.group}>
        <SettingRow
          icon="person.crop.circle"
          label="Account"
          onPress={() =>
            router.push({ pathname: "/account", params: { returnTo: "/settings" } })
          }
        />
        <SettingRow
          icon="globe"
          label="Language"
          onPress={() =>
            Alert.alert(
              "Language",
              "OTR currently follows your device language settings.",
            )
          }
          value="Device default"
        />
      </View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Data & Sync
      </Text>
      <View style={styles.group}>
        <SettingRow
          icon="checkmark.shield"
          label="Check Data Health"
          onPress={() => router.push("/data-sync")}
        />
      </View>
    </ScrollView>
  );
}

function SettingRow({
  icon,
  label,
  onPress,
  value,
}: {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <AppIcon color="#475569" name={icon} size={20} />
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      <AppIcon color="#64748B" name="chevron.right" size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  sectionTitle: { color: "#475569", fontSize: 14, fontWeight: "700" },
  group: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE7",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  label: { color: "#0F172A", flex: 1, fontSize: 16, fontWeight: "600" },
  value: { color: "#64748B", fontSize: 14 },
});
