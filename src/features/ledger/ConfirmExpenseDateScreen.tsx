import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
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
            ? "Date saved on this iPhone. It will sync when possible."
            : "Date confirmed. The trusted reference rate is still resolving.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Date could not be confirmed.");
    } finally {
      setBusy(false);
    }
  };
  if (!expense) return <ActivityIndicator style={styles.loading} />;
  if (expense.economicDate)
    return <Text style={styles.content}>Transaction date is already confirmed.</Text>;
  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Confirm transaction date
      </Text>
      <Text style={styles.subtitle}>{expense.title}</Text>
      <Text style={styles.explanation}>
        The saved timestamp suggests this date, but it is not proof of the transaction
        day. Confirm the date shown on your receipt or records. OTR will find the trusted
        reference rate automatically—no rate entry is needed.
      </Text>
      {date ? (
        <>
          <Text style={styles.label}>
            {suggested
              ? "Suggested from saved timestamp · please confirm"
              : "Select date · please confirm"}
          </Text>
          <DateTimePicker
            accessibilityLabel="Transaction date"
            mode="date"
            onChange={(_, value) => {
              if (value) setDate(dateKey(value));
            }}
            value={localDate(date)}
          />
          <Text style={styles.date}>{date}</Text>
        </>
      ) : (
        <Text style={styles.explanation}>Select the transaction date.</Text>
      )}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
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
          {busy ? "Checking…" : "Confirm transaction date"}
        </Text>
      </Pressable>
      {message ? (
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.back}>Return to Settlement Review ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
  content: { flex: 1, padding: 24, gap: 18, backgroundColor: "#F6F7F9" },
  title: { color: "#14222C", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#14222C", fontSize: 20, fontWeight: "600" },
  explanation: { color: "#526273", fontSize: 16, lineHeight: 24 },
  label: { color: "#526273", fontSize: 14, fontWeight: "600" },
  date: { color: "#14222C", fontSize: 20 },
  message: { color: "#0F766E", fontSize: 15 },
  button: {
    backgroundColor: "#0F766E",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  back: { color: "#0F766E", fontSize: 16, fontWeight: "600" },
});
