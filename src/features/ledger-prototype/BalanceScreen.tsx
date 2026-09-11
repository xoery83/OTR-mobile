import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { type Href, router } from "expo-router";

import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import { formatMoney, Icon, PrototypeBanner, Section, Separator, ValueBlock } from "./ui";

export function BalanceScreen() {
  const { expenses } = useLedgerPrototype();
  const rows = expenses.map((expense) => {
    const ownShare =
      expense.splits.find((split) => split.memberId === "leon")?.settlementMinor ?? 0;
    const paid = expense.payerMemberId === "leon" ? expense.settlement.minor : 0;
    return { expense, contribution: paid - ownShare, ownShare };
  });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PrototypeBanner />
      <ValueBlock
        detail="Across all visible prototype expenses"
        label="LEON'S NET BALANCE"
        tone="positive"
        value="You are owed $183.45"
      />
      <View style={styles.summaryRow}>
        <ValueBlock label="YOU PAID" value="$496.20" style={styles.summary} />
        <ValueBlock label="YOUR SHARE" value="$312.75" style={styles.summary} />
      </View>
      <Text style={styles.explainer}>
        Positive rows increase what you are owed. Negative rows are your exact share of an
        expense paid by another traveller.
      </Text>
      <Section title="Expense breakdown">
        {rows.map(({ expense, contribution, ownShare }, index) => (
          <View key={expense.id}>
            {index > 0 ? <Separator /> : null}
            <Pressable
              accessibilityHint="Opens the expense and its conversion evidence"
              accessibilityRole="button"
              onPress={() => router.push(`/expenses/expense/${expense.id}` as Href)}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <View style={styles.grow}>
                <Text style={styles.title}>{expense.title}</Text>
                <Text style={styles.detail}>
                  Your share {formatMoney(ownShare, "NZD")} · {expense.rateLabel}
                </Text>
              </View>
              <View style={styles.right}>
                <Text
                  style={[
                    styles.amount,
                    contribution >= 0 ? styles.positive : styles.negative,
                  ]}
                >
                  {contribution >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(contribution), "NZD")}
                </Text>
                <Icon name="chevron.right" size={13} />
              </View>
            </Pressable>
          </View>
        ))}
      </Section>
      <Section title="What this means">
        <View style={styles.infoRow}>
          <Icon color={colors.blue} name="equal.circle.fill" size={24} />
          <Text style={styles.infoText}>
            Every value drills down to payer, your exact minor-unit share, original
            merchant currency, Journey valuation, rate source and payment evidence.
          </Text>
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  summaryRow: { flexDirection: "row", gap: 10 },
  summary: { flex: 1 },
  explainer: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: 14,
  },
  pressed: { backgroundColor: "#E9E9ED" },
  grow: { flex: 1 },
  title: { color: colors.label, fontSize: 16, fontWeight: "600" },
  detail: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, marginTop: 4 },
  right: { alignItems: "center", flexDirection: "row", gap: 7 },
  amount: { fontSize: 16, fontWeight: "700" },
  positive: { color: colors.accent },
  negative: { color: colors.danger },
  infoRow: { alignItems: "flex-start", flexDirection: "row", gap: 12, padding: 14 },
  infoText: { color: colors.label, flex: 1, fontSize: 15, lineHeight: 21 },
});
