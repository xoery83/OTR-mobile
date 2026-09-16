import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { useLedgerReview } from "@/hooks/useLedgerReview";

import {
  canActOnFinding,
  reviewFindingCopy,
  reviewStatusLabel,
} from "./settlementPresentation";

export function LedgerReviewFindingScreen() {
  const { id, journeyId } = useLocalSearchParams<{
    id: string;
    journeyId?: string;
  }>();
  const { act, expenseTitles, findings, message } = useLedgerReview(journeyId);
  const finding = findings.find((item) => item.id === id);

  if (!finding)
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Loading finding…</Text>
      </View>
    );

  const copy = reviewFindingCopy(finding);
  const expenseTitle = finding.expenseId
    ? (expenseTitles[finding.expenseId] ?? "Expense")
    : "Current Journey";

  return (
    <>
      <Stack.Screen options={{ title: "Finding" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.hero}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.title}
          </Text>
          <Text style={finding.status === "OPEN" ? styles.needsReview : styles.status}>
            {reviewStatusLabel(finding.status)}
          </Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Why it matters
          </Text>
          <Text style={styles.body}>{copy.why}</Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Affected item
          </Text>
          <Text style={styles.itemTitle}>{expenseTitle}</Text>
          {finding.expenseId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/expenses/expense/${finding.expenseId}`)}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>Review Expense</Text>
            </Pressable>
          ) : null}
        </View>
        {canActOnFinding(finding) ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Your decision
            </Text>
            <Text style={styles.body}>
              Acknowledge or dismiss this finding for yourself. Neither action edits the
              Expense.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: finding.status === "ACKNOWLEDGED" }}
              disabled={finding.status === "ACKNOWLEDGED"}
              onPress={() => void act(finding.id, "ACKNOWLEDGED", "")}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>
                {finding.status === "ACKNOWLEDGED" ? "Acknowledged" : "Acknowledge"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: finding.status === "DISMISSED" }}
              disabled={finding.status === "DISMISSED"}
              onPress={() => void act(finding.id, "DISMISSED", "")}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>
                {finding.status === "DISMISSED" ? "Dismissed" : "Dismiss"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.meta}>
            This finding is maintained automatically or is already closed; review the
            related Expense for the next step.
          </Text>
        )}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  hero: { backgroundColor: "#FFF7ED", borderRadius: 14, gap: 6, padding: 16 },
  title: { color: "#0F172A", fontSize: 24, fontWeight: "800" },
  needsReview: { color: "#9A3412", fontSize: 15, fontWeight: "800" },
  status: { color: "#0F766E", fontSize: 15, fontWeight: "800" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, gap: 10, padding: 14 },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  itemTitle: { color: "#0F172A", fontSize: 17, fontWeight: "700" },
  body: { color: "#334155", fontSize: 15, lineHeight: 22 },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 11,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondary: {
    alignItems: "center",
    borderColor: "#0F766E",
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  secondaryText: { color: "#0F766E", fontSize: 16, fontWeight: "800" },
});
