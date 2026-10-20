import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { MoneyText, type MoneyTextProps } from "./MoneyText";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { usePersonalSettlementReview } from "@/hooks/usePersonalSettlementReview";

import { formatLedgerMoney } from "./format";

export function PersonalSettlementReviewScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const review = usePersonalSettlementReview(journeyId);
  const state = review.state;
  if (!state)
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel={t("reviewFlow.copy33")} />
        <Text style={styles.meta}>{t("reviewFlow.copy34")}</Text>
      </View>
    );
  const statement = state.statement;
  const currentReviewState =
    state.pendingReviewState ??
    state.coverage.find((member) => member.memberId === statement.memberId)
      ?.reviewState ??
    state.checkpoint?.reviewState ??
    "NOT_REVIEWED";
  const money = (minor: number) =>
    formatLedgerMoney(minor, statement.currency, statement.scale);

  return (
    <ScrollView
      style={styles.viewport}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t("reviewFlow.copy35")}
      </Text>
      <Text style={styles.body}>{t("reviewFlow.copy36")}</Text>

      {statement.unresolvedSource ? (
        <Text style={styles.message}>{t("reviewFlow.copy37")}</Text>
      ) : null}
      <View style={styles.summary}>
        <Amount
          label={t("settlement.paidForGroup")}
          minor={statement.paidMinor}
          currency={statement.currency}
          scale={statement.scale}
        />
        <Amount
          label={t("settlement.yourShare")}
          minor={statement.shareMinor}
          currency={statement.currency}
          scale={statement.scale}
        />
        <Amount
          label={
            statement.settlementId ? t("reviewFlow.copy38") : t("settlement.balance")
          }
          minor={statement.balanceMinor}
          currency={statement.currency}
          scale={statement.scale}
          signed
        />
      </View>

      {state.delta ? (
        <View style={styles.notice}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t("reviewFlow.copy39")}
          </Text>
          <MoneyText
            variant="headline"
            style={styles.deltaAmount}
            minor={state.delta.netDeltaMinor}
            currency={statement.currency}
            scale={statement.scale}
            signed
          />
          <Text style={styles.body}>
            {t(
              state.delta.changedExpenses.length === 1
                ? "reviewFlow.changedOne"
                : "reviewFlow.changedOther",
              { count: state.delta.changedExpenses.length },
            )}
          </Text>
        </View>
      ) : null}

      {state.delta ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t("reviewFlow.copy42")}
          </Text>
          {state.delta.changedExpenses.map((change) => (
            <Pressable
              accessibilityRole="button"
              key={change.expenseId}
              onPress={() => router.push(`/expenses/expense/${change.expenseId}`)}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>{change.expenseTitleSnapshot}</Text>
              <Text style={styles.meta}>
                {t("reviewFlow.shareChange", {
                  before: money(change.oldContribution?.shareMinor ?? 0),
                  after: money(change.newContribution?.shareMinor ?? 0),
                })}
              </Text>
              <Text style={styles.meta}>{changeReason(change.changeGroups)}</Text>
              <Text style={styles.link}>{t("reviewFlow.copy43")}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/expenses")}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{t("reviewFlow.copy44")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/expenses/review?journeyId=${journeyId}`)}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{t("reviewFlow.copy45")}</Text>
        </Pressable>
      </View>

      {state.syncStatus === "CONFLICT" ? (
        <Text style={styles.message}>{t("reviewFlow.copy46")}</Text>
      ) : null}
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {t("reviewFlow.copy47")}
        </Text>
        <View style={styles.actions}>
          {(["LOOKS_GOOD", "STILL_CHECKING"] as const).map((reviewState) => {
            const selected = currentReviewState === reviewState;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: review.busy || !review.ready, selected }}
                disabled={review.busy || !review.ready || selected}
                key={reviewState}
                onPress={() => void review.setReviewState(reviewState)}
                style={[styles.secondary, selected && styles.selectedStatus]}
              >
                <Text style={styles.secondaryText}>
                  {reviewState === "LOOKS_GOOD"
                    ? t("settlement.looksGood")
                    : t("settlement.stillChecking")}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function Amount({ label, ...money }: MoneyTextProps & { label: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View>
      <Text style={styles.meta}>{label}</Text>
      <MoneyText variant="headline" style={styles.amount} {...money} />
    </View>
  );
}

function changeReason(groups: string[]) {
  if (groups.includes("INCLUSION")) return t("reviewFlow.copy48");
  if (groups.includes("PAYER")) return t("reviewFlow.copy49");
  if (groups.includes("SHARE")) return t("reviewFlow.copy50");
  return t("reviewFlow.copy51");
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    viewport: { flex: 1, backgroundColor: colors.background },
    center: {
      backgroundColor: colors.background,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    content: { padding: 20, gap: 18 },
    title: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
    body: { fontSize: 16, lineHeight: 23, color: colors.textSecondary },
    meta: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
    summary: { gap: 16, padding: 18, borderRadius: 18, backgroundColor: colors.surface },
    amount: { fontSize: 24, fontWeight: "800", color: colors.textPrimary },
    deltaAmount: { fontSize: 24, fontWeight: "800", color: colors.warning },
    notice: {
      gap: 6,
      padding: 18,
      borderRadius: 18,
      backgroundColor: colors.warningSurface,
    },
    section: { gap: 10 },
    sectionTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
    card: {
      gap: 6,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    cardTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    link: { fontSize: 14, fontWeight: "700", color: colors.accent },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    secondary: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    secondaryText: { fontWeight: "700", color: colors.textPrimary },
    selectedStatus: { backgroundColor: colors.selected, borderColor: colors.accent },
    message: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.warningSurface,
      color: colors.warning,
    },
  });
