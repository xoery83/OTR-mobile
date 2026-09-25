import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney } from "./format";
import {
  readSharedSettlementProjection,
  settlementExpenseIdentity,
  settlementReviewBlockers,
} from "./settlementSummaryProjection";
import { submitSettlementUpdate } from "./settlementUpdateFeedback";

export function SettlementUpdateScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const settlement = useStage7Settlement(journeyId, true);
  const refreshSettlement = settlement.refresh;
  const [reason, setReason] = useState("");
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
    sameSource ? settlement.preview?.blockers : undefined,
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
  const identityFor = (id: string) =>
    settlementExpenseIdentity(id, expenses, shared?.titles);
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
      <Text style={styles.empty}>No confirmed Settlement is available.</Text>
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
          params: { journeyId },
        } as never),
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.lead}>
          CURRENT BALANCE
        </Text>
        <Text style={styles.meta}>
          {projection.balanceMinor > 0
            ? "You should receive"
            : projection.balanceMinor < 0
              ? "You need to pay"
              : "You're settled up"}
        </Text>
        <Text style={styles.amount}>
          {formatLedgerMoney(
            Math.abs(projection.balanceMinor),
            projection.currency,
            projection.scale,
          )}
        </Text>
        <Text style={styles.meta}>
          Last confirmed{" "}
          {formatLedgerMoney(
            Math.abs(projection.confirmedSettlement.balanceMinor),
            projection.currency,
            projection.scale,
          )}{" "}
          · Change{" "}
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
          Paid for group{" "}
          {formatLedgerMoney(projection.paidMinor, projection.currency, projection.scale)}{" "}
          · Your share{" "}
          {formatLedgerMoney(
            projection.shareMinor,
            projection.currency,
            projection.scale,
          )}
        </Text>
        {!settlement.confirmationVerified ? (
          <Text style={styles.meta}>
            Showing saved changes · confirmation needs a fresh check
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Changes since last confirmation
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
                    ? "Added"
                    : item.change === "REMOVED"
                      ? "Removed from settlement"
                      : "Changed"}
                </Text>
                {blocker?.reason === "RATE_REQUIRED" ? (
                  <Text style={styles.warning}>
                    {dateRequired
                      ? "Transaction date required"
                      : "Exchange rate required"}
                  </Text>
                ) : blocker?.reason === "OPEN_CONFLICT" ? (
                  <Text style={styles.warning}>Changes need review</Text>
                ) : null}
              </View>
              {localId ? (
                <Text style={styles.link}>
                  {blocker?.reason === "RATE_REQUIRED" ? "Review" : "View"} ›
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {!projection.confirmationDiff.length ? (
          <Text style={styles.meta}>No financial changes are visible.</Text>
        ) : null}
      </View>

      {settlement.isOrganizer ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Confirm settlement update
          </Text>
          <Text style={styles.meta}>
            This creates a new immutable version under the existing Settlement.
          </Text>
          <TextInput
            accessibilityLabel="Reason for confirming Settlement changes"
            editable={!confirming}
            maxLength={2000}
            multiline
            onChangeText={setReason}
            placeholder="Reason for this update"
            style={styles.input}
            value={reason}
          />
          {!reason.trim() ? <Text style={styles.meta}>Reason is required.</Text> : null}
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
                        ? "Transaction date required"
                        : "Exchange rate required"
                      : "Changes need review"}
                  </Text>
                </View>
                {localId && blocker.reason === "RATE_REQUIRED" ? (
                  <Text style={styles.link}>Review ›</Text>
                ) : null}
              </Pressable>
            );
          })}
          {settlement.confirmationError ? (
            <Text style={styles.warning}>{settlement.confirmationError}</Text>
          ) : settlement.hasPendingFinancialOperations ? (
            <Text style={styles.warning}>
              Sync pending financial changes before confirming.
            </Text>
          ) : settlement.message ? (
            <Text style={styles.warning}>{settlement.message}</Text>
          ) : null}
          {!ready ? (
            <Pressable accessibilityRole="button" onPress={settlement.refresh}>
              <Text style={styles.link}>Check for latest changes ›</Text>
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
            {confirming ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={styles.primaryText}>
              {confirming ? "Confirming settlement…" : "Confirm settlement update"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.meta}>
          Only the Journey organizer can confirm a new Settlement version.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  amount: { color: "#0F172A", fontSize: 36, fontWeight: "900" },
  content: { gap: 16, padding: 16, paddingBottom: 48 },
  disabled: { opacity: 0.45 },
  empty: { color: "#64748B", padding: 20 },
  grow: { flex: 1, gap: 3 },
  hero: { backgroundColor: "#DFF5F1", borderRadius: 16, gap: 8, padding: 16 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 76,
    padding: 12,
    textAlignVertical: "top",
  },
  lead: { color: "#0F766E", fontSize: 18, fontWeight: "900" },
  link: { color: "#0F766E", fontSize: 15, fontWeight: "800" },
  loading: { marginTop: 32 },
  loadingRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  rowTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  section: { gap: 10 },
  sectionTitle: { color: "#0F172A", fontSize: 20, fontWeight: "900" },
  warning: { color: "#9A3412", fontSize: 14, fontWeight: "700", lineHeight: 20 },
});
