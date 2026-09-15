import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import { formatLedgerDate, formatLedgerMoney, formatValuationPolicy } from "./format";

export function LedgerExpenseDetailScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const [expense, setExpense] = useState<LedgerExpense | null>(null);
  const [payerName, setPayerName] = useState("Traveller");
  const [receiptCount, setReceiptCount] = useState(0);
  const [hasOpenConflict, setHasOpenConflict] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [participationError, setParticipationError] = useState<string | null>(null);
  const [savingParticipation, setSavingParticipation] = useState(false);
  useEffect(() => {
    let active = true;
    if (id) {
      void getDefaultLedgerExpenseRepository()
        .then((repository) => repository.getExpense(id))
        .then(async (nextExpense) => {
          if (!nextExpense) return [null, false, "Traveller", 0] as const;
          const [nextHasOpenConflict, members, receipts] = await Promise.all([
            getDefaultLedgerReportingRepository().then((repository) =>
              repository.hasOpenConflict(id),
            ),
            getDefaultLedgerReadRepository().then((repository) =>
              repository.listMembers(nextExpense.journeyId),
            ),
            getDefaultLedgerReceiptRepository().then((repository) =>
              repository.listReceipts(nextExpense.journeyId),
            ),
          ]);
          return [
            nextExpense,
            nextHasOpenConflict,
            members.find((member) => member.id === nextExpense.payerMemberId)
              ?.displayName ?? "Traveller",
            receipts.filter((receipt) => receipt.expenseId === nextExpense.id).length,
          ] as const;
        })
        .then(([nextExpense, nextHasOpenConflict, nextPayerName, nextReceiptCount]) => {
          if (!active) return;
          setExpense(nextExpense);
          setHasOpenConflict(nextHasOpenConflict);
          setPayerName(nextPayerName);
          setReceiptCount(nextReceiptCount);
        })
        .catch(() => {
          if (active) setLoadError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [id]);
  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Loading Expense" />
      </View>
    );
  if (!expense)
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>
          {loadError
            ? "Expense could not be loaded from this iPhone."
            : "Expense is not available in the local Ledger."}
        </Text>
      </View>
    );
  const valuation = expense.valuation;
  const participantNames = new Map(
    expense.participants.map((item) => [item.memberId, item.displayNameSnapshot]),
  );
  const excluded = expense.status !== "ACCEPTED" || hasOpenConflict || !valuation;
  const warning = hasOpenConflict
    ? {
        title: "Conflict—review required",
        detail: "Choose the correct version before relying on this Expense in totals.",
      }
    : expense.status === "RATE_REQUIRED"
      ? {
          title: "Needs exchange rate",
          detail:
            "Add or confirm a rate before including this Expense in converted totals.",
        }
      : {
          title: "Not included in totals",
          detail: "This Expense is not yet part of the accepted Spending totals.",
        };
  const setIncluded = async (included: boolean) => {
    setSavingParticipation(true);
    setParticipationError(null);
    try {
      const repository = await getDefaultLedgerExpenseRepository();
      const updated = await repository.updateExpense(
        expense.id,
        {
          journeyId: expense.journeyId,
          creatorMemberId: expense.creatorMemberId,
          payerMemberId: expense.payerMemberId,
          title: expense.title,
          description: expense.description,
          category: expense.category,
          occurredAt: expense.occurredAt,
          original: expense.original,
          participants: expense.participants,
          splits: expense.splits,
          valuation: expense.valuation,
          status: expense.status === "DELETED" ? "DRAFT" : expense.status,
          settlementParticipation: included ? "INCLUDED" : "EXCLUDED",
        },
        "Changed settlement participation.",
      );
      setExpense(updated);
    } catch {
      setParticipationError("Settlement participation could not be saved.");
    } finally {
      setSavingParticipation(false);
    }
  };
  const confirmParticipation = () => {
    const include = expense.settlementParticipation === "EXCLUDED";
    Alert.alert(
      include ? "Include in group settlement?" : "Remove from group settlement?",
      include
        ? "Participant shares will affect who owes whom."
        : "The Expense stays in Spending and analysis, but will not create debt between travellers.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: include ? "Include" : "Remove",
          style: include ? "default" : "destructive",
          onPress: () => void setIncluded(include),
        },
      ],
    );
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {saved === "1" ? (
        <Text accessibilityLiveRegion="polite" style={styles.saved}>
          Saved on this iPhone—will sync.
        </Text>
      ) : null}
      <Text accessibilityRole="header" style={styles.title}>
        {expense.title}
      </Text>
      <Text style={styles.meta}>
        {expense.category} · {formatLedgerDate(expense.occurredAt)}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/expenses/new",
              params: { expenseId: expense.id, journeyId: expense.journeyId },
            })
          }
          style={styles.action}
        >
          <Text style={styles.actionText}>Edit Expense</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/expenses/receipt",
              params: { expenseId: expense.id, journeyId: expense.journeyId },
            })
          }
          style={styles.action}
        >
          <Text style={styles.actionText}>Attach Receipt</Text>
        </Pressable>
      </View>
      {excluded ? (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>{warning.title}</Text>
          <Text style={styles.meta}>{warning.detail}</Text>
        </View>
      ) : null}
      <Section label="MERCHANT VALUE">
        <Text style={styles.value}>
          {formatLedgerMoney(
            expense.original.minor,
            expense.original.currency,
            expense.original.scale,
          )}
        </Text>
      </Section>
      <Section label="DETAILS">
        <Text style={styles.splitName}>Paid by {payerName}</Text>
        <Text style={styles.meta}>
          {formatLedgerDate(expense.occurredAt)} · {expense.category}
        </Text>
        {expense.description ? (
          <Text style={styles.meta}>{expense.description}</Text>
        ) : null}
        <Text style={styles.meta}>
          {receiptCount
            ? `${receiptCount} ${receiptCount === 1 ? "receipt" : "receipts"} attached`
            : "No receipt attached"}
        </Text>
      </Section>
      <Section label="JOURNEY VALUATION">
        {valuation ? (
          <>
            <Text style={styles.value}>
              {formatLedgerMoney(
                valuation.settlement.minor,
                valuation.settlement.currency,
                valuation.settlement.scale,
              )}
            </Text>
            <Text style={styles.meta}>
              {formatValuationPolicy(valuation.policy)}
              {valuation.decimalRate ? ` · rate ${valuation.decimalRate}` : ""}
            </Text>
            {valuation.reason ? (
              <Text style={styles.meta}>Reason: {valuation.reason}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>No exchange value yet</Text>
        )}
      </Section>
      <Section label="EXACT SPLITS">
        {expense.splits.map((split) => (
          <View key={split.memberId} style={[styles.split, largeText && styles.stack]}>
            <Text style={styles.splitName}>
              {participantNames.get(split.memberId) ?? "Traveller"}
            </Text>
            <Text style={styles.splitAmount}>
              {split.settlementMinor === null || !valuation
                ? `${expense.original.currency} original ${formatLedgerMoney(split.originalMinor, expense.original.currency, expense.original.scale)}`
                : formatLedgerMoney(
                    split.settlementMinor,
                    valuation.settlement.currency,
                    valuation.settlement.scale,
                  )}
            </Text>
          </View>
        ))}
      </Section>
      {expense.status !== "DELETED" ? (
        <Section label="GROUP SETTLEMENT">
          <Pressable
            accessibilityHint="Opens a confirmation before changing who owes whom"
            accessibilityLabel={`Group settlement, ${
              expense.settlementParticipation === "INCLUDED"
                ? "included"
                : "not included"
            }`}
            accessibilityRole="button"
            accessibilityState={{ disabled: savingParticipation }}
            disabled={savingParticipation}
            onPress={confirmParticipation}
            style={[styles.participationRow, largeText && styles.stack]}
          >
            <View style={styles.participationCopy}>
              <Text style={styles.splitName}>
                {expense.settlementParticipation === "INCLUDED"
                  ? "Included in group settlement"
                  : "Not included in group settlement"}
              </Text>
              <Text style={styles.meta}>
                {expense.settlementParticipation === "INCLUDED"
                  ? "Participant shares affect who owes whom."
                  : "This Expense remains in Spending and analysis but creates no inter-member debt."}
              </Text>
            </View>
            <Text style={styles.change}>
              {savingParticipation ? "Saving…" : "Change"}
            </Text>
          </Pressable>
          {participationError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {participationError}
            </Text>
          ) : null}
        </Section>
      ) : null}
      <Section label="PAYER EVIDENCE">
        {expense.paymentRecords.length ? (
          expense.paymentRecords.map((record) => (
            <View key={record.id} style={styles.evidence}>
              <Text style={styles.splitName}>
                {record.instrumentLabel ?? "Payment record"}
              </Text>
              <Text style={styles.meta}>
                {record.posted
                  ? `Posted ${formatLedgerMoney(record.posted.minor, record.posted.currency, record.posted.scale)}`
                  : "No posted amount"}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>No payer evidence recorded.</Text>
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { backgroundColor: "#F6F7F9", gap: 14, padding: 16, paddingBottom: 40 },
  title: { color: "#111827", fontSize: 28, fontWeight: "800" },
  meta: { color: "#64748B", fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: {
    backgroundColor: "#CCFBF1",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 44,
    padding: 11,
  },
  actionText: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  warning: { backgroundColor: "#FFF7DB", borderRadius: 10, gap: 4, padding: 13 },
  warningTitle: { color: "#7C5B00", fontWeight: "700" },
  saved: {
    backgroundColor: "#CCFBF1",
    borderRadius: 9,
    color: "#0F766E",
    fontSize: 14,
    fontWeight: "700",
    padding: 12,
  },
  section: { backgroundColor: "#FFFFFF", borderRadius: 10, gap: 8, padding: 14 },
  label: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  value: { color: "#111827", fontSize: 23, fontWeight: "800" },
  split: {
    alignItems: "center",
    borderTopColor: "#E5E7EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
  splitName: { color: "#111827", fontSize: 15, fontWeight: "600" },
  splitAmount: { color: "#111827", fontSize: 14 },
  evidence: {
    borderTopColor: "#E5E7EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingTop: 8,
  },
  participationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 44,
  },
  participationCopy: { flex: 1, gap: 4 },
  change: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  error: { color: "#B91C1C", fontSize: 13 },
  stack: { alignItems: "flex-start", flexDirection: "column", paddingVertical: 8 },
});
