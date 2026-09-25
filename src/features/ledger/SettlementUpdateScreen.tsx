import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { usePersonalSettlementReview } from "@/hooks/usePersonalSettlementReview";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney } from "./format";
import {
  localExpensesChangesFromFinal,
  personalBalanceFromFinal,
  personalStatementChangesFromFinal,
} from "./settlementSections";

export function SettlementUpdateScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const settlement = useStage7Settlement(journeyId);
  const review = usePersonalSettlementReview(journeyId);
  const [reason, setReason] = useState("");
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const current = settlement.lineage.at(-1) ?? settlement.finalized;
  const statement = review.state?.statement;
  const estimate = settlement.displayPreview?.balances.find(
    (item) => item.memberId === settlement.actorMemberId,
  );
  const currentBalance = settlement.hasPendingFinancialOperations
    ? (estimate?.minor ?? statement?.balanceMinor)
    : (statement?.balanceMinor ?? estimate?.minor);
  const currentCurrency = statement?.currency ?? estimate?.currency;
  const currentScale = statement?.scale ?? estimate?.scale;
  const confirmedBalance =
    current?.balances.find((item) => item.memberId === settlement.actorMemberId) ??
    (current && settlement.actorMemberId
      ? personalBalanceFromFinal(current, settlement.actorMemberId)
      : undefined);
  const personalChanges =
    statement && current && settlement.actorMemberId
      ? personalStatementChangesFromFinal(statement, current, settlement.actorMemberId)
      : [];
  const localChanges = current ? localExpensesChangesFromFinal(expenses, current) : [];
  const changes = settlement.adjustmentPreview?.changedExpenses.length
    ? settlement.adjustmentPreview.changedExpenses
    : settlement.hasPendingFinancialOperations && localChanges.length
      ? localChanges
      : personalChanges;
  const changesLoading = settlement.isOrganizer
    ? !settlement.adjustmentPreview && settlement.updating
    : !review.state && settlement.updating;
  const ready = settlement.adjustmentPreview?.state === "PREVIEW_READY";
  const titleFor = (expenseId: string) =>
    expenses.find((expense) => expense.id === expenseId || expense.serverId === expenseId)
      ?.title ??
    statement?.contributions.find((item) => item.expenseId === expenseId)
      ?.expenseTitleSnapshot ??
    `Expense ${expenseId.slice(0, 8)}`;

  useEffect(() => {
    let active = true;
    if (!journeyId) return;
    void getDefaultLedgerExpenseRepository()
      .then((repository) => repository.listExpensesForJourney(journeyId))
      .then((rows) => {
        if (active) setExpenses(rows);
      });
    return () => {
      active = false;
    };
  }, [journeyId, settlement.hasPendingFinancialOperations]);

  if (!current)
    return settlement.updating ? (
      <ActivityIndicator style={styles.loading} />
    ) : (
      <Text style={styles.empty}>No confirmed Settlement is available.</Text>
    );

  const confirm = async () => {
    if (!ready || !reason.trim()) return;
    if (await settlement.finalizeAdjustment(settlement.adjustmentPreview!, reason.trim()))
      router.replace({
        pathname: "/expenses/settlement",
        params: { journeyId },
      } as never);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.lead}>
          CURRENT CHANGES
        </Text>
        {currentBalance !== undefined &&
        currentCurrency &&
        currentScale !== undefined &&
        confirmedBalance ? (
          <>
            <Text style={styles.amount}>
              {formatLedgerMoney(Math.abs(currentBalance), currentCurrency, currentScale)}
            </Text>
            <Text style={styles.meta}>
              Last confirmed{" "}
              {formatLedgerMoney(
                Math.abs(confirmedBalance.netMinor),
                confirmedBalance.currency,
                confirmedBalance.scale,
              )}{" "}
              · Change {currentBalance - confirmedBalance.netMinor >= 0 ? "+" : ""}
              {formatLedgerMoney(
                currentBalance - confirmedBalance.netMinor,
                currentCurrency,
                currentScale,
              )}
            </Text>
          </>
        ) : (
          <Text style={styles.meta}>Calculating exact change…</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Changes since last confirmation
        </Text>
        {changes.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.expenseId}
            onPress={() => router.push(`/expenses/expense/${item.expenseId}`)}
            style={styles.row}
          >
            <View style={styles.grow}>
              <Text style={styles.rowTitle}>{titleFor(item.expenseId)}</Text>
              <Text style={styles.meta}>
                {item.change === "NEW"
                  ? "Added"
                  : item.change === "DELETED"
                    ? "Removed"
                    : "Changed"}
              </Text>
            </View>
            <Text style={styles.link}>View ›</Text>
          </Pressable>
        ))}
        {changesLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <Text style={styles.meta}>Loading changes…</Text>
          </View>
        ) : !changes.length && !settlement.message ? (
          <Text style={styles.meta}>No financial changes are visible.</Text>
        ) : null}
      </View>

      {settlement.isOrganizer ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Confirm updated amounts
          </Text>
          <Text style={styles.meta}>
            This creates a new immutable version under the existing Settlement.
          </Text>
          <TextInput
            accessibilityLabel="Reason for confirming Settlement changes"
            maxLength={2000}
            multiline
            onChangeText={setReason}
            placeholder="Reason for this update"
            style={styles.input}
            value={reason}
          />
          {!reason.trim() ? <Text style={styles.meta}>Reason is required.</Text> : null}
          {settlement.adjustmentPreview?.state === "PREVIEW_BLOCKED" ? (
            <Text style={styles.warning}>
              Resolve {settlement.adjustmentPreview.blockers.length} blocker
              {settlement.adjustmentPreview.blockers.length === 1 ? "" : "s"} before
              confirming.
            </Text>
          ) : settlement.hasPendingFinancialOperations ? (
            <Text style={styles.warning}>
              Sync pending financial changes before confirming.
            </Text>
          ) : settlement.message ? (
            <Text style={styles.warning}>{settlement.message}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || !reason.trim() }}
            disabled={!ready || !reason.trim() || settlement.busy}
            onPress={() => void confirm()}
            style={[styles.primary, (!ready || !reason.trim()) && styles.disabled]}
          >
            <Text style={styles.primaryText}>Confirm updated amounts</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.meta}>
          Only the Journey organizer can confirm a new Settlement version.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  amount: { color: "#0F172A", fontSize: 36, fontWeight: "900" },
  content: { gap: 16, padding: 16, paddingBottom: 48 },
  disabled: { opacity: 0.45 },
  empty: { color: "#64748B", padding: 20 },
  grow: { flex: 1, gap: 3 },
  hero: { backgroundColor: "#DFF5F1", borderRadius: 16, gap: 8, padding: 16 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 76,
    padding: 12,
    textAlignVertical: "top",
  },
  lead: { color: "#0F766E", fontSize: 18, fontWeight: "900" },
  link: { color: "#0F766E", fontSize: 15, fontWeight: "800" },
  loading: { marginTop: 32 },
  loadingRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 12,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  rowTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  section: { gap: 10 },
  sectionTitle: { color: "#0F172A", fontSize: 20, fontWeight: "900" },
  warning: { color: "#9A3412", fontSize: 14, fontWeight: "700", lineHeight: 20 },
});
