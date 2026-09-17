import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";

export default function LedgerSettingsRoute() {
  const [currency, setCurrency] = useState("NZD");
  const [debugMode, setDebugMode] = useState(false);
  const [currencySheet, setCurrencySheet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getDefaultLedgerReportingRepository()
      .then((repository) => repository.getPreferences())
      .then((preferences) => {
        setCurrency(preferences.defaultCurrency);
        setDebugMode(preferences.debugMode);
      })
      .catch(() => setMessage("Settings could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const chooseCurrency = async (nextCurrency: string) => {
    const previous = currency;
    setCurrency(nextCurrency);
    setCurrencySheet(false);
    setMessage(null);
    try {
      const repository = await getDefaultLedgerReportingRepository();
      await repository.setDefaultCurrency(nextCurrency);
    } catch {
      setCurrency(previous);
      setMessage("Default Currency could not be saved.");
    }
  };

  const toggleDebugMode = async (enabled: boolean) => {
    setDebugMode(enabled);
    setMessage(null);
    try {
      const repository = await getDefaultLedgerReportingRepository();
      await repository.setDebugMode(enabled);
    } catch {
      setDebugMode(!enabled);
      setMessage("Debug Mode could not be saved.");
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Ledger
        </Text>
        <View style={styles.group}>
          <SettingRow
            label="Default Currency"
            onPress={() => setCurrencySheet(true)}
            value={currency}
          />
          <SettingRow
            label="Exchange Rates"
            onPress={() => router.push("/expenses/exchange-rates" as never)}
          />
        </View>
        <Text style={styles.hint}>
          Default Currency is saved now. Converted Ledger views will use it when the
          Currency Module is available; current amounts keep their verified reporting
          currency.
        </Text>

        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Developer
        </Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.label}>Debug Mode</Text>
              <Text style={styles.detail}>Show diagnostic information on Ledger</Text>
            </View>
            <Switch
              accessibilityLabel="Debug Mode"
              onValueChange={(enabled) => void toggleDebugMode(enabled)}
              trackColor={{ false: "#CBD5E1", true: "#86CFC4" }}
              value={debugMode}
            />
          </View>
        </View>
        {message ? <Text style={styles.error}>{message}</Text> : null}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setCurrencySheet(false)}
        presentationStyle="pageSheet"
        visible={currencySheet}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCurrencySheet(false)}
              style={styles.headerActionButton}
            >
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              Default Currency
            </Text>
            <View style={styles.headerSpacer} />
          </View>
          {currencySheet ? (
            <CurrencyPicker
              onSelect={(code) => void chooseCurrency(code)}
              selected={currency}
              suggestions={[currency]}
            />
          ) : null}
        </View>
      </Modal>
    </>
  );
}

function SettingRow({
  label,
  onPress,
  value,
}: {
  label: string;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowValue}>
        {value ? <Text style={styles.value}>{value}</Text> : null}
        <AppIcon color="#94A3B8" name="chevron.right" size={14} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { backgroundColor: "#F6F7F9", flexGrow: 1, padding: 16, paddingBottom: 40 },
  sectionTitle: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginLeft: 4,
    marginTop: 18,
    textTransform: "uppercase",
  },
  group: { backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  grow: { flex: 1 },
  label: { color: "#111827", flex: 1, fontSize: 16, fontWeight: "600" },
  detail: { color: "#64748B", fontSize: 12, marginTop: 2 },
  rowValue: { alignItems: "center", flexDirection: "row", gap: 6 },
  value: { color: "#64748B", fontSize: 16 },
  hint: { color: "#64748B", fontSize: 13, lineHeight: 19, margin: 8 },
  error: { color: "#B91C1C", fontSize: 14, margin: 8 },
  sheet: { backgroundColor: "#F6F7F9", flex: 1, paddingTop: 12 },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  sheetTitle: { color: "#111827", fontSize: 17, fontWeight: "700" },
  headerAction: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  headerActionButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 86,
    paddingHorizontal: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  headerSpacer: { minWidth: 86 },
});
