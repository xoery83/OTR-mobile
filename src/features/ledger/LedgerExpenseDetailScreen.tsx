import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";

import { ExpenseFxDetails } from "./ExpenseFxDetails";
import type { DisplayEstimate } from "./displayEstimate";
import { proposedExpenseDate } from "./expenseDraft";
import { formatLedgerDate, formatLedgerMoney } from "./format";
import { loadDisplayEstimates } from "./loadDisplayEstimates";

export function LedgerExpenseDetailScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [expense, setExpense] = useState<LedgerExpense | null>(null);
  const [payerName, setPayerName] = useState("Traveller");
  const [receiptCount, setReceiptCount] = useState(0);
  const [estimate, setEstimate] = useState<DisplayEstimate | null>(null);
  const [hasOpenConflict, setHasOpenConflict] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [participationError, setParticipationError] = useState<string | null>(null);
  const [savingParticipation, setSavingParticipation] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [raisingReview, setRaisingReview] = useState(false);
  const [fxAccess, setFxAccess] = useState({
    currency: "",
    scale: 2,
    canChange: false,
    locked: true,
  });
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (id) {
        void getDefaultLedgerExpenseRepository()
          .then((repository) => repository.getExpense(id))
          .then(async (nextExpense) => {
            if (!nextExpense) return [null, false, "Traveller", 0, null, null] as const;
            const [nextHasOpenConflict, members, receipts, actor, journeys, settlement] =
              await Promise.all([
                getDefaultLedgerReportingRepository().then((repository) =>
                  repository.hasOpenConflict(id),
                ),
                getDefaultLedgerReadRepository().then((repository) =>
                  repository.listMembers(nextExpense.journeyId),
                ),
                getDefaultLedgerReceiptRepository().then((repository) =>
                  repository.listReceipts(nextExpense.journeyId),
                ),
                getDefaultLedgerReportingRepository().then((repository) =>
                  repository.getActorContext(nextExpense.journeyId),
                ),
                getDefaultLedgerReportingRepository().then((repository) =>
                  repository.listJourneys(),
                ),
                getDefaultLedgerSettlementRepository().then((repository) =>
                  repository.isExpenseFinalized(nextExpense.journeyId, nextExpense.id),
                ),
              ]);
            const journey = journeys.find(
              (item) => item.journeyId === nextExpense.journeyId,
            );
            const currency =
              journey?.settlementCurrency ??
              nextExpense.valuation?.settlement.currency ??
              "";
            const scale =
              journey?.settlementScale ?? nextExpense.valuation?.settlement.scale ?? 2;
            const estimates = currency
              ? await loadDisplayEstimates(nextExpense.journeyId, currency, scale, [
                  nextExpense,
                ])
              : new Map();
            return [
              nextExpense,
              nextHasOpenConflict,
              members.find((member) => member.id === nextExpense.payerMemberId)
                ?.displayName ?? "Traveller",
              receipts.filter((receipt) => receipt.expenseId === nextExpense.id).length,
              estimates.get(nextExpense.id) ?? null,
              {
                currency,
                scale,
                canChange: Boolean(
                  actor?.memberId &&
                  (actor.role === "owner" ||
                    actor.memberId === nextExpense.creatorMemberId),
                ),
                locked: settlement,
              },
            ] as const;
          })
          .then(
            ([
              nextExpense,
              nextHasOpenConflict,
              nextPayerName,
              nextReceiptCount,
              nextEstimate,
              access,
            ]) => {
              if (!active) return;
              setExpense(nextExpense);
              setHasOpenConflict(nextHasOpenConflict);
              setPayerName(nextPayerName);
              setReceiptCount(nextReceiptCount);
              setEstimate(nextEstimate);
              if (access) setFxAccess(access);
            },
          )
          .catch(() => {
            if (active) setLoadError(true);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      }
      return () => {
        active = false;
      };
    }, [id]),
  );
  const watchedExpenseId = expense?.id;
  const watchedSyncStatus = expense?.syncStatus;
  useEffect(() => {
    if (!watchedExpenseId || watchedSyncStatus === "SYNCED") return;
    let active = true;
    const timer = setInterval(() => {
      void getDefaultLedgerExpenseRepository()
        .then((repository) => repository.getExpense(watchedExpenseId))
        .then((updated) => {
          if (active && updated) setExpense(updated);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [watchedExpenseId, watchedSyncStatus]);
  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Loading Expense" />
      </View>
    );
  if (!expense)
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>
          {loadError
            ? "Expense could not be loaded from this iPhone."
            : "Expense is not available in the local Ledger."}
        </Text>
      </View>
    );
  const valuation = expense.valuation;
  const chinese = Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");
  const participantNames = new Map(
    expense.participants.map((item) => [item.memberId, item.displayNameSnapshot]),
  );
  const excluded = expense.status !== "ACCEPTED" || hasOpenConflict || !valuation;
  const warning = hasOpenConflict
    ? {
        title: "Conflict—review required",
        detail: "Choose the correct version before relying on this Expense in totals.",
      }
    : !fxAccess.locked &&
        expense.status === "RATE_REQUIRED" &&
        !proposedExpenseDate(expense)
      ? {
          title: chinese ? "添加日期" : "Add date",
          detail: chinese ? "添加消费日期" : "Add an Expense date",
        }
      : expense.status !== "RATE_REQUIRED" && expense.status !== "ACCEPTED"
        ? {
            title: "Not included in totals",
            detail: "This Expense is not yet part of the accepted Spending totals.",
          }
        : null;
  const setIncluded = async (included: boolean) => {
    setSavingParticipation(true);
    setParticipationError(null);
    try {
      const repository = await getDefaultLedgerExpenseRepository();
      const updated = await repository.updateExpense(
        expense.id,
        {
          journeyId: expense.journeyId,
          creatorMemberId: expense.creatorMemberId,
          payerMemberId: expense.payerMemberId,
          title: expense.title,
          description: expense.description,
          category: expense.category,
          occurredAt: expense.occurredAt,
          economicDate: expense.economicDate,
          original: expense.original,
          participants: expense.participants,
          splits: expense.splits,
          valuation: expense.valuation,
          status: expense.status === "DELETED" ? "DRAFT" : expense.status,
          settlementParticipation: included ? "INCLUDED" : "EXCLUDED",
        },
        "Changed settlement participation.",
      );
      setExpense(updated);
    } catch {
      setParticipationError("Settlement participation could not be saved.");
    } finally {
      setSavingParticipation(false);
    }
  };
  const confirmParticipation = () => {
    const include = expense.settlementParticipation === "EXCLUDED";
    Alert.alert(
      include ? "Include in group settlement?" : "Remove from group settlement?",
      include
        ? "Participant shares will affect who owes whom."
        : "The Expense stays in Spending and analysis, but will not create debt between travellers.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: include ? "Include" : "Remove",
          style: include ? "default" : "destructive",
          onPress: () => void setIncluded(include),
        },
      ],
    );
  };
  const raiseConcern = async (targetMemberId?: string) => {
    if (raisingReview) return;
    if (!expense.serverRevision) {
      setReviewMessage("Save this Expense to the Journey before adding it to Review.");
      return;
    }
    setRaisingReview(true);
    try {
      await (
        await getDefaultLedgerReviewRepository()
      ).raise(expense.journeyId, {
        targetType: targetMemberId ? "EXPENSE_SHARE" : "EXPENSE",
        expenseId: expense.serverId ?? expense.id,
        targetMemberId: targetMemberId ?? null,
        personalPaymentId: null,
        settlementId: null,
        sourceRevision: expense.serverRevision,
        note: null,
        targetTitle: targetMemberId
          ? `${expense.title} · ${participantNames.get(targetMemberId) ?? "Traveller"} share`
          : expense.title,
      });
      setReviewMessage("Added to Review");
      kickLedgerOperationalSync();
    } catch (error) {
      setReviewMessage(
        error instanceof Error ? error.message : "Could not add this to Review.",
      );
    } finally {
      setRaisingReview(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {expense.syncStatus !== "SYNCED" ? (
        <Text accessibilityLiveRegion="polite" style={styles.saved}>
          {chinese ? "已保存到此 iPhone" : "Saved on this iPhone"}
        </Text>
      ) : null}
      <Text accessibilityRole="header" style={styles.title}>
        {expense.title}
      </Text>
      <Text style={styles.meta}>
        {expense.category} ·{" "}
        {formatLedgerDate(expense.economicDate ?? expense.occurredAt)}
      </Text>
      <View style={styles.actions}>
        {!fxAccess.locked ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/expenses/new",
                params: { expenseId: expense.id, journeyId: expense.journeyId },
              })
            }
            style={styles.action}
          >
            <Text style={styles.actionText}>Edit Expense</Text>
          </Pressable>
        ) : null}
        {!fxAccess.locked ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/expenses/receipt",
                params: { expenseId: expense.id, journeyId: expense.journeyId },
              })
            }
            style={styles.action}
          >
            <Text style={styles.actionText}>Attach Receipt</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: raisingReview }}
          disabled={raisingReview}
          onPress={() => void raiseConcern()}
          style={styles.action}
        >
          <Text style={styles.actionText}>Something looks wrong</Text>
        </Pressable>
      </View>
      {reviewMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.saved}>
          {reviewMessage}
        </Text>
      ) : null}
      {fxAccess.locked ? (
        <Text style={styles.meta}>
          {chinese
            ? "最终结算已完成 · 此账目只读"
            : "Final settlement completed · read-only"}
        </Text>
      ) : null}
      {excluded && warning ? (
        <Pressable
          accessibilityRole={
            !fxAccess.locked &&
            expense.status === "RATE_REQUIRED" &&
            !proposedExpenseDate(expense)
              ? "button"
              : undefined
          }
          onPress={
            !fxAccess.locked &&
            expense.status === "RATE_REQUIRED" &&
            !proposedExpenseDate(expense)
              ? () =>
                  router.push({
                    pathname: "/expenses/new",
                    params: {
                      expenseId: expense.id,
                      journeyId: expense.journeyId,
                      focusDate: "1",
                    },
                  })
              : undefined
          }
          style={styles.warning}
        >
          <Text style={styles.warningTitle}>{warning.title}</Text>
          <Text style={styles.meta}>{warning.detail}</Text>
        </Pressable>
      ) : null}
      <Section label={chinese ? "原始金额" : "ORIGINAL AMOUNT"}>
        <Text style={styles.value}>
          {formatLedgerMoney(
            expense.original.minor,
            expense.original.currency,
            expense.original.scale,
          )}
        </Text>
      </Section>
      {fxAccess.currency && expense.original.currency !== fxAccess.currency ? (
        <ExpenseFxDetails
          key={expense.id}
          expense={expense}
          currency={fxAccess.currency}
          scale={fxAccess.scale}
          canChange={fxAccess.canChange && !hasOpenConflict}
          locked={fxAccess.locked}
          estimate={hasOpenConflict || fxAccess.locked ? null : estimate}
          blocked={hasOpenConflict}
          onChanged={setExpense}
        />
      ) : null}
      <Section label="DETAILS">
        <Text style={styles.splitName}>Paid by {payerName}</Text>
        <Text style={styles.meta}>
          {formatLedgerDate(expense.economicDate ?? expense.occurredAt)} ·{" "}
          {expense.category}
        </Text>
        {expense.description ? (
          <Text style={styles.meta}>{expense.description}</Text>
        ) : null}
        <Text style={styles.meta}>
          {receiptCount
            ? `${receiptCount} ${receiptCount === 1 ? "receipt" : "receipts"} attached`
            : "No receipt attached"}
        </Text>
      </Section>
      <Section label="EXACT SPLITS">
        {expense.splits.map((split) => (
          <View key={split.memberId}>
            <View style={[styles.split, largeText && styles.stack]}>
              <Text style={styles.splitName}>
                {participantNames.get(split.memberId) ?? "Traveller"}
              </Text>
              <Text style={styles.splitAmount}>
                {split.settlementMinor === null || !valuation
                  ? `${expense.original.currency} original ${formatLedgerMoney(split.originalMinor, expense.original.currency, expense.original.scale)}`
                  : formatLedgerMoney(
                      split.settlementMinor,
                      valuation.settlement.currency,
                      valuation.settlement.scale,
                    )}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: raisingReview }}
              disabled={raisingReview}
              onPress={() => void raiseConcern(split.memberId)}
            >
              <Text style={styles.change}>Something looks wrong</Text>
            </Pressable>
          </View>
        ))}
      </Section>
      {expense.status !== "DELETED" ? (
        <Section label="GROUP SETTLEMENT">
          <Pressable
            accessibilityHint="Opens a confirmation before changing who owes whom"
            accessibilityLabel={`Group settlement, ${
              expense.settlementParticipation === "INCLUDED" ? "included" : "not included"
            }`}
            accessibilityRole="button"
            accessibilityState={{ disabled: savingParticipation || fxAccess.locked }}
            disabled={savingParticipation || fxAccess.locked}
            onPress={confirmParticipation}
            style={[styles.participationRow, largeText && styles.stack]}
          >
            <View style={styles.participationCopy}>
              <Text style={styles.splitName}>
                {expense.settlementParticipation === "INCLUDED"
                  ? "Included in group settlement"
                  : "Not included in group settlement"}
              </Text>
              <Text style={styles.meta}>
                {expense.settlementParticipation === "INCLUDED"
                  ? "Participant shares affect who owes whom."
                  : "This Expense remains in Spending and analysis but creates no inter-member debt."}
              </Text>
            </View>
            <Text style={styles.change}>
              {fxAccess.locked ? "Locked" : savingParticipation ? "Saving…" : "Change"}
            </Text>
          </Pressable>
          {participationError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {participationError}
            </Text>
          ) : null}
        </Section>
      ) : null}
      <Section label="PAYER EVIDENCE">
        {expense.paymentRecords.length ? (
          expense.paymentRecords.map((record) => (
            <View key={record.id} style={styles.evidence}>
              <Text style={styles.splitName}>
                {record.instrumentLabel ?? "Payment record"}
              </Text>
              <Text style={styles.meta}>
                {record.posted
                  ? `Posted ${formatLedgerMoney(record.posted.minor, record.posted.currency, record.posted.scale)}`
                  : "No posted amount"}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>
            {chinese ? "没有付款凭证。" : "No payer evidence recorded."}
          </Text>
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { backgroundColor: "#F6F7F9", gap: 14, padding: 16, paddingBottom: 40 },
  title: { color: "#111827", fontSize: 28, fontWeight: "800" },
  meta: { color: "#64748B", fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: {
    backgroundColor: "#CCFBF1",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 44,
    padding: 11,
  },
  actionText: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  warning: { backgroundColor: "#FFF7DB", borderRadius: 10, gap: 4, padding: 13 },
  warningTitle: { color: "#7C5B00", fontWeight: "700" },
  saved: { color: "#64748B", fontSize: 13 },
  section: { backgroundColor: "#FFFFFF", borderRadius: 10, gap: 8, padding: 14 },
  label: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  value: { color: "#111827", fontSize: 23, fontWeight: "800" },
  split: {
    alignItems: "center",
    borderTopColor: "#E5E7EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
  splitName: { color: "#111827", fontSize: 15, fontWeight: "600" },
  splitAmount: { color: "#111827", fontSize: 14 },
  evidence: {
    borderTopColor: "#E5E7EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingTop: 8,
  },
  participationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 44,
  },
  participationCopy: { flex: 1, gap: 4 },
  change: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  error: { color: "#B91C1C", fontSize: 13 },
  stack: { alignItems: "flex-start", flexDirection: "column", paddingVertical: 8 },
});
