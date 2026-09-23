import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { useLedgerReview } from "@/hooks/useLedgerReview";
import { formatLedgerMoney } from "./format";
import { reviewEvidence } from "./reviewEvidence";

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
  const { act, findings, memberNames, message, loading, isSubmitting } =
    useLedgerReview(journeyId);
  const finding = findings.find((item) => item.id === id);

  if (!finding)
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>
          {loading ? "Loading finding…" : "This finding is no longer available here."}
        </Text>
      </View>
    );

  const copy = reviewFindingCopy(finding);
  const context = finding.observationContext;
  const expenseTitle = String(
    context?.expenseTitleSnapshot ?? context?.targetTitleSnapshot ?? "Financial item",
  );
  const money = context?.originalMoney as
    { minor: number; currency: string; scale: number } | undefined;
  const evidence = reviewEvidence(finding, memberNames);

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
            What we observed
          </Text>
          <Text style={styles.body}>{copy.why}</Text>
          {evidence.map(([label, description]) => (
            <View key={label} style={styles.evidenceRow}>
              <Text style={styles.meta}>{label}</Text>
              <Text style={styles.itemTitle}>{description}</Text>
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Affected item
          </Text>
          <Text style={styles.itemTitle}>{expenseTitle}</Text>
          {context?.expenseDateSnapshot ? (
            <Text style={styles.meta}>{String(context.expenseDateSnapshot)}</Text>
          ) : null}
          {money ? (
            <Text style={styles.body}>
              {formatLedgerMoney(money.minor, money.currency, money.scale)}
            </Text>
          ) : null}
          {finding.expenseId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/expenses/expense/${finding.expenseId}`)}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>Review Expense</Text>
            </Pressable>
          ) : null}
          {finding.ruleId === "POSSIBLE_DUPLICATE" &&
          typeof context?.matchedExpenseId === "string" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/expenses/expense/${context.matchedExpenseId}`)}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Open matching Expense</Text>
            </Pressable>
          ) : null}
        </View>
        {canActOnFinding(finding) ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Your decision
            </Text>
            <Text style={styles.body}>
              Acknowledge or dismiss this finding for yourself. Neither action edits or
              resolves the source item.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                selected: finding.status === "ACKNOWLEDGED",
                disabled: isSubmitting || finding.status === "ACKNOWLEDGED",
              }}
              disabled={isSubmitting || finding.status === "ACKNOWLEDGED"}
              onPress={() => void act(finding.id, "ACKNOWLEDGED", "")}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>
                {finding.status === "ACKNOWLEDGED" ? "Acknowledged" : "Acknowledge"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                selected: finding.status === "DISMISSED",
                disabled: isSubmitting || finding.status === "DISMISSED",
              }}
              disabled={isSubmitting || finding.status === "DISMISSED"}
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
  evidenceRow: { borderTopColor: "#E2E8F0", borderTopWidth: 1, gap: 4, paddingTop: 10 },
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
