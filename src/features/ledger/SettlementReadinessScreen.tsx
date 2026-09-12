import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import {
  type Stage7Finalized,
  type Stage7Preview,
  useStage7Settlement,
} from "@/hooks/useStage7Settlement";

import { formatLedgerMoney } from "./format";

export function SettlementReadinessScreen({ journeyId }: { journeyId?: string }) {
  const settlement = useStage7Settlement(journeyId);
  const { busy, finalized, message, preview } = settlement;

  const confirmFinalize = () => {
    if (!preview || preview.state !== "PREVIEW_READY") return;
    Alert.alert(
      "Finalize settlement?",
      "This freezes the listed Expenses and creates real transfer obligations.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finalize", onPress: () => void settlement.finalize(preview) },
      ],
    );
  };

  if (!settlement.journeyId) {
    return <Text style={styles.body}>Choose a Journey to prepare settlement.</Text>;
  }

  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Settlement
      </Text>
      <Text style={styles.body}>
        Preview uses canonical server data. Suggested transfers become obligations only
        after finalization.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy || Boolean(finalized)}
        onPress={() => void settlement.prepare()}
        style={[styles.primary, busy && styles.disabled]}
      >
        <Text style={styles.primaryText}>
          {finalized ? "Settlement finalized" : "Prepare settlement"}
        </Text>
      </Pressable>
      {busy ? <ActivityIndicator accessibilityLabel="Preparing settlement" /> : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {preview ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            {preview.state === "PREVIEW_READY" ? "Ready to finalize" : "Needs attention"}
          </Text>
          <Text style={styles.meta}>
            {preview.inputs.length} included · {preview.exclusions.length} excluded
          </Text>
          {preview.blockers.map((blocker) => (
            <Pressable
              accessibilityRole="button"
              key={`${blocker.expenseId}-${blocker.reason}`}
              onPress={() => router.push(`/expenses/expense/${blocker.expenseId}`)}
              style={styles.blocker}
            >
              <Text style={styles.warning}>
                {blocker.reason === "RATE_REQUIRED" ? "Rate required" : "Open conflict"}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                Expense {blocker.expenseId}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.section}>MEMBER BALANCES</Text>
          {preview.balances.map((balance) => (
            <View key={balance.memberId} style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>{balance.displayNameSnapshot}</Text>
                <Text style={styles.meta}>
                  Covered{" "}
                  {formatLedgerMoney(balance.paidMinor, balance.currency, balance.scale)}
                  {" · "}Share{" "}
                  {formatLedgerMoney(balance.owedMinor, balance.currency, balance.scale)}
                </Text>
              </View>
              <Text style={styles.amount}>
                {formatLedgerMoney(balance.netMinor, balance.currency, balance.scale)}
              </Text>
            </View>
          ))}
          <Text style={styles.section}>SUGGESTED TRANSFERS</Text>
          {preview.transfers.map((transfer) => (
            <Text
              key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
              style={styles.body}
            >
              {name(preview, transfer.fromMemberId)} →{" "}
              {name(preview, transfer.toMemberId)} ·{" "}
              {formatLedgerMoney(
                transfer.amount.minor,
                transfer.amount.currency,
                transfer.amount.scale,
              )}
            </Text>
          ))}
          {preview.state === "PREVIEW_READY" ? (
            <Pressable
              accessibilityHint="Creates immutable transfer obligations"
              accessibilityRole="button"
              disabled={busy}
              onPress={confirmFinalize}
              style={[styles.primary, busy && styles.disabled]}
            >
              <Text style={styles.primaryText}>Finalize settlement</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {finalized ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Finalized
          </Text>
          <Text style={styles.meta}>
            {finalized.inputs.length} frozen Expenses · {finalized.transfers.length}{" "}
            obligations
          </Text>
          {finalized.transfers.map((transfer) => (
            <Text key={transfer.id} style={styles.body}>
              {memberName(finalized, transfer.fromMemberId)} →{" "}
              {memberName(finalized, transfer.toMemberId)} ·{" "}
              {formatLedgerMoney(
                transfer.amount.minor,
                transfer.amount.currency,
                transfer.amount.scale,
              )}
            </Text>
          ))}
          <Text style={styles.note}>
            Paid and Received begin in Stage 7.2. No payment action is available yet.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function name(preview: Stage7Preview, memberId: string) {
  return (
    preview.members.find((member) => member.memberId === memberId)?.displayNameSnapshot ??
    "Traveller"
  );
}

function memberName(settlement: Stage7Finalized, memberId: string) {
  return (
    settlement.balances.find((balance) => balance.memberId === memberId)
      ?.displayNameSnapshot ?? "Traveller"
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  title: { color: "#111827", fontSize: 24, fontWeight: "800" },
  body: { color: "#334155", fontSize: 16, lineHeight: 23 },
  note: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  cardTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  section: { color: "#475569", fontSize: 12, fontWeight: "800", marginTop: 6 },
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  rowTitle: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  grow: { flex: 1 },
  amount: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  meta: { color: "#64748B", fontSize: 13, lineHeight: 18 },
  blocker: { borderLeftColor: "#B45309", borderLeftWidth: 3, paddingLeft: 10 },
  warning: { color: "#B45309", fontSize: 14, fontWeight: "800" },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
