import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { t, getFormatLocale } from "@/ui/locale";
import { systemMessage } from "@/ui/domainLabels";
import { MoneyText } from "./MoneyText";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";

import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney, formatValuationPolicy } from "./format";
import { settlementBalanceLabel, settlementHistory } from "./settlementHistory";

export function SettlementStatementScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const largeText = useWindowDimensions().fontScale > 2;
  const { journeyId, versionId, view } = useLocalSearchParams<{
    journeyId?: string;
    versionId?: string;
    view?: string;
  }>();
  const settlement = useStage7Settlement(journeyId);
  const finalized = settlement.finalized;
  const allRows = settlement.lineage.length
    ? settlement.lineage
    : finalized
      ? [finalized]
      : [];
  const selected = versionId ? allRows.find((row) => row.id === versionId) : null;
  const history = settlement.actorMemberId
    ? settlementHistory(allRows, settlement.actorMemberId)
    : [];
  const selectedHistory = history.find(({ row }) => row.id === versionId);
  const rows = selected ? [selected] : allRows;
  const selectedIndex = selected
    ? allRows.findIndex((row) => row.id === selected.id)
    : -1;
  const previous = selectedIndex > 0 ? allRows[selectedIndex - 1] : null;
  const [showComparison, setShowComparison] = useState(false);
  const canExport =
    settlement.isOrganizer &&
    finalized?.adjustmentState === "CURRENT" &&
    allRows
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
          {settlement.updating ? t("reviewFlow.copy92") : t("reviewFlow.copy93")}
        </Text>
      </View>
    );

  if (view !== "statement") {
    const entries = selectedHistory ? [selectedHistory] : [...history].reverse();
    return (
      <ScrollView
        style={styles.viewport}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {selectedHistory ? (
          <Text accessibilityRole="header" style={styles.title}>
            {t("reviewFlow.copy94")}
            {(selectedHistory.row.lineageSequence ?? 0) + 1}
          </Text>
        ) : null}
        {!settlement.actorMemberId ? (
          <Text style={styles.meta}>{t("reviewFlow.copy95")}</Text>
        ) : null}
        {entries.map(({ row, balanceMinor, deltaMinor, isCurrent }) => {
          const version = (row.lineageSequence ?? 0) + 1;
          const label = settlementBalanceLabel(balanceMinor);
          const date = new Intl.DateTimeFormat(getFormatLocale(), {
            day: "numeric",
            month: "short",
            year: "numeric",
          }).format(new Date(row.finalizedAt));
          const body = (
            <>
              {!selectedHistory ? (
                <Text style={styles.rowTitle}>
                  {t("reviewFlow.copy96")}
                  {version}
                  {isCurrent ? t("reviewFlow.copy97") : ""}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {selectedHistory ? t("reviewFlow.copy98", { p0: date }) : date}
              </Text>
              <Text style={styles.meta}>
                {selectedHistory ? t("reviewFlow.copy99") : systemMessage(label)}
              </Text>
              {selectedHistory && balanceMinor === 0 ? (
                <Text style={styles.amount}>{t("reviewFlow.copy100")}</Text>
              ) : (
                <MoneyText
                  variant={selectedHistory ? "headline" : "standard"}
                  style={styles.amount}
                  minor={Math.abs(balanceMinor)}
                  currency={row.settlementCurrency}
                  scale={row.settlementScale}
                  prefix={
                    selectedHistory
                      ? `${systemMessage(balanceMinor > 0 ? "Receive" : "Pay")} `
                      : ""
                  }
                />
              )}
              {deltaMinor !== null ? (
                <Text style={styles.meta}>
                  {selectedHistory ? t("reviewFlow.copy101", { p0: version - 1 }) : ""}
                  {deltaMinor > 0 ? "+" : ""}
                  {formatLedgerMoney(
                    deltaMinor,
                    row.settlementCurrency,
                    row.settlementScale,
                  )}
                  {selectedHistory ? "" : t("reviewFlow.copy102", { p0: version - 1 })}
                </Text>
              ) : null}
            </>
          );
          return selectedHistory ? (
            <View key={row.id} style={styles.historyItem}>
              {body}
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/expenses/settlement-statement",
                    params: { journeyId, versionId: row.id, view: "statement" },
                  } as never)
                }
                style={styles.statementLink}
              >
                <Text style={styles.secondaryText}>{t("reviewFlow.copy103")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              key={row.id}
              onPress={() =>
                router.push({
                  pathname: "/expenses/settlement-statement",
                  params: { journeyId, versionId: row.id },
                } as never)
              }
              style={styles.historyItem}
            >
              {body}
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.viewport}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {selected
          ? t("reviewFlow.copy104", { p0: (selected.lineageSequence ?? 0) + 1 })
          : t("reviewFlow.copy105")}
      </Text>
      <Text style={styles.body}>{t("reviewFlow.copy106")}</Text>
      {settlement.message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {systemMessage(settlement.message)}
        </Text>
      ) : null}

      {!selected && (finalized.outstandingBalances ?? []).length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t("reviewFlow.copy107")}
          </Text>
          {(finalized.outstandingBalances ?? []).map((balance) => (
            <View key={balance.memberId} style={[styles.row, largeText && styles.stack]}>
              <Text style={[styles.rowTitle, styles.grow]}>
                {balance.displayNameSnapshot}
              </Text>
              <MoneyText
                style={styles.amount}
                variant="standard"
                minor={balance.amount.minor}
                currency={balance.amount.currency}
                scale={balance.amount.scale}
              />
            </View>
          ))}
        </View>
      ) : null}

      {selected && previous ? (
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowComparison((visible) => !visible)}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>
              {showComparison ? t("reviewFlow.copy108") : t("reviewFlow.copy109")}
            </Text>
          </Pressable>
          {showComparison ? (
            <View style={styles.card}>
              <Text style={styles.rowTitle}>
                {t("reviewFlow.versionCompare", {
                  before: (previous.lineageSequence ?? 0) + 1,
                  after: (selected.lineageSequence ?? 0) + 1,
                })}
              </Text>
              {(selected.adjustmentDeltas ?? []).map((delta) => (
                <Text key={delta.memberId} style={styles.meta}>
                  {delta.displayNameSnapshot}: {delta.deltaMinor >= 0 ? "+" : ""}
                  {formatLedgerMoney(delta.deltaMinor, delta.currency, delta.scale)}
                </Text>
              ))}
              {selected.correctionSourceExpenseId ? (
                <Text style={styles.meta}>
                  {t("reviewFlow.replaced", {
                    before: selected.correctionSourceExpenseId.slice(0, 8),
                    after: selected.correctionSuccessorExpenseId?.slice(0, 8) ?? "",
                  })}
                </Text>
              ) : null}
              {!selected.adjustmentDeltas?.length &&
              !selected.correctionSourceExpenseId ? (
                <Text style={styles.meta}>{t("reviewFlow.copy113")}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {rows.map((row, index) => (
        <View key={row.id} style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {(row.lineageSequence ?? index) === 0
              ? t("reviewFlow.copy114")
              : t("reviewFlow.copy115")}
          </Text>
          {row.balances.map((balance) => (
            <View key={balance.memberId} style={styles.card}>
              <Text style={styles.rowTitle}>{balance.displayNameSnapshot}</Text>
              <Text style={styles.meta}>
                {t("settlement.paid")}{" "}
                {formatLedgerMoney(balance.paidMinor, balance.currency, balance.scale)}{" "}
                {t("reviewFlow.copy116")}{" "}
                {formatLedgerMoney(balance.owedMinor, balance.currency, balance.scale)}
              </Text>
            </View>
          ))}
          {row.inputs.map((input) => (
            <View key={input.expenseId} style={styles.card}>
              <Text style={styles.rowTitle}>
                {input.payer.displayNameSnapshot} {t("ui.paid")}{" "}
                {formatLedgerMoney(
                  input.original.minor,
                  input.original.currency,
                  input.original.scale,
                )}
              </Text>
              <Text style={styles.meta}>
                {t(
                  input.splits.length === 1
                    ? "reviewFlow.sharesOne"
                    : "reviewFlow.sharesOther",
                  {
                    policy: formatValuationPolicy(input.valuation.policy),
                    count: input.splits.length,
                  },
                )}
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
            </View>
          ))}
        </View>
      ))}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {t("reviewFlow.copy117")}
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
                <Text style={styles.secondaryText}>
                  {t("reviewFlow.copy125", { p0: format })}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.meta}>{t("reviewFlow.copy119")}</Text>
        )}
        {settlement.exports.map((item) => (
          <View
            key={`${item.statementDigest}-${item.privacyMode}-${item.format}`}
            style={[styles.row, largeText && styles.stack]}
          >
            <View style={styles.grow}>
              <Text style={styles.rowTitle}>
                {item.format} ·{" "}
                {item.privacyMode === "MEMBER"
                  ? t("reviewFlow.copy120")
                  : t("reviewFlow.copy121")}
              </Text>
              <Text style={item.isCurrent ? styles.current : styles.earlier}>
                {item.isCurrent ? t("reviewFlow.copy122") : t("reviewFlow.copy123")}
              </Text>
            </View>
            {settlement.isOrganizer ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void settlement.shareExport(item)}
                style={styles.shareButton}
              >
                <Text style={styles.secondaryText}>{t("reviewFlow.copy124")}</Text>
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
  Alert.alert(t("reviewFlow.copy125", { p0: format }), t("reviewFlow.copy126"), [
    { text: t("account.cancel"), style: "cancel" },
    { text: t("reviewFlow.copy121"), onPress: () => generate(format, "DE_IDENTIFIED") },
    { text: t("reviewFlow.copy120"), onPress: () => generate(format, "MEMBER") },
  ]);
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
    title: { color: colors.textPrimary, fontSize: 26, fontWeight: "800" },
    body: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
    message: { color: colors.accent, fontSize: 14, fontWeight: "700" },
    section: { gap: 8 },
    sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
    card: { backgroundColor: colors.surface, borderRadius: 10, gap: 4, padding: 12 },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 10,
      flexDirection: "row",
      gap: 10,
      minHeight: 58,
      padding: 12,
    },
    grow: { flex: 1 },
    rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
    amount: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
    stack: { alignItems: "flex-start", flexDirection: "column" },
    meta: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    current: { color: colors.accent, fontSize: 13, fontWeight: "700" },
    earlier: { color: colors.warning, fontSize: 13, fontWeight: "700" },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    secondary: {
      alignItems: "center",
      borderColor: colors.accent,
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
    secondaryText: { color: colors.accent, fontSize: 15, fontWeight: "800" },
    historyItem: {
      borderBottomColor: colors.separator,
      borderBottomWidth: 1,
      gap: 7,
      minHeight: 100,
      paddingVertical: 15,
    },
    statementLink: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  });
