import { Button, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { stage3JourneyId, useLedgerStage3 } from "@/hooks/useLedgerStage3";

function money(minor: number, currency: string) {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}

export function LedgerStage3Screen() {
  const {
    bootstrap,
    cacheMyLedger,
    createLocalStage4Expense,
    cursor,
    expenses,
    isBusy,
    message,
    pull,
    summaries,
    syncStage4Creates,
  } = useLedgerStage3();

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Ledger Stage 3</Text>
        <Text style={styles.subtitle}>SQLite-backed bootstrap and pull validation</Text>
        <Text style={styles.meta}>Journey {stage3JourneyId || "not configured"}</Text>
        <Text style={styles.meta}>Cursor {cursor ?? "none"}</Text>

        <View style={styles.tools}>
          <Button
            disabled={isBusy}
            onPress={() => router.push("/expenses/receipt")}
            title="Import receipt first"
          />
          <Button disabled={isBusy} onPress={bootstrap} title="Bootstrap Journey" />
          <Button disabled={isBusy} onPress={pull} title="Pull changes" />
          <Button disabled={isBusy} onPress={cacheMyLedger} title="Cache My Ledger" />
          <Button
            disabled={isBusy}
            onPress={createLocalStage4Expense}
            title="Create Stage 4A expense"
          />
          <Button
            disabled={isBusy}
            onPress={syncStage4Creates}
            title="Sync Stage 4A creates"
          />
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Text style={styles.section}>Journey Ledger</Text>
        {expenses.length === 0 ? (
          <Text style={styles.empty}>No cached expenses.</Text>
        ) : null}
        {expenses.map((expense) => (
          <View key={expense.id} style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.rowTitle}>{expense.title}</Text>
              <Text style={styles.meta}>
                r{expense.serverRevision} · {expense.syncStatus} · {expense.status}
              </Text>
            </View>
            <Text style={styles.amount}>
              {money(expense.original.minor, expense.original.currency)}
            </Text>
            <Button
              title="Add receipt"
              onPress={() =>
                router.push({
                  pathname: "/expenses/receipt",
                  params: { expenseId: expense.id },
                })
              }
            />
          </View>
        ))}

        <Text style={styles.section}>My Ledger</Text>
        {summaries.length === 0 ? (
          <Text style={styles.empty}>No cached summaries.</Text>
        ) : null}
        {summaries.map((summary) => (
          <View key={summary.journeyId} style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.rowTitle}>{summary.title}</Text>
              <Text style={styles.meta}>
                Paid {money(summary.paidMinor, summary.currency)} · My spend{" "}
                {money(summary.mySpendMinor, summary.currency)}
              </Text>
            </View>
            <Text style={styles.amount}>
              {money(summary.positionMinor, summary.currency)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F8FAFC", flex: 1 },
  content: { gap: 14, padding: 20, paddingBottom: 40 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#475569", fontSize: 15 },
  meta: { color: "#64748B", fontSize: 13 },
  tools: { gap: 10 },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  section: { color: "#334155", fontSize: 13, fontWeight: "800", marginTop: 12 },
  empty: { color: "#64748B", fontSize: 15, paddingVertical: 12 },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  grow: { flex: 1 },
  rowTitle: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  amount: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
});
