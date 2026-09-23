import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { usePersonalSettlementReview } from "@/hooks/usePersonalSettlementReview";

import { formatLedgerMoney } from "./format";

export function PersonalSettlementReviewScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const review = usePersonalSettlementReview(journeyId);
  const state = review.state;
  if (!state)
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Loading personal settlement" />
        <Text style={styles.meta}>Loading your settlement…</Text>
      </View>
    );
  const statement = state.statement;
  const money = (minor: number) =>
    formatLedgerMoney(minor, statement.currency, statement.scale);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text accessibilityRole="header" style={styles.title}>
        Your settlement so far
      </Text>
      <Text style={styles.body}>
        This is your personal view of the group’s canonical settlement. Reviewing it is
        optional and does not block the organizer.
      </Text>

      <View style={styles.summary}>
        <Amount label="Paid for group" value={money(statement.paidMinor)} />
        <Amount label="Your share" value={money(statement.shareMinor)} />
        <Amount
          label={statement.settlementId ? "Final balance" : "Current balance"}
          value={`${statement.balanceMinor > 0 ? "+" : ""}${money(statement.balanceMinor)}`}
        />
      </View>

      {state.delta ? (
        <View style={styles.notice}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Updated since you reviewed
          </Text>
          <Text style={styles.deltaAmount}>
            {state.delta.netDeltaMinor > 0 ? "+" : ""}
            {money(state.delta.netDeltaMinor)}
          </Text>
          <Text style={styles.body}>
            {state.delta.changedExpenses.length} expense
            {state.delta.changedExpenses.length === 1 ? "" : "s"} changed
          </Text>
        </View>
      ) : null}

      {state.delta ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Since your last review
          </Text>
          {state.delta.changedExpenses.map((change) => (
            <Pressable
              accessibilityRole="button"
              key={change.expenseId}
              onPress={() => router.push(`/expenses/expense/${change.expenseId}`)}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>{change.expenseTitleSnapshot}</Text>
              <Text style={styles.meta}>
                Your share {money(change.oldContribution?.shareMinor ?? 0)} →{" "}
                {money(change.newContribution?.shareMinor ?? 0)}
              </Text>
              <Text style={styles.meta}>{changeReason(change.changeGroups)}</Text>
              <Text style={styles.link}>View Expense · Something looks wrong</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/expenses")}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>View spending</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/expenses/review?journeyId=${journeyId}`)}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>Open Review</Text>
        </Pressable>
      </View>

      {state.coverage.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Review coverage
          </Text>
          <Text style={styles.meta}>
            Informational only · member review is never required.
          </Text>
          {state.coverage.map((member) => (
            <View key={member.memberId} style={styles.coverageRow}>
              <Text style={styles.cardTitle}>{member.displayName}</Text>
              <Text style={styles.meta}>
                {member.reviewedAt ? "Reviewed" : "Not reviewed"}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {review.message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {review.message}
        </Text>
      ) : null}
      {state.syncStatus === "CONFLICT" ? (
        <Text style={styles.message}>
          Settlement changed before sync. Review the updated statement again.
        </Text>
      ) : state.checkpoint ? (
        <Text style={styles.meta}>
          Reviewed {new Date(state.checkpoint.reviewedAt).toLocaleString()}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={review.busy}
        onPress={() => void review.looksGood()}
        style={[styles.primary, review.busy && styles.disabled]}
      >
        <Text style={styles.primaryText}>{review.busy ? "Saving…" : "Looks good"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.amount}>{value}</Text>
    </View>
  );
}

function changeReason(groups: string[]) {
  if (groups.includes("INCLUSION"))
    return "Included people or settlement participation changed";
  if (groups.includes("PAYER")) return "Who paid changed";
  if (groups.includes("SHARE")) return "Your split changed";
  return "Amount or accepted valuation changed";
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  content: { padding: 20, gap: 18 },
  title: { fontSize: 28, fontWeight: "800", color: "#102033" },
  body: { fontSize: 16, lineHeight: 23, color: "#405064" },
  meta: { fontSize: 14, lineHeight: 20, color: "#66758a" },
  summary: { gap: 16, padding: 18, borderRadius: 18, backgroundColor: "#f3f6fa" },
  amount: { fontSize: 24, fontWeight: "800", color: "#102033" },
  deltaAmount: { fontSize: 24, fontWeight: "800", color: "#9b3d18" },
  notice: { gap: 6, padding: 18, borderRadius: 18, backgroundColor: "#fff1e8" },
  section: { gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: "#102033" },
  card: {
    gap: 6,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dde4ec",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#102033" },
  link: { fontSize: 14, fontWeight: "700", color: "#1769aa" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  secondary: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#9aabba",
  },
  secondaryText: { fontWeight: "700", color: "#26445f" },
  coverageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
  },
  primary: {
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#0b6b54",
  },
  primaryText: { color: "white", fontSize: 17, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  message: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff1e8",
    color: "#7c3519",
  },
});
