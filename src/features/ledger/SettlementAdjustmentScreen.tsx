import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney } from "./format";

export function SettlementAdjustmentScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const settlement = useStage7Settlement(journeyId);
  const [reason, setReason] = useState("");
  const preview = settlement.adjustmentPreview;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <Text style={styles.body}>
          Use this only when accepted Expenses changed after the final settlement. The
          original settlement stays intact.
        </Text>
      </View>
      {settlement.finalized?.adjustmentState === "CURRENT" && !preview ? (
        <Text style={styles.quiet}>The final settlement is up to date.</Text>
      ) : null}
      {!preview ? (
        <Pressable
          accessibilityRole="button"
          disabled={settlement.busy || !settlement.finalized}
          onPress={() => void settlement.prepareAdjustment()}
          style={[
            styles.primary,
            (settlement.busy || !settlement.finalized) && styles.disabled,
          ]}
        >
          <Text style={styles.primaryText}>Preview settlement update</Text>
        </Pressable>
      ) : null}
      {settlement.message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {settlement.message}
        </Text>
      ) : null}
      {preview ? (
        <>
          <View
            style={preview.state === "PREVIEW_BLOCKED" ? styles.warningCard : styles.card}
          >
            <Text accessibilityRole="header" style={styles.cardTitle}>
              {preview.state === "PREVIEW_BLOCKED"
                ? "Settlement update is blocked"
                : preview.state === "PREVIEW_UNCHANGED"
                  ? "No update is needed"
                  : preview.zeroTransfer
                    ? "Changes do not alter transfers"
                    : "Settlement update is ready"}
            </Text>
            <Text style={styles.body}>
              {preview.changedExpenses.length} Expense
              {preview.changedExpenses.length === 1 ? " has" : "s have"} changed since the
              final settlement.
            </Text>
          </View>

          {preview.blockers.length ? (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Resolve before continuing
              </Text>
              {preview.blockers.map((blocker) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${blocker.expenseId}-${blocker.reason}`}
                  onPress={() => router.push(`/expenses/expense/${blocker.expenseId}`)}
                  style={[styles.row, largeText && styles.stack]}
                >
                  <View style={styles.grow}>
                    <Text style={styles.rowTitle}>
                      {blocker.reason === "RATE_REQUIRED"
                        ? "Expense needs an exchange rate"
                        : "Conflicting edit needs review"}
                    </Text>
                    <Text style={styles.meta}>Open Expense</Text>
                  </View>
                  <Text importantForAccessibility="no" style={styles.chevron}>
                    ›
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {preview.balances.some((balance) => balance.deltaMinor !== 0) ? (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                What changed
              </Text>
              {preview.balances
                .filter((balance) => balance.deltaMinor !== 0)
                .map((balance) => (
                  <View
                    key={balance.memberId}
                    style={[styles.row, largeText && styles.stack]}
                  >
                    <Text style={[styles.rowTitle, styles.grow]}>
                      {balance.displayNameSnapshot}
                    </Text>
                    <Text style={styles.amount}>
                      {balance.deltaMinor > 0 ? "+" : ""}
                      {formatLedgerMoney(
                        balance.deltaMinor,
                        balance.currency,
                        balance.scale,
                      )}
                    </Text>
                  </View>
                ))}
            </View>
          ) : null}

          {preview.transfers.length ? (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Affected transfers
              </Text>
              {preview.transfers.map((transfer) => (
                <View
                  key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                  style={[styles.row, largeText && styles.stack]}
                >
                  <Text style={[styles.rowTitle, styles.grow]}>
                    {memberName(preview.balances, transfer.fromMemberId)} pays{" "}
                    {memberName(preview.balances, transfer.toMemberId)}
                  </Text>
                  <Text style={styles.amount}>
                    {formatLedgerMoney(
                      transfer.amount.minor,
                      transfer.amount.currency,
                      transfer.amount.scale,
                    )}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {preview.state === "PREVIEW_READY" && settlement.isOrganizer ? (
            <View style={styles.section}>
              <TextInput
                accessibilityLabel="Reason for Settlement update"
                multiline
                onChangeText={setReason}
                placeholder="Why is this update needed?"
                style={styles.input}
                value={reason}
              />
              <Pressable
                accessibilityRole="button"
                disabled={settlement.busy || !reason.trim()}
                onPress={() => {
                  void settlement.finalizeAdjustment(preview, reason.trim());
                  setReason("");
                }}
                style={[
                  styles.primary,
                  (settlement.busy || !reason.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.primaryText}>Confirm settlement update</Text>
              </Pressable>
            </View>
          ) : preview.state === "PREVIEW_READY" ? (
            <Text style={styles.meta}>Only an organizer can confirm this update.</Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function memberName(
  balances: { memberId: string; displayNameSnapshot: string }[],
  memberId: string,
) {
  return (
    balances.find((balance) => balance.memberId === memberId)?.displayNameSnapshot ??
    "Traveller"
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  intro: { gap: 8 },
  body: { color: "#334155", fontSize: 15, lineHeight: 22 },
  quiet: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  card: { backgroundColor: "#E7F5F2", borderRadius: 14, gap: 6, padding: 14 },
  warningCard: { backgroundColor: "#FFF7ED", borderRadius: 14, gap: 6, padding: 14 },
  cardTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  section: { gap: 8 },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    padding: 12,
  },
  grow: { flex: 1 },
  rowTitle: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  amount: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  stack: { alignItems: "flex-start", flexDirection: "column" },
  chevron: { color: "#64748B", fontSize: 24 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 84,
    padding: 12,
    textAlignVertical: "top",
  },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 16,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
