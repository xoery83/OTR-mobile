import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import { formatLedgerMoney } from "./format";

export function LedgerExpenseDetailScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [expense, setExpense] = useState<LedgerExpense | null>(null);
  const [hasOpenConflict, setHasOpenConflict] = useState(false);
  useEffect(() => {
    if (id) {
      void Promise.all([
        getDefaultLedgerExpenseRepository().then((repository) =>
          repository.getExpense(id),
        ),
        getDefaultLedgerReportingRepository().then((repository) =>
          repository.hasOpenConflict(id),
        ),
      ]).then(([nextExpense, nextHasOpenConflict]) => {
        setExpense(nextExpense);
        setHasOpenConflict(nextHasOpenConflict);
      });
    }
  }, [id]);
  if (!expense)
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Expense not found in the local Ledger.</Text>
      </View>
    );
  const valuation = expense.valuation;
  const participantNames = new Map(
    expense.participants.map((item) => [item.memberId, item.displayNameSnapshot]),
  );
  const excluded = expense.status !== "ACCEPTED" || hasOpenConflict || !valuation;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {expense.title}
      </Text>
      <Text style={styles.meta}>
        {expense.category} · {expense.occurredAt}
      </Text>
      {excluded ? (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>
            Excluded from authoritative settlement-currency totals
          </Text>
          <Text style={styles.meta}>
            {hasOpenConflict
              ? "An open conflict requires explicit resolution."
              : "A valid settlement valuation is required."}
          </Text>
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
              {valuation.policy}
              {valuation.decimalRate ? ` · rate ${valuation.decimalRate}` : ""}
            </Text>
            {valuation.reason ? (
              <Text style={styles.meta}>Reason: {valuation.reason}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>No accepted valuation</Text>
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
      <Section label="REPORTING IDENTITY">
        <Text selectable style={styles.identity}>
          {expense.id}
        </Text>
        <Text style={styles.meta}>
          Revision {expense.revision} · {expense.syncStatus} · {expense.status}
        </Text>
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
  warning: { backgroundColor: "#FFF7DB", borderRadius: 10, gap: 4, padding: 13 },
  warningTitle: { color: "#7C5B00", fontWeight: "700" },
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
  identity: { color: "#334155", fontSize: 12 },
  stack: { alignItems: "flex-start", flexDirection: "column", paddingVertical: 8 },
});
