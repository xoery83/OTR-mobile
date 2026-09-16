import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { useLedgerReview } from "@/hooks/useLedgerReview";

import { reviewFindingCopy, reviewStatusLabel } from "./settlementPresentation";

export function LedgerReviewScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const { expenseTitles, findings, counts, message } = useLedgerReview(journeyId);
  const actionableCount = counts.pending;

  return (
    <>
      <Stack.Screen options={{ title: "Review" }} />
      <FlatList
        contentContainerStyle={styles.content}
        data={findings}
        initialNumToRender={12}
        keyExtractor={(finding) => finding.id}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              Nothing needs review
            </Text>
            <Text style={styles.meta}>Your cached Ledger findings are clear.</Text>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.subtitle}>
              {actionableCount
                ? `${actionableCount} item${actionableCount === 1 ? "" : "s"} need a decision.`
                : "No current findings need a decision."}
            </Text>
            <Text style={styles.meta}>
              Review actions record your decision but never change an Expense by
              themselves.
            </Text>
            {message ? (
              <Text accessibilityLiveRegion="polite" style={styles.message}>
                {message}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item: finding }) => {
          const copy = reviewFindingCopy(finding);
          const expenseTitle = finding.expenseId
            ? (expenseTitles[finding.expenseId] ?? "Expense")
            : "Current Journey";
          return (
            <Pressable
              accessibilityLabel={`${copy.title}, ${expenseTitle}, ${reviewStatusLabel(finding.status)}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/expenses/review/[id]",
                  params: { id: finding.id, journeyId },
                } as never)
              }
              style={styles.card}
            >
              <View style={styles.grow}>
                <Text style={styles.cardTitle}>{copy.title}</Text>
                <Text style={styles.expenseTitle}>{expenseTitle}</Text>
                <Text numberOfLines={2} style={styles.meta}>
                  {copy.why}
                </Text>
                <Text
                  style={finding.status === "OPEN" ? styles.needsReview : styles.resolved}
                >
                  {reviewStatusLabel(finding.status)}
                </Text>
              </View>
              <Text importantForAccessibility="no" style={styles.chevron}>
                ›
              </Text>
            </Pressable>
          );
        }}
        windowSize={7}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10, padding: 16, paddingBottom: 40 },
  header: { gap: 7, paddingBottom: 6 },
  subtitle: { color: "#334155", fontSize: 17, fontWeight: "700" },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  emptyCard: { backgroundColor: "#E7F5F2", borderRadius: 14, gap: 6, padding: 18 },
  emptyTitle: { color: "#0F766E", fontSize: 19, fontWeight: "800" },
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    minHeight: 116,
    padding: 14,
  },
  grow: { flex: 1 },
  cardTitle: { color: "#0F172A", fontSize: 17, fontWeight: "800" },
  expenseTitle: { color: "#334155", fontSize: 15, fontWeight: "700", marginTop: 2 },
  needsReview: { color: "#9A3412", fontSize: 13, fontWeight: "800", marginTop: 5 },
  resolved: { color: "#0F766E", fontSize: 13, fontWeight: "800", marginTop: 5 },
  chevron: { color: "#64748B", fontSize: 26 },
});
