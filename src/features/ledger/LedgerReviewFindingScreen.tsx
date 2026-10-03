import { formatLedgerDate } from "./format";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { systemMessage } from "@/ui/domainLabels";
import { MoneyText } from "./MoneyText";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { useLedgerReview } from "@/hooks/useLedgerReview";
import { reviewEvidence } from "./reviewEvidence";

import {
  canActOnFinding,
  reviewFindingCopy,
  reviewStatusLabel,
} from "./settlementPresentation";

export function LedgerReviewFindingScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
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
          {loading ? t("reviewFlow.copy15") : t("reviewFlow.copy16")}
        </Text>
      </View>
    );

  const copy = reviewFindingCopy(finding);
  const context = finding.observationContext;
  const expenseTitle = String(
    context?.expenseTitleSnapshot ??
      context?.targetTitleSnapshot ??
      t("reviewFlow.copy13"),
  );
  const money = context?.originalMoney as
    { minor: number; currency: string; scale: number } | undefined;
  const evidence = reviewEvidence(finding, memberNames);

  return (
    <>
      <Stack.Screen options={{ title: t("navigation.finding") }} />
      <ScrollView
        style={styles.viewport}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.hero}>
          <Text accessibilityRole="header" style={styles.title}>
            {finding.origin === "HUMAN" && finding.humanNote?.trim()
              ? copy.title
              : systemMessage(copy.title)}
          </Text>
          <Text style={finding.status === "OPEN" ? styles.needsReview : styles.status}>
            {systemMessage(reviewStatusLabel(finding.status))}
          </Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t("reviewFlow.copy17")}
          </Text>
          <Text style={styles.body}>{systemMessage(copy.why)}</Text>
          {evidence.map(([label, description]) => (
            <View key={label} style={styles.evidenceRow}>
              <Text style={styles.meta}>{systemMessage(label)}</Text>
              <Text style={styles.itemTitle}>
                {(finding.origin === "HUMAN" &&
                  label === "Raised by" &&
                  memberNames[finding.authorMemberId ?? ""]) ||
                (label === "Payer" && memberNames[String(context?.payerMemberId)]) ||
                (label === "Participants" &&
                  Array.isArray(context?.participantDisplaySnapshots) &&
                  context.participantDisplaySnapshots.length > 0)
                  ? description
                  : systemMessage(description)}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t("reviewFlow.copy18")}
          </Text>
          <Text style={styles.itemTitle}>{expenseTitle}</Text>
          {context?.expenseDateSnapshot ? (
            <Text style={styles.meta}>
              {formatLedgerDate(String(context.expenseDateSnapshot))}
            </Text>
          ) : null}
          {money ? (
            <MoneyText
              style={styles.body}
              variant="standard"
              minor={money.minor}
              currency={money.currency}
              scale={money.scale}
            />
          ) : null}
          {finding.expenseId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/expenses/expense/${finding.expenseId}`)}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>{t("reviewFlow.copy19")}</Text>
            </Pressable>
          ) : null}
          {finding.ruleId === "POSSIBLE_DUPLICATE" &&
          typeof context?.matchedExpenseId === "string" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/expenses/expense/${context.matchedExpenseId}`)}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>{t("reviewFlow.copy20")}</Text>
            </Pressable>
          ) : null}
        </View>
        {canActOnFinding(finding) ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {t("reviewFlow.copy21")}
            </Text>
            {finding.personalDecision === "NEEDS_REVIEW" ? (
              <Text style={styles.body}>{t("reviewFlow.copy22")}</Text>
            ) : (
              <View accessibilityLiveRegion="polite" style={styles.decisionNotice}>
                <Text style={styles.decisionTitle}>
                  {finding.personalDecision === "ACKNOWLEDGED"
                    ? t("reviewFlow.copy23")
                    : t("reviewFlow.copy24")}
                </Text>
                <Text style={styles.body}>{t("reviewFlow.copy25")}</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reviewFlow.copy26")}
              accessibilityState={{
                selected: finding.personalDecision === "ACKNOWLEDGED",
                disabled: isSubmitting || finding.personalDecision === "ACKNOWLEDGED",
              }}
              disabled={isSubmitting || finding.personalDecision === "ACKNOWLEDGED"}
              onPress={() => void act(finding.id, "ACKNOWLEDGED", "")}
              style={[
                styles.secondary,
                finding.personalDecision === "ACKNOWLEDGED" && styles.selectedDecision,
              ]}
            >
              <Text
                style={[
                  styles.secondaryText,
                  finding.personalDecision === "ACKNOWLEDGED" &&
                    styles.selectedDecisionText,
                ]}
              >
                {finding.personalDecision === "ACKNOWLEDGED"
                  ? t("reviewFlow.copy27")
                  : t("reviewFlow.copy28")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reviewFlow.copy29")}
              accessibilityState={{
                selected: finding.personalDecision === "DISMISSED",
                disabled: isSubmitting || finding.personalDecision === "DISMISSED",
              }}
              disabled={isSubmitting || finding.personalDecision === "DISMISSED"}
              onPress={() => void act(finding.id, "DISMISSED", "")}
              style={[
                styles.secondary,
                finding.personalDecision === "DISMISSED" && styles.selectedDecision,
              ]}
            >
              <Text
                style={[
                  styles.secondaryText,
                  finding.personalDecision === "DISMISSED" && styles.selectedDecisionText,
                ]}
              >
                {finding.personalDecision === "DISMISSED"
                  ? t("reviewFlow.copy30")
                  : t("reviewFlow.copy31")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.meta}>{t("reviewFlow.copy32")}</Text>
        )}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {systemMessage(message)}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    viewport: { flex: 1, backgroundColor: colors.background },
    center: {
      backgroundColor: colors.background,
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 24,
    },
    content: { gap: 14, padding: 16, paddingBottom: 40 },
    hero: {
      backgroundColor: colors.warningSurface,
      borderRadius: 14,
      gap: 6,
      padding: 16,
    },
    title: { color: colors.textPrimary, fontSize: 24, fontWeight: "800" },
    needsReview: { color: colors.warning, fontSize: 15, fontWeight: "800" },
    status: { color: colors.accent, fontSize: 15, fontWeight: "800" },
    card: { backgroundColor: colors.surface, borderRadius: 14, gap: 10, padding: 14 },
    evidenceRow: {
      borderTopColor: colors.separator,
      borderTopWidth: 1,
      gap: 4,
      paddingTop: 10,
    },
    sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
    itemTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
    body: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
    meta: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    message: { color: colors.accent, fontSize: 14, fontWeight: "700" },
    decisionNotice: {
      backgroundColor: colors.accentSurface,
      borderRadius: 11,
      gap: 4,
      padding: 14,
    },
    decisionTitle: { color: colors.accent, fontSize: 17, fontWeight: "800" },
    primary: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 11,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 14,
    },
    primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
    secondary: {
      alignItems: "center",
      borderColor: colors.accent,
      borderRadius: 11,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 14,
    },
    secondaryText: { color: colors.accent, fontSize: 16, fontWeight: "800" },
    selectedDecision: { backgroundColor: colors.accent },
    selectedDecisionText: { color: colors.onAccent },
  });
