import { UiTextInput } from "@/ui/forms";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { systemMessage } from "@/ui/domainLabels";
import { MoneyText } from "./MoneyText";
import { SettlementRateAcceptance } from "./SettlementRateAcceptance";
import { settlementRateCandidates } from "./settlementRateCandidates";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney } from "./format";
import { settlementPositionLabel } from "./dashboardPresentation";
import {
  readSharedSettlementProjection,
  settlementExpenseIdentity,
  settlementReviewBlockers,
} from "./settlementSummaryProjection";
import { submitSettlementUpdate } from "./settlementUpdateFeedback";

export function SettlementUpdateScreen() {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const { journeyId, journeyTitle } = useLocalSearchParams<{
    journeyId?: string;
    journeyTitle?: string;
  }>();
  const settlement = useStage7Settlement(journeyId, true);
  const refreshSettlement = settlement.refresh;
  const [reason, setReason] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmationInFlight = useRef(false);
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const projection = settlement.summaryProjection;
  const shared = journeyId ? readSharedSettlementProjection(journeyId) : null;
  const sameSource =
    projection?.sourceFingerprint === settlement.preview?.sourceFingerprint;
  const blockers = settlementReviewBlockers(
    projection?.confirmationDiff ?? [],
    expenses,
    settlement.preview?.blockers,
  );
  const rates = settlementRateCandidates(
    settlement.displayPreview?.inputs.map((input) => input.expense) ?? [],
    settlement.displayPreview?.estimates ?? new Map(),
  );
  const ready =
    settlement.confirmationVerified &&
    !settlement.updating &&
    !settlement.hasPendingFinancialOperations &&
    blockers.length === 0 &&
    sameSource &&
    settlement.adjustmentPreview?.state === "PREVIEW_READY";
  const refreshedOnFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!journeyId) return;
      if (refreshedOnFocus.current) refreshSettlement();
      refreshedOnFocus.current = true;
      void getDefaultLedgerReportingRepository()
        .then((repository) => repository.getPreferences())
        .then((preferences) => {
          if (active) setDebugMode(preferences.debugMode);
        })
        .catch(() => undefined);
      void getDefaultLedgerExpenseRepository()
        .then((repository) => repository.listExpensesForJourney(journeyId, true))
        .then((rows) => {
          if (active) setExpenses(rows);
        });
      return () => {
        active = false;
      };
    }, [journeyId, refreshSettlement]),
  );
  const identityFor = (id: string) => {
    const identity = settlementExpenseIdentity(id, expenses, shared?.titles);
    const hasTitle =
      expenses.some((item) => (item.id === id || item.serverId === id) && item.title) ||
      shared?.titles[id]?.title;
    return { ...identity, title: hasTitle ? identity.title : t("health.expense") };
  };
  const openRateReview = (id: string, localId: string, removed: boolean) => {
    const expense = expenses.find((item) => item.id === localId || item.serverId === id);
    if (expense?.economicDate === null) {
      router.push({
        pathname: "/expenses/confirm-date",
        params: { expenseId: localId },
      } as never);
      return;
    }
    if (removed && journeyId)
      router.push({
        pathname: "/expenses/settlement-adjustment",
        params: { journeyId, expenseId: id },
      } as never);
    else router.push(`/expenses/expense/${localId}`);
  };

  if (!projection?.confirmedSettlement)
    return settlement.updating ? (
      <ActivityIndicator style={styles.loading} />
    ) : (
      <Text style={styles.empty}>{t("reviewFlow.copy52")}</Text>
    );

  const confirm = async () => {
    if (!ready || !reason.trim() || !settlement.adjustmentPreview) return;
    await submitSettlementUpdate(
      confirmationInFlight,
      reason,
      setConfirming,
      (submittedReason) =>
        settlement.finalizeAdjustment(settlement.adjustmentPreview!, submittedReason),
      () =>
        router.replace({
          pathname: "/expenses/settlement",
          params: { journeyId, journeyTitle },
        } as never),
    );
  };

  return (
    <ScrollView style={styles.viewport} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.lead}>
          {t("settlement.balanceHeading")}
        </Text>
        <Text style={styles.meta}>
          {settlementPositionLabel(projection.balanceMinor)}
        </Text>
        <MoneyText
          style={styles.amount}
          variant="hero"
          minor={Math.abs(projection.balanceMinor)}
          currency={projection.currency}
          scale={projection.scale}
        />
        <Text style={styles.meta}>
          {t("settlement.lastConfirmed")}{" "}
          {formatLedgerMoney(
            Math.abs(projection.confirmedSettlement.balanceMinor),
            projection.currency,
            projection.scale,
          )}{" "}
          {t("reviewFlow.copy53")}{" "}
          {projection.balanceMinor - projection.confirmedSettlement.balanceMinor >= 0
            ? "+"
            : ""}
          {formatLedgerMoney(
            projection.balanceMinor - projection.confirmedSettlement.balanceMinor,
            projection.currency,
            projection.scale,
          )}
        </Text>
        <Text style={styles.meta}>
          {t("settlement.paidForGroup")}{" "}
          {formatLedgerMoney(projection.paidMinor, projection.currency, projection.scale)}{" "}
          {t("reviewFlow.copy54")}{" "}
          {formatLedgerMoney(
            projection.shareMinor,
            projection.currency,
            projection.scale,
          )}
        </Text>
        {!settlement.confirmationVerified ? (
          <Text style={styles.meta}>{t("reviewFlow.copy55")}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {t("settlement.sinceConfirmation")}
        </Text>
        {projection.confirmationDiff.map((item) => {
          const blocker = blockers.find((value) => value.expenseId === item.expenseId);
          const identity = identityFor(item.expenseId);
          const localId = identity.localId;
          const dateRequired =
            blocker?.reason === "RATE_REQUIRED" &&
            expenses.some(
              (expense) =>
                (expense.id === localId || expense.serverId === item.expenseId) &&
                expense.economicDate === null,
            );
          return (
            <Pressable
              accessibilityRole={localId ? "button" : undefined}
              key={item.expenseId}
              onPress={
                localId
                  ? () =>
                      blocker?.reason === "RATE_REQUIRED"
                        ? openRateReview(
                            item.expenseId,
                            localId,
                            item.change === "REMOVED",
                          )
                        : router.push(`/expenses/expense/${localId}`)
                  : undefined
              }
              style={styles.row}
            >
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>{identity.title}</Text>
                <Text style={styles.meta}>
                  {item.change === "ADDED"
                    ? t("reviewFlow.copy56")
                    : item.change === "REMOVED"
                      ? t("reviewFlow.copy57")
                      : t("reviewFlow.copy58")}
                </Text>
                {blocker?.reason === "RATE_REQUIRED" ? (
                  <Text style={styles.warning}>
                    {dateRequired ? t("expense.dateRequired") : t("reviewFlow.copy59")}
                  </Text>
                ) : blocker?.reason === "OPEN_CONFLICT" ? (
                  <Text style={styles.warning}>{t("ui.changesNeedReview")}</Text>
                ) : null}
              </View>
              {localId ? (
                <Text style={styles.link}>
                  {blocker?.reason === "RATE_REQUIRED"
                    ? t("common.review")
                    : t("ui.view")}{" "}
                  ›
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {!projection.confirmationDiff.length ? (
          <Text style={styles.meta}>{t("reviewFlow.copy60")}</Text>
        ) : null}
      </View>

      {settlement.isOrganizer ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t("reviewFlow.copy61")}
          </Text>
          <Text style={styles.meta}>{t("reviewFlow.copy62")}</Text>
          <UiTextInput
            accessibilityLabel={t("reviewFlow.copy63")}
            editable={!confirming}
            maxLength={2000}
            multiline
            onChangeText={setReason}
            placeholder={t("reviewFlow.copy64")}
            style={styles.input}
            value={reason}
          />
          {!reason.trim() ? (
            <Text style={styles.meta}>{t("reviewFlow.copy65")}</Text>
          ) : null}
          <SettlementRateAcceptance
            journeyId={journeyId ?? null}
            rates={rates}
            onAccepted={settlement.refresh}
          />
          {blockers.map((blocker) => {
            const identity = identityFor(blocker.expenseId);
            const localId = identity.localId;
            const dateRequired = expenses.some(
              (expense) =>
                (expense.id === localId || expense.serverId === blocker.expenseId) &&
                expense.economicDate === null,
            );
            const removed = projection.confirmationDiff.some(
              (item) => item.expenseId === blocker.expenseId && item.change === "REMOVED",
            );
            return (
              <Pressable
                accessibilityRole={
                  localId && blocker.reason === "RATE_REQUIRED" ? "button" : undefined
                }
                key={blocker.expenseId}
                onPress={
                  localId && blocker.reason === "RATE_REQUIRED"
                    ? () => openRateReview(blocker.expenseId, localId, removed)
                    : undefined
                }
                style={styles.row}
              >
                <View style={styles.grow}>
                  <Text style={styles.rowTitle}>{identity.title}</Text>
                  <Text style={styles.warning}>
                    {blocker.reason === "RATE_REQUIRED"
                      ? dateRequired
                        ? t("expense.dateRequired")
                        : t("reviewFlow.copy59")
                      : t("reviewFlow.copy66")}
                  </Text>
                </View>
                {localId && blocker.reason === "RATE_REQUIRED" ? (
                  <Text style={styles.link}>{t("reviewFlow.copy67")}</Text>
                ) : null}
              </Pressable>
            );
          })}
          {settlement.confirmationError ? (
            <Text style={styles.warning}>
              {systemMessage(settlement.confirmationError)}
            </Text>
          ) : settlement.hasPendingFinancialOperations ? (
            <Text style={styles.warning}>{t("reviewFlow.copy68")}</Text>
          ) : settlement.message ? (
            <Text style={styles.warning}>{systemMessage(settlement.message)}</Text>
          ) : null}
          {debugMode && settlement.refreshDiagnostic ? (
            <Text style={styles.meta}>
              {t("settlement.refreshDiagnostic")}
              {settlement.refreshDiagnostic}
            </Text>
          ) : null}
          {!ready &&
          !settlement.message &&
          !settlement.confirmationError &&
          !settlement.hasPendingFinancialOperations ? (
            <Text style={styles.warning}>
              {rates.length
                ? t("reviewFlow.copy69")
                : settlement.updating
                  ? t("reviewFlow.copy70")
                  : blockers.length
                    ? t("reviewFlow.copy71")
                    : t("reviewFlow.copy72")}
            </Text>
          ) : null}
          {!ready ? (
            <Pressable accessibilityRole="button" onPress={settlement.refresh}>
              <Text style={styles.link}>{t("reviewFlow.copy73")}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              busy: confirming,
              disabled: !ready || !reason.trim() || confirming,
            }}
            disabled={!ready || !reason.trim() || confirming || settlement.busy}
            onPress={() => void confirm()}
            style={[styles.primary, (!ready || !reason.trim()) && styles.disabled]}
          >
            {confirming ? <ActivityIndicator color={colors.onAccent} /> : null}
            <Text style={styles.primaryText}>
              {confirming ? t("reviewFlow.copy74") : t("reviewFlow.copy61")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.meta}>{t("reviewFlow.copy75")}</Text>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    viewport: { flex: 1, backgroundColor: colors.background },
    amount: { color: colors.textPrimary, fontSize: 36, fontWeight: "900" },
    content: { gap: 16, padding: 16, paddingBottom: 48 },
    disabled: { opacity: 0.45 },
    empty: { color: colors.textSecondary, padding: 20 },
    grow: { flex: 1, gap: 3 },
    hero: {
      backgroundColor: colors.accentSurface,
      borderRadius: 16,
      gap: 8,
      padding: 16,
    },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 10,
      borderWidth: 1,
      minHeight: 76,
      padding: 12,
      textAlignVertical: "top",
    },
    lead: { color: colors.accent, fontSize: 18, fontWeight: "900" },
    link: { color: colors.accent, fontSize: 15, fontWeight: "800" },
    loading: { marginTop: 32 },
    loadingRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    meta: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    primary: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 12,
      flexDirection: "row",
      gap: 8,
      minHeight: 50,
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "900" },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      flexDirection: "row",
      gap: 10,
      padding: 14,
    },
    rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
    section: { gap: 10 },
    sectionTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "900" },
    warning: { color: colors.warning, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  });
