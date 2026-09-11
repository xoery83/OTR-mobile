import { useState } from "react";
import {
  ActivityIndicator,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { parseAmountToMinor } from "@/domain/expense/money";
import type { ExpenseSyncStatus } from "@/domain/expense/types";
import { useExpenseSlice } from "@/hooks/useExpenseSlice";

const syncStatusLabels: Record<ExpenseSyncStatus, string> = {
  PENDING_CREATE: "Pending",
  SYNCING: "Syncing",
  SYNCED: "Synced",
  FAILED: "Failed",
};

export function ExpenseSliceScreen() {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("NZD");
  const {
    createExpense,
    error,
    expenses,
    failNextDemoSync,
    isLoading,
    isSaving,
    runDemoSync,
  } = useExpenseSlice();

  const save = async () => {
    const amountMinor = parseAmountToMinor(amount);
    if (amountMinor === null) return;

    const created = await createExpense({
      title,
      amountMinor,
      currencyCode: currency.trim().toUpperCase(),
    });
    if (created) {
      setTitle("");
      setAmount("");
    }
  };

  const amountMinor = parseAmountToMinor(amount);
  const canSave = Boolean(title.trim()) && amountMinor !== null && !isSaving;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Expenses</Text>
        <Text style={styles.subtitle}>Local-first validation slice</Text>

        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Expense description"
            onChangeText={setTitle}
            placeholder="Description"
            style={styles.input}
            value={title}
          />
          <View style={styles.moneyRow}>
            <TextInput
              accessibilityLabel="Expense amount"
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setAmount}
              placeholder="Amount"
              style={[styles.input, styles.amountInput]}
              value={amount}
            />
            <TextInput
              accessibilityLabel="Expense currency"
              autoCapitalize="characters"
              maxLength={3}
              onChangeText={setCurrency}
              style={[styles.input, styles.currencyInput]}
              value={currency}
            />
          </View>
          <Button disabled={!canSave} onPress={() => void save()} title="Save expense" />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isLoading ? <ActivityIndicator /> : null}
        {!isLoading && expenses.length === 0 ? (
          <Text style={styles.empty}>No local expenses yet.</Text>
        ) : null}

        {expenses.map((expense) => (
          <View key={expense.id} style={styles.expense}>
            <View>
              <Text style={styles.expenseTitle}>{expense.title}</Text>
              <Text style={styles.expenseAmount}>
                {expense.currencyCode} {(expense.amountMinor / 100).toFixed(2)}
              </Text>
            </View>
            <Text style={styles.status}>{syncStatusLabels[expense.syncStatus]}</Text>
          </View>
        ))}

        <View style={styles.developmentTools}>
          <Text style={styles.toolsLabel}>Stage 2 sync harness</Text>
          <Button onPress={() => void runDemoSync()} title="Run pending sync" />
          <Pressable onPress={failNextDemoSync} style={styles.failureButton}>
            <Text style={styles.failureButtonText}>Fail next sync</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { gap: 16, padding: 20 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#475569", fontSize: 15 },
  form: { gap: 12, paddingVertical: 8 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 6,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  moneyRow: { flexDirection: "row", gap: 12 },
  amountInput: { flex: 1 },
  currencyInput: { width: 82 },
  error: { color: "#B91C1C", fontSize: 14 },
  empty: { color: "#64748B", fontSize: 15, paddingVertical: 16 },
  expense: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },
  expenseTitle: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  expenseAmount: { color: "#475569", fontSize: 15, marginTop: 4 },
  status: { color: "#0F766E", fontSize: 13, fontWeight: "700" },
  developmentTools: {
    borderColor: "#CBD5E1",
    borderRadius: 6,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  toolsLabel: { color: "#475569", fontSize: 13, fontWeight: "700" },
  failureButton: { alignItems: "center", minHeight: 40, justifyContent: "center" },
  failureButtonText: { color: "#B45309", fontSize: 15, fontWeight: "700" },
});
