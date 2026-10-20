import { systemMessage } from "@/ui/domainLabels";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { UiDatePicker as DateTimePicker } from "@/ui/forms";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { confirmExpenseEconomicDate } from "@/data/operations/completeEconomicDate";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import { proposedExpenseDate } from "./expenseDraft";

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function ConfirmExpenseDateScreen() {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  const [expense, setExpense] = useState<LedgerExpense | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (expenseId)
        void getDefaultLedgerExpenseRepository()
          .then((repository) => repository.getExpense(expenseId))
          .then((value) => {
            if (!active) return;
            setExpense(value);
            const suggestion = value ? proposedExpenseDate(value) : null;
            setSuggested(Boolean(suggestion));
            setDate(suggestion ?? dateKey(new Date()));
          });
      return () => {
        active = false;
      };
    }, [expenseId]),
  );
  const confirm = async () => {
    if (!expense || !date || busy || saved) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await confirmExpenseEconomicDate(expense.id, date);
      setSaved(true);
      if (result.state === "VALUED") router.back();
      else {
        setMessage(
          result.state === "SAVED_WAITING"
            ? t("ui.dateSavedOnThisIphoneItWillSyncWhenPossible")
            : t("ui.dateConfirmedTheTrustedReferenceRateIsStillResolving"),
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("ui.dateCouldNotBeConfirmed"),
      );
    } finally {
      setBusy(false);
    }
  };
  if (!expense) return <ActivityIndicator style={styles.loading} />;
  if (expense.economicDate)
    return (
      <Text style={styles.content}>{t("ui.transactionDateIsAlreadyConfirmed")}</Text>
    );
  return (
    <View style={styles.content}>
      <Text style={styles.subtitle}>{expense.title}</Text>
      <Text style={styles.explanation}>
        {t("ui.theSavedTimestampSuggestsThisDateButItIsNot")}
      </Text>
      {date ? (
        <>
          <Text style={styles.label}>
            {suggested
              ? t("ui.suggestedFromSavedTimestampPleaseConfirm")
              : t("ui.selectDatePleaseConfirm")}
          </Text>
          <DateTimePicker
            accessibilityLabel={t("ui.transactionDate")}
            mode="date"
            onChange={(_, value) => {
              if (value) setDate(dateKey(value));
            }}
            value={localDate(date)}
          />
          <Text style={styles.date}>{date}</Text>
        </>
      ) : (
        <Text style={styles.explanation}>{t("ui.selectTheTransactionDate")}</Text>
      )}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {systemMessage(message)}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !date || busy || saved }}
        disabled={!date || busy || saved}
        onPress={() => void confirm()}
        style={[styles.button, (!date || busy || saved) && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {busy ? t("ui.checking") : t("ui.confirmTransactionDate")}
        </Text>
      </Pressable>
      {message ? (
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.back}>{t("ui.returnToSettlementReview")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    loading: { flex: 1 },
    content: { flex: 1, padding: 24, gap: 18, backgroundColor: colors.background },
    subtitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "600" },
    explanation: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
    label: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
    date: { color: colors.textPrimary, fontSize: 20 },
    message: { color: colors.accent, fontSize: 15 },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      padding: 16,
      alignItems: "center",
    },
    disabled: { opacity: 0.5 },
    buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
    back: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  });
