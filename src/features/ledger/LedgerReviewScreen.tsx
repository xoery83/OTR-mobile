import { formatLedgerDate } from "./format";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { systemMessage } from "@/ui/domainLabels";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { NavigationContextTitle } from "@/components/navigationChrome";
import { AppIcon } from "@/components/AppIcon";
import { visual as cv } from "@/ui/visual";
import { useLedgerReview } from "@/hooks/useLedgerReview";
import { ExpenseConflictList } from "./ExpenseConflictList";
import { reviewCardEvidence } from "./reviewEvidence";
import { reviewInbox, type ReviewCategory } from "./reviewInbox";
import { reviewFindingCopy, reviewStatusLabel } from "./settlementPresentation";

export function LedgerReviewScreen() {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const { journeyId, journeyTitle } = useLocalSearchParams<{
    journeyId?: string;
    journeyTitle?: string;
  }>();
  const header = (
    <Stack.Screen
      options={{
        headerTitle: () => (
          <NavigationContextTitle title={t("common.review")} subtitle={journeyTitle} />
        ),
      }}
    />
  );
  const { findings, memberNames, message, loading, rechecking } =
    useLedgerReview(journeyId);
  const [category, setCategory] = useState<ReviewCategory>("All");
  const [expanded, setExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const inbox = useMemo(() => reviewInbox(findings, category), [findings, category]);

  if (rechecking)
    return (
      <>
        {header}
        <View style={styles.content}>
          <Text accessibilityLiveRegion="polite" style={styles.subtitle}>
            {t("reviewFlow.copy0")}
          </Text>
        </View>
      </>
    );

  return (
    <>
      {header}
      <SectionList
        style={styles.viewport}
        contentContainerStyle={styles.content}
        sections={[
          { kind: "OPEN", data: inbox.pending },
          { kind: "REVIEWED", data: expanded ? inbox.reviewed : [] },
          { kind: "HISTORY", data: historyExpanded ? inbox.history : [] },
        ]}
        keyExtractor={(finding) => finding.id}
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={
          <View style={styles.header}>
            <ExpenseConflictList journeyId={journeyId} title={t("health.decisions")} />
            <Text accessibilityRole="header" style={styles.subtitle}>
              {t(
                inbox.counts.All === 1
                  ? "reviewFlow.pendingOne"
                  : "reviewFlow.pendingOther",
                { count: inbox.counts.All },
              )}
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
                  accessibilityLabel={t("reviewFlow.copy4", {
                    p0: systemMessage(name),
                    p1: inbox.counts[name],
                  })}
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
                    {systemMessage(name)} {inbox.counts[name]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {message ? (
              <Text accessibilityLiveRegion="polite" style={styles.message}>
                {systemMessage(message)}
              </Text>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.kind === "OPEN" ? (
            <View>
              <Text style={styles.section}>{t("reviewFlow.copy5")}</Text>
              {!inbox.pending.length ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>
                    {loading
                      ? t("reviewFlow.copy6")
                      : inbox.selectedCategory === "All" && !inbox.counts.All
                        ? t("reviewFlow.copy7")
                        : t("reviewFlow.copy8")}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : section.kind === "REVIEWED" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reviewFlow.copy9", { p0: inbox.reviewedTotal })}
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((value) => !value)}
              style={styles.accordion}
            >
              <Text style={styles.section}>
                {t("reviewFlow.copy9", { p0: inbox.reviewedTotal })}
              </Text>
              <AppIcon
                color={colors.textSecondary}
                name={expanded ? "chevron.up" : "chevron.down"}
                size={14}
              />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reviewFlow.copy11", { p0: inbox.history.length })}
              accessibilityState={{ expanded: historyExpanded }}
              onPress={() => setHistoryExpanded((value) => !value)}
              style={styles.accordion}
            >
              <Text style={styles.section}>
                {t("reviewFlow.copy11", { p0: inbox.history.length })}
              </Text>
              <AppIcon
                color={colors.textSecondary}
                name={historyExpanded ? "chevron.up" : "chevron.down"}
                size={14}
              />
            </Pressable>
          )
        }
        renderItem={({ item: finding }) => {
          const copy = reviewFindingCopy(finding);
          const context = finding.observationContext;
          const title = String(
            context?.expenseTitleSnapshot ??
              context?.targetTitleSnapshot ??
              t("reviewFlow.copy13"),
          );
          const date = String(context?.expenseDateSnapshot ?? "");
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${finding.origin === "HUMAN" && finding.humanNote?.trim() ? copy.title : systemMessage(copy.title)}, ${title}, ${systemMessage(reviewStatusLabel(finding.status))}`}
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
                    ? t("reviewFlow.copy14", {
                        p0:
                          memberNames[finding.authorMemberId ?? ""] ??
                          t("reviewFlow.label7"),
                      })
                    : systemMessage(finding.ruleCategory ?? "")}
                </Text>
                <Text style={styles.cardTitle}>
                  {finding.origin === "HUMAN" && finding.humanNote?.trim()
                    ? copy.title
                    : systemMessage(copy.title)}
                </Text>
                <Text style={styles.expenseTitle}>
                  {title}
                  {date ? ` · ${formatLedgerDate(date)}` : ""}
                </Text>
                <Text numberOfLines={1} style={styles.meta}>
                  {finding.origin === "HUMAN" && finding.humanNote
                    ? finding.humanNote
                    : systemMessage(reviewCardEvidence(finding))}
                </Text>
                {finding.personalDecision !== "NEEDS_REVIEW" ? (
                  <Text style={styles.reviewed}>
                    {systemMessage(reviewStatusLabel(finding.status))}
                  </Text>
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

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    viewport: { flex: 1, backgroundColor: colors.background },
    content: { gap: 10, padding: 16, paddingBottom: 40 },
    header: { gap: 12, paddingBottom: 8 },
    subtitle: { color: colors.textSecondary, fontSize: 18, fontWeight: "700" },
    message: { color: colors.accent, fontSize: 14 },
    chips: { gap: 8, paddingVertical: 4 },
    chip: {
      borderColor: colors.separator,
      borderRadius: 18,
      borderWidth: 1,
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    selectedChip: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.textSecondary, fontWeight: "700" },
    selectedChipText: { color: colors.onAccent, fontWeight: "700" },
    section: { color: colors.textPrimary, ...cv.type.section, paddingVertical: 10 },
    accordion: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    emptyCard: { backgroundColor: colors.accentSurface, borderRadius: 14, padding: 18 },
    emptyTitle: { color: colors.accent, fontSize: 18, fontWeight: "700" },
    card: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 14,
      flexDirection: "row",
      minHeight: 108,
      padding: 14,
    },
    grow: { flex: 1 },
    category: { color: colors.accent, fontSize: 12, fontWeight: "700" },
    cardTitle: { color: colors.textPrimary, ...cv.type.row },
    expenseTitle: { color: colors.textSecondary, fontSize: 15, marginTop: 3 },
    meta: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
    reviewed: { color: colors.accent, fontSize: 13, fontWeight: "700", marginTop: 5 },
    chevron: { color: colors.textSecondary, fontSize: 26 },
  });
