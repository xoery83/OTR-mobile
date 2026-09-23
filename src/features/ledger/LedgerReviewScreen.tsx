import { useMemo, useState } from "react";
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { useLedgerReview } from "@/hooks/useLedgerReview";
import { reviewCardEvidence } from "./reviewEvidence";
import { reviewInbox, type ReviewCategory } from "./reviewInbox";
import { reviewFindingCopy, reviewStatusLabel } from "./settlementPresentation";

export function LedgerReviewScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const { findings, memberNames, message, loading, rechecking } =
    useLedgerReview(journeyId);
  const [category, setCategory] = useState<ReviewCategory>("All");
  const [expanded, setExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const inbox = useMemo(() => reviewInbox(findings, category), [findings, category]);

  if (rechecking)
    return (
      <>
        <Stack.Screen options={{ title: "Review" }} />
        <View style={styles.content}>
          <Text accessibilityLiveRegion="polite" style={styles.subtitle}>
            Updating Review after Expense change…
          </Text>
        </View>
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: "Review" }} />
      <SectionList
        contentContainerStyle={styles.content}
        sections={[
          { title: "OPEN", data: inbox.pending },
          { title: "REVIEWED", data: expanded ? inbox.reviewed : [] },
          { title: "HISTORY", data: historyExpanded ? inbox.history : [] },
        ]}
        keyExtractor={(finding) => finding.id}
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.subtitle}>
              {inbox.counts.All} item{inbox.counts.All === 1 ? "" : "s"} need a decision
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {inbox.visibleCategories.map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${inbox.counts[name]} pending`}
                  accessibilityState={{ selected: inbox.selectedCategory === name }}
                  onPress={() => setCategory(name)}
                  style={[
                    styles.chip,
                    inbox.selectedCategory === name && styles.selectedChip,
                  ]}
                >
                  <Text
                    style={
                      inbox.selectedCategory === name
                        ? styles.selectedChipText
                        : styles.chipText
                    }
                  >
                    {name} {inbox.counts[name]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {message ? (
              <Text accessibilityLiveRegion="polite" style={styles.message}>
                {message}
              </Text>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.title === "OPEN" ? (
            <View>
              <Text style={styles.section}>OPEN</Text>
              {!inbox.pending.length ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>
                    {loading
                      ? "Loading Review…"
                      : inbox.selectedCategory === "All" && !inbox.counts.All
                        ? "Nothing needs review"
                        : "No open items in this category"}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : section.title === "REVIEWED" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reviewed ${inbox.reviewedTotal}`}
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((value) => !value)}
              style={styles.accordion}
            >
              <Text style={styles.section}>
                {expanded ? "⌄" : "›"} Reviewed {inbox.reviewedTotal}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`History ${inbox.history.length}`}
              accessibilityState={{ expanded: historyExpanded }}
              onPress={() => setHistoryExpanded((value) => !value)}
              style={styles.accordion}
            >
              <Text style={styles.section}>
                {historyExpanded ? "⌄" : "›"} History {inbox.history.length}
              </Text>
            </Pressable>
          )
        }
        renderItem={({ item: finding }) => {
          const copy = reviewFindingCopy(finding);
          const context = finding.observationContext;
          const title = String(
            context?.expenseTitleSnapshot ??
              context?.targetTitleSnapshot ??
              "Financial item",
          );
          const date = String(context?.expenseDateSnapshot ?? "");
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${copy.title}, ${title}, ${reviewStatusLabel(finding.status)}`}
              onPress={() =>
                router.push({
                  pathname: "/expenses/review/[id]",
                  params: { id: finding.id, journeyId },
                } as never)
              }
              style={styles.card}
            >
              <View style={styles.grow}>
                <Text style={styles.category}>
                  {finding.origin === "HUMAN"
                    ? `Raised by ${memberNames[finding.authorMemberId ?? ""] ?? "a member"}`
                    : finding.ruleCategory}
                </Text>
                <Text style={styles.cardTitle}>{copy.title}</Text>
                <Text style={styles.expenseTitle}>
                  {title}
                  {date ? ` · ${date}` : ""}
                </Text>
                <Text numberOfLines={1} style={styles.meta}>
                  {reviewCardEvidence(finding)}
                </Text>
                {finding.personalDecision !== "NEEDS_REVIEW" ? (
                  <Text style={styles.reviewed}>{reviewStatusLabel(finding.status)}</Text>
                ) : null}
              </View>
              <Text importantForAccessibility="no" style={styles.chevron}>
                ›
              </Text>
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10, padding: 16, paddingBottom: 40 },
  header: { gap: 12, paddingBottom: 8 },
  subtitle: { color: "#334155", fontSize: 18, fontWeight: "700" },
  message: { color: "#0F766E", fontSize: 14 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: {
    borderColor: "#CBD5E1",
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  selectedChip: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  chipText: { color: "#334155", fontWeight: "700" },
  selectedChipText: { color: "#FFFFFF", fontWeight: "700" },
  section: { color: "#64748B", fontSize: 14, fontWeight: "800", paddingVertical: 10 },
  accordion: { minHeight: 48, justifyContent: "center" },
  emptyCard: { backgroundColor: "#E7F5F2", borderRadius: 14, padding: 18 },
  emptyTitle: { color: "#0F766E", fontSize: 18, fontWeight: "700" },
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    flexDirection: "row",
    minHeight: 108,
    padding: 14,
  },
  grow: { flex: 1 },
  category: { color: "#0F766E", fontSize: 12, fontWeight: "700" },
  cardTitle: { color: "#0F172A", fontSize: 17, fontWeight: "800" },
  expenseTitle: { color: "#334155", fontSize: 15, marginTop: 3 },
  meta: { color: "#64748B", fontSize: 14, marginTop: 4 },
  reviewed: { color: "#0F766E", fontSize: 13, fontWeight: "700", marginTop: 5 },
  chevron: { color: "#64748B", fontSize: 26 },
});
