import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { type Href, router } from "expo-router";

import { prototypeBalances } from "./fixtures";
import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import {
  formatMoney,
  Icon,
  PrimaryButton,
  PrototypeBanner,
  Section,
  Separator,
  ValueBlock,
} from "./ui";

export function SettlementScreen() {
  const { expenses, finalizeSettlement, settlementFinalized, transfers } =
    useLedgerPrototype();
  const conflict = expenses.find((expense) => expense.status === "CONFLICT");

  const prepare = () => {
    if (conflict) {
      Alert.alert(
        "Resolve one financial conflict",
        "Settlement stays draft until the Apartment groceries split is reviewed.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Review",
            onPress: () => router.push(`/expenses/expense/${conflict.id}` as Href),
          },
        ],
      );
      return;
    }
    Alert.alert(
      "Finalize settlement preview?",
      "This only updates isolated prototype state.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finalize", onPress: finalizeSettlement },
      ],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PrototypeBanner />
      <ValueBlock
        detail="Five travellers · minimized plan"
        label="SETTLEMENT STATUS"
        tone={conflict ? "warning" : "positive"}
        value={
          settlementFinalized
            ? "Final statement ready"
            : conflict
              ? "1 item needs review"
              : "Ready to finalize"
        }
      />

      {conflict ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/expenses/expense/${conflict.id}` as Href)}
          style={({ pressed }) => [styles.warningCard, pressed ? styles.pressed : null]}
        >
          <Icon color={colors.danger} name="exclamationmark.triangle.fill" />
          <View style={styles.grow}>
            <Text style={styles.warningTitle}>Apartment groceries</Text>
            <Text style={styles.detail}>
              Amount and participant conflict blocks finalization
            </Text>
          </View>
          <Icon name="chevron.right" size={14} />
        </Pressable>
      ) : null}

      <Section title="Net positions">
        {prototypeBalances.map((balance, index) => (
          <View key={balance.name}>
            {index > 0 ? <Separator /> : null}
            <View style={styles.balanceRow}>
              <Text style={styles.rowTitle}>{balance.name}</Text>
              <Text
                style={[
                  styles.balanceAmount,
                  balance.amountMinor >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {balance.amountMinor >= 0 ? "Receives " : "Owes "}
                {formatMoney(Math.abs(balance.amountMinor), "NZD")}
              </Text>
            </View>
          </View>
        ))}
      </Section>

      <Section title="Minimized transfers">
        {transfers.map((transfer, index) => (
          <View key={transfer.id}>
            {index > 0 ? <Separator /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/expenses/transfer/${transfer.id}` as Href)}
              style={({ pressed }) => [
                styles.transferRow,
                pressed ? styles.pressed : null,
              ]}
            >
              <Icon
                color={transfer.status === "SETTLED" ? colors.accent : colors.warning}
                name={
                  transfer.status === "SETTLED" ? "checkmark.circle.fill" : "clock.fill"
                }
                size={24}
              />
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>
                  {transfer.from} pays {transfer.to}
                </Text>
                <Text style={styles.detail}>
                  {transfer.status === "SETTLED"
                    ? "Paid and received"
                    : transfer.status === "AWAITING_CONFIRMATION"
                      ? "Waiting for received confirmation"
                      : transfer.status === "PARTIALLY_PAID"
                        ? "Partially paid"
                        : "Not paid"}
                </Text>
              </View>
              <Text style={styles.transferAmount}>
                {formatMoney(transfer.amount.minor, transfer.amount.currency)}
              </Text>
              <Icon name="chevron.right" size={13} />
            </Pressable>
          </View>
        ))}
      </Section>

      <Section title="Cross-currency repayment">
        <View style={styles.infoRow}>
          <Icon color={colors.blue} name="globe" size={23} />
          <Text style={styles.infoText}>
            Transfers are owed in NZD. A payer may send EUR, but the app records the
            agreed transfer rate and both currency amounts without changing the settled
            NZD debt.
          </Text>
        </View>
      </Section>
      <PrimaryButton
        icon="checkmark.seal.fill"
        label={settlementFinalized ? "Statement Finalized" : "Review & Finalize"}
        onPress={prepare}
        disabled={settlementFinalized}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          Alert.alert(
            "Share preview",
            "A real build will export a readable statement with expense and rate drill-downs.",
          )
        }
        style={styles.shareButton}
      >
        <Icon color={colors.blue} name="square.and.arrow.up" />
        <Text style={styles.shareText}>Preview Shareable Statement</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  grow: { flex: 1 },
  pressed: { opacity: 0.65 },
  warningCard: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    padding: 14,
  },
  warningTitle: { color: colors.danger, fontSize: 16, fontWeight: "700" },
  detail: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, marginTop: 3 },
  balanceRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 50,
    paddingHorizontal: 14,
  },
  rowTitle: { color: colors.label, flex: 1, fontSize: 16, fontWeight: "600" },
  balanceAmount: { fontSize: 15, fontWeight: "600" },
  positive: { color: colors.accent },
  negative: { color: colors.danger },
  transferRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    minHeight: 64,
    padding: 14,
  },
  transferAmount: { color: colors.label, fontSize: 16, fontWeight: "700" },
  infoRow: { alignItems: "flex-start", flexDirection: "row", gap: 12, padding: 14 },
  infoText: { color: colors.label, flex: 1, fontSize: 15, lineHeight: 21 },
  shareButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  shareText: { color: colors.blue, fontSize: 17, fontWeight: "600" },
});
