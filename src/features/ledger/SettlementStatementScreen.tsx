import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney, formatValuationPolicy } from "./format";

export function SettlementStatementScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const settlement = useStage7Settlement(journeyId);
  const finalized = settlement.finalized;
  const rows = settlement.lineage.length
    ? settlement.lineage
    : finalized
      ? [finalized]
      : [];
  const canExport =
    settlement.isOrganizer &&
    finalized?.adjustmentState === "CURRENT" &&
    rows
      .flatMap((row) => row.transfers)
      .every(
        (transfer) =>
          transfer.status === "SETTLED" &&
          transfer.confirmedRemaining.minor === 0 &&
          transfer.awaitingAmount.minor === 0,
      );

  if (!finalized)
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>
          {settlement.updating
            ? "Loading Statement…"
            : "No final settlement is available."}
        </Text>
      </View>
    );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text accessibilityRole="header" style={styles.title}>
        Settlement statement
      </Text>
      <Text style={styles.body}>
        This explains the accepted Expenses, allocated shares and payments behind the
        final settlement.
      </Text>
      {settlement.message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {settlement.message}
        </Text>
      ) : null}

      {(finalized.outstandingBalances ?? []).length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Outstanding
          </Text>
          {(finalized.outstandingBalances ?? []).map((balance) => (
            <View key={balance.memberId} style={[styles.row, largeText && styles.stack]}>
              <Text style={[styles.rowTitle, styles.grow]}>
                {balance.displayNameSnapshot}
              </Text>
              <Text style={styles.amount}>
                {formatLedgerMoney(
                  balance.amount.minor,
                  balance.amount.currency,
                  balance.amount.scale,
                )}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {rows.map((row, index) => (
        <View key={row.id} style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {index === 0 ? "Final settlement basis" : "Settlement update"}
          </Text>
          {row.balances.map((balance) => (
            <View key={balance.memberId} style={styles.card}>
              <Text style={styles.rowTitle}>{balance.displayNameSnapshot}</Text>
              <Text style={styles.meta}>
                Paid{" "}
                {formatLedgerMoney(balance.paidMinor, balance.currency, balance.scale)} ·
                Share{" "}
                {formatLedgerMoney(balance.owedMinor, balance.currency, balance.scale)}
              </Text>
            </View>
          ))}
          {row.inputs.map((input) => (
            <Pressable
              accessibilityRole="button"
              key={input.expenseId}
              onPress={() => router.push(`/expenses/expense/${input.expenseId}`)}
              style={styles.card}
            >
              <Text style={styles.rowTitle}>
                {input.payer.displayNameSnapshot} paid{" "}
                {formatLedgerMoney(
                  input.original.minor,
                  input.original.currency,
                  input.original.scale,
                )}
              </Text>
              <Text style={styles.meta}>
                {formatValuationPolicy(input.valuation.policy)} · {input.splits.length}{" "}
                share{input.splits.length === 1 ? "" : "s"}
              </Text>
              {input.splits.map((split) => (
                <Text key={split.member.memberId} style={styles.meta}>
                  {split.member.displayNameSnapshot}:{" "}
                  {formatLedgerMoney(
                    split.settlementMinor,
                    input.settlement.currency,
                    input.settlement.scale,
                  )}
                </Text>
              ))}
            </Pressable>
          ))}
        </View>
      ))}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Export
        </Text>
        {canExport ? (
          <View style={styles.actions}>
            {(["PDF", "CSV"] as const).map((format) => (
              <Pressable
                accessibilityRole="button"
                disabled={settlement.busy}
                key={format}
                onPress={() => choosePrivacy(format, settlement.generateExport)}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Generate {format}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.meta}>
            A new export requires organizer access, an online check and all payments to be
            received. Cached exports remain available offline.
          </Text>
        )}
        {settlement.exports.map((item) => (
          <View
            key={`${item.statementDigest}-${item.privacyMode}-${item.format}`}
            style={[styles.row, largeText && styles.stack]}
          >
            <View style={styles.grow}>
              <Text style={styles.rowTitle}>
                {item.format} ·{" "}
                {item.privacyMode === "MEMBER" ? "Member names" : "De-identified"}
              </Text>
              <Text style={item.isCurrent ? styles.current : styles.earlier}>
                {item.isCurrent ? "Current" : "Earlier version"}
              </Text>
            </View>
            {settlement.isOrganizer ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void settlement.shareExport(item)}
                style={styles.shareButton}
              >
                <Text style={styles.secondaryText}>Share</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function choosePrivacy(
  format: "PDF" | "CSV",
  generate: (format: "PDF" | "CSV", privacy: "MEMBER" | "DE_IDENTIFIED") => void,
) {
  Alert.alert(
    `Generate ${format}`,
    "Member exports contain names and financial amounts. Once shared, the recipient controls the file.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "De-identified", onPress: () => generate(format, "DE_IDENTIFIED") },
      { text: "Member names", onPress: () => generate(format, "MEMBER") },
    ],
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  title: { color: "#0F172A", fontSize: 26, fontWeight: "800" },
  body: { color: "#334155", fontSize: 15, lineHeight: 22 },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  section: { gap: 8 },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 10, gap: 4, padding: 12 },
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
  amount: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  stack: { alignItems: "flex-start", flexDirection: "column" },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  current: { color: "#0F766E", fontSize: 13, fontWeight: "700" },
  earlier: { color: "#9A3412", fontSize: 13, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondary: {
    alignItems: "center",
    borderColor: "#0F766E",
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  shareButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  secondaryText: { color: "#0F766E", fontSize: 15, fontWeight: "800" },
});
