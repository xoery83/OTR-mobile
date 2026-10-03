import { UiButton } from "@/ui/controls";
import { t, type MessageKey } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { UiTextInput } from "@/ui/forms";
import { MoneyText } from "@/features/ledger/MoneyText";
import { systemMessage } from "@/ui/domainLabels";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { parseAmountToMinor } from "@/domain/expense/money";
import type { ExpenseSyncStatus } from "@/domain/expense/types";
import { useExpenseSlice } from "@/hooks/useExpenseSlice";

const syncStatusLabels: Record<ExpenseSyncStatus, MessageKey> = {
  PENDING_CREATE: "ledgerFeedback.copy57",
  SYNCING: "ledger.syncing",
  SYNCED: "ledgerFeedback.copy58",
  FAILED: "domain.label7",
};

export function ExpenseSliceScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
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
        <Text style={styles.title}>{t("expense.plural")}</Text>
        <Text style={styles.subtitle}>{t("ledgerFeedback.copy49")}</Text>

        <View style={styles.form}>
          <UiTextInput
            accessibilityLabel={t("ledgerFeedback.copy50")}
            onChangeText={setTitle}
            placeholder={t("expense.descriptionLabel")}
            style={styles.input}
            value={title}
          />
          <View style={styles.moneyRow}>
            <UiTextInput
              accessibilityLabel={t("reviewFlow.label33")}
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setAmount}
              placeholder={t("expense.amount")}
              style={[styles.input, styles.amountInput]}
              value={amount}
            />
            <UiTextInput
              accessibilityLabel={t("ledgerFeedback.copy51")}
              autoCapitalize="characters"
              maxLength={3}
              onChangeText={setCurrency}
              style={[styles.input, styles.currencyInput]}
              value={currency}
            />
          </View>
          <UiButton
            disabled={!canSave}
            onPress={() => void save()}
            label={t("ledgerFeedback.copy52")}
          />
        </View>

        {error ? <Text style={styles.error}>{systemMessage(error)}</Text> : null}

        {isLoading ? <ActivityIndicator /> : null}
        {!isLoading && expenses.length === 0 ? (
          <Text style={styles.empty}>{t("ledgerFeedback.copy53")}</Text>
        ) : null}

        {expenses.map((expense) => (
          <View key={expense.id} style={styles.expense}>
            <View>
              <Text style={styles.expenseTitle}>{expense.title}</Text>
              <MoneyText
                style={styles.expenseAmount}
                minor={expense.amountMinor}
                currency={expense.currencyCode}
                scale={2}
              />
            </View>
            <Text style={styles.status}>{t(syncStatusLabels[expense.syncStatus])}</Text>
          </View>
        ))}

        <View style={styles.developmentTools}>
          <Text style={styles.toolsLabel}>{t("ledgerFeedback.copy54")}</Text>
          <UiButton
            onPress={() => void runDemoSync()}
            label={t("ledgerFeedback.copy55")}
          />
          <Pressable onPress={failNextDemoSync} style={styles.failureButton}>
            <Text style={styles.failureButtonText}>{t("ledgerFeedback.copy56")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    content: { gap: 16, padding: 20 },
    title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
    subtitle: { color: colors.textSecondary, fontSize: 15 },
    form: { gap: 12, paddingVertical: 8 },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 6,
      borderWidth: 1,
      color: colors.textPrimary,
      fontSize: 16,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    moneyRow: { flexDirection: "row", gap: 12 },
    amountInput: { flex: 1 },
    currencyInput: { width: 82 },
    error: { color: colors.destructive, fontSize: 14 },
    empty: { color: colors.textSecondary, fontSize: 15, paddingVertical: 16 },
    expense: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 14,
    },
    expenseTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    expenseAmount: { color: colors.textSecondary, fontSize: 15, marginTop: 4 },
    status: { color: colors.accent, fontSize: 13, fontWeight: "700" },
    developmentTools: {
      borderColor: colors.separator,
      borderRadius: 6,
      borderWidth: 1,
      gap: 10,
      marginTop: 12,
      padding: 12,
    },
    toolsLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
    failureButton: { alignItems: "center", minHeight: 44, justifyContent: "center" },
    failureButtonText: { color: colors.warning, fontSize: 15, fontWeight: "700" },
  });
