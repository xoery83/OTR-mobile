import { MoneyText } from "./MoneyText";
import {
  refreshLedgerFxSnapshotCache,
  kickLedgerOperationalSync,
} from "@/data/operations/kickLedgerSync";
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
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { ExpenseOperationResult } from "@/data/api/ledgerMutationContracts";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";

import { resolveReceiptAssetUri } from "@/data/operations/openReceiptAsset";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";

import { AppIcon } from "@/components/AppIcon";
import { contentVisual as cv } from "./contentVisual";
import { HeaderIconAction } from "@/components/navigationChrome";
import { canEditLedgerExpense } from "@/data/repositories/ledgerExpenseEditAccess";
import { previewReceiptDraftPdf } from "@/native/receiptDraftPreview";
import { ExpenseAttachmentRow } from "./ExpenseAttachmentRow";
import { ExpenseAttachmentViewer, type AttachmentImage } from "./ExpenseAttachmentViewer";
import { ExpenseSettlementTag } from "./ExpenseSettlementTag";
import { shouldShowGroupSettlement } from "./expenseDraft";
import { expenseSharingSummary } from "./expenseEntryPresentation";

import { ExpenseFxDetails } from "./ExpenseFxDetails";
import type { DisplayEstimate } from "./displayEstimate";
import { formatLedgerDate } from "./format";
import { loadDisplayEstimates } from "./loadDisplayEstimates";

export function LedgerExpenseDetailScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [expense, setExpense] = useState<LedgerExpense | null>(null);
  const [syncResult, setSyncResult] = useState<ExpenseOperationResult | null>(null);
  const [blockingResult, setBlockingResult] = useState<ExpenseOperationResult | null>(
    null,
  );
  const [retryingSync, setRetryingSync] = useState(false);
  const [syncActionMessage, setSyncActionMessage] = useState<string | null>(null);
  const [payerName, setPayerName] = useState("Traveller");
  const [receipts, setReceipts] = useState<ReceiptAsset[]>([]);
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<DisplayEstimate | null>(null);
  const [hasOpenConflict, setHasOpenConflict] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sharingExpanded, setSharingExpanded] = useState(false);
  const [actorId, setActorId] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<AttachmentImage[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewFlagCount, setReviewFlagCount] = useState(0);
  const [raisingReview, setRaisingReview] = useState(false);
  const [fxAccess, setFxAccess] = useState({
    currency: "",
    scale: 2,
    canChange: false,
    canAttach: false,
    locked: true,
  });
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (id) {
        void getDefaultLedgerExpenseRepository()
          .then((repository) => repository.getExpense(id))
          .then(async (nextExpense) => {
            if (!nextExpense)
              return [
                null,
                false,
                "Traveller",
                [] as ReceiptAsset[],
                null,
                0,
                null,
              ] as const;
            const [
              nextHasOpenConflict,
              members,
              receipts,
              actor,
              journeys,
              settlement,
              findings,
            ] = await Promise.all([
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
                repository.isExpenseFinalized(
                  nextExpense.journeyId,
                  nextExpense.id,
                  nextExpense.serverId,
                ),
              ),
              getDefaultLedgerReviewRepository().then((repository) =>
                repository.list(nextExpense.journeyId),
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
              receipts.filter(
                (receipt) =>
                  receipt.expenseId === nextExpense.id ||
                  receipt.expenseId === nextExpense.serverId,
              ),
              estimates.get(nextExpense.id) ?? null,
              findings.filter(
                (finding) =>
                  finding.origin === "HUMAN" &&
                  finding.lifecycle === "ACTIVE" &&
                  (finding.expenseId === nextExpense.id ||
                    finding.expenseId === nextExpense.serverId),
              ).length,
              {
                actorId: actor?.memberId ?? null,
                currency,
                scale,
                canChange: canEditLedgerExpense(actor?.role, settlement),
                canAttach: actor?.role === "owner" || actor?.role === "group_member",
                locked: settlement,
              },
            ] as const;
          })
          .then(
            ([
              nextExpense,
              nextHasOpenConflict,
              nextPayerName,
              nextReceipts,
              nextEstimate,
              nextReviewFlagCount,
              access,
            ]) => {
              if (!active) return;
              setExpense(nextExpense);
              setHasOpenConflict(nextHasOpenConflict);
              setPayerName(nextPayerName);
              setReceipts(nextReceipts);
              setEstimate(nextEstimate);
              setReviewFlagCount(nextReviewFlagCount);
              if (access) {
                setFxAccess(access);
                setActorId(access.actorId);
              }
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
  useEffect(() => {
    if (
      !expense ||
      !fxAccess.currency ||
      expense.valuation ||
      expense.original.currency === fxAccess.currency
    )
      return;
    let active = true;
    void refreshLedgerFxSnapshotCache()
      .then(() =>
        loadDisplayEstimates(expense.journeyId, fxAccess.currency, fxAccess.scale, [
          expense,
        ]),
      )
      .then((estimates) => {
        if (active) setEstimate(estimates.get(expense.id) ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [expense, fxAccess.currency, fxAccess.scale]);
  const watchedExpenseId = expense?.id;
  const watchedSyncStatus = expense?.syncStatus;
  useEffect(() => {
    if (!watchedExpenseId || watchedSyncStatus === "SYNCED") return;
    let active = true;
    const refresh = () => {
      void getDefaultLedgerExpenseRepository()
        .then(async (repository) => {
          const [updated, result] = await Promise.all([
            repository.getExpense(watchedExpenseId),
            repository.getLatestOperationResult(watchedExpenseId),
          ]);
          const blocker = result?.blockingOperationId
            ? await repository.getOperationResult(result.blockingOperationId)
            : null;
          if (active) {
            if (updated) setExpense(updated);
            setSyncResult(result);
            setBlockingResult(blocker);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 3000);
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
  const needsConflictDecision = hasOpenConflict || expense.syncStatus === "CONFLICT";
  const valuation = expense.valuation;
  const chinese = Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");
  const participantNames = new Map(
    expense.participants.map((item) => [item.memberId, item.displayNameSnapshot]),
  );
  const excluded = expense.status !== "ACCEPTED" || needsConflictDecision || !valuation;
  const warning = needsConflictDecision
    ? {
        title: "Review changes",
        detail: "This Expense has changes that need your decision.",
      }
    : expense.status === "RATE_REQUIRED" && expense.economicDate === null
      ? {
          title: chinese ? "确认交易日期" : "Transaction date required",
          detail: chinese
            ? "请确认交易日期。汇率将自动查找。"
            : "Confirm the transaction date; OTR will find the reference rate.",
        }
      : expense.status !== "RATE_REQUIRED" && expense.status !== "ACCEPTED"
        ? {
            title: "Not included in totals",
            detail: "This Expense is not yet part of the accepted Spending totals.",
          }
        : null;
  const raiseConcern = async (note: string) => {
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
        targetType: "EXPENSE",
        expenseId: expense.serverId ?? expense.id,
        targetMemberId: null,
        personalPaymentId: null,
        settlementId: null,
        sourceRevision: expense.serverRevision,
        note,
        targetTitle: expense.title,
      });
      setReviewMessage("Added to Review");
      setReviewFlagCount((count) => count + 1);
      kickLedgerOperationalSync();
    } catch (error) {
      setReviewMessage(
        error instanceof Error ? error.message : "Could not add this to Review.",
      );
    } finally {
      setRaisingReview(false);
    }
  };
  const promptForConcern = () =>
    Alert.prompt(
      "Something looks wrong",
      "Add an optional note. It will be used as the Review title.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add to Review",
          onPress: (note?: string) => void raiseConcern(note ?? ""),
        },
      ],
      "plain-text",
    );
  const canEdit = fxAccess.canChange && expense.status !== "DELETED";
  const sharing = expenseSharingSummary(
    {
      payerId: expense.payerMemberId,
      participantIds: expense.participants.map((item) => item.memberId),
      splitMode: expense.splits[0]?.method ?? "EQUAL_PERSON",
      settlementParticipation: expense.settlementParticipation,
    },
    [
      ...expense.participants.map((item) => ({
        id: item.memberId,
        displayName: item.displayNameSnapshot,
        householdId: item.householdIdSnapshot,
        shareUnits: null,
      })),
      {
        id: expense.payerMemberId,
        displayName: payerName,
        householdId: null,
        shareUnits: null,
      },
    ],
    actorId ?? "",
  );
  const previewAttachment = async (receipt: ReceiptAsset) => {
    try {
      const uri = await resolveReceiptAssetUri(receipt);
      if (receipt.mimeType === "application/pdf") previewReceiptDraftPdf(uri);
      else {
        setReceipts((current) =>
          current.map((item) =>
            item.id === receipt.id ? { ...item, localUri: uri } : item,
          ),
        );
        setPreviewImages(
          receipts
            .filter((item) => item.mimeType.startsWith("image/"))
            .map((item) => ({
              id: item.id,
              localUri: item.id === receipt.id ? uri : (item.localUri ?? ""),
            })),
        );
        setPreviewId(receipt.id);
      }
    } catch (error) {
      setAttachmentMessage(
        error instanceof Error ? error.message : "Attachment could not be opened.",
      );
    }
  };
  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: "Expense",
          headerRight: () =>
            canEdit ? (
              <HeaderIconAction
                label="Edit expense"
                name="square.and.pencil"
                onPress={() =>
                  router.push({
                    pathname: "/expenses/new",
                    params: { expenseId: expense.id, journeyId: expense.journeyId },
                  })
                }
              />
            ) : null,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {expense.title}
        </Text>
        <Text style={styles.meta}>
          {expense.category} ·{" "}
          {formatLedgerDate(expense.economicDate ?? expense.occurredAt)}
        </Text>
        {reviewFlagCount ? (
          <Text accessibilityLiveRegion="polite" style={styles.reviewFlag}>
            Flagged for review{reviewFlagCount > 1 ? ` · ${reviewFlagCount} open` : ""}
          </Text>
        ) : null}
        {fxAccess.locked ? (
          <Text style={styles.meta}>
            {chinese
              ? "历史结算已完成 · 历史版本只读"
              : "Historical settlement completed · earlier version read-only"}
          </Text>
        ) : null}
        {expense.syncStatus !== "SYNCED" && syncResult ? (
          <Text accessibilityLiveRegion="polite" style={styles.syncNotice}>
            {syncResult.state === "TERMINAL_FAILURE" ||
            syncResult.state === "CONFLICT_REQUIRES_ACTION"
              ? "This change needs attention"
              : "Saved on this iPhone · Waiting for sync"}
            {blockingResult?.error?.code
              ? ` · Earlier change: ${blockingResult.error.code} (${blockingResult.error.message})`
              : syncResult.error?.code
                ? ` · ${syncResult.error.code}`
                : null}
          </Text>
        ) : null}
        {syncResult?.state === "TERMINAL_FAILURE" &&
        blockingResult?.error?.code === "INVALID_PAYLOAD" &&
        syncResult.blockingOperationId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: retryingSync }}
            disabled={retryingSync}
            onPress={() => {
              setRetryingSync(true);
              void getDefaultLedgerExpenseRepository()
                .then((repository) =>
                  repository.retryFailedPredecessor(
                    expense.id,
                    syncResult.blockingOperationId!,
                  ),
                )
                .then((queued) => {
                  setSyncActionMessage(
                    queued
                      ? "Retrying the earlier saved change…"
                      : "This change can no longer be retried here.",
                  );
                  if (queued) kickLedgerOperationalSync();
                })
                .catch(() => setSyncActionMessage("Could not retry this change."))
                .finally(() => setRetryingSync(false));
            }}
            style={styles.reviewAction}
          >
            <Text style={styles.actionText}>Retry earlier saved change ›</Text>
          </Pressable>
        ) : null}
        {syncActionMessage ? <Text style={styles.meta}>{syncActionMessage}</Text> : null}
        {excluded && warning ? (
          <Pressable
            accessibilityRole={
              needsConflictDecision
                ? "button"
                : fxAccess.canChange &&
                    expense.status === "RATE_REQUIRED" &&
                    expense.economicDate === null
                  ? "button"
                  : undefined
            }
            onPress={
              needsConflictDecision
                ? () =>
                    router.push({
                      pathname: "/expenses/conflict/[id]",
                      params: { id: expense.id },
                    } as never)
                : fxAccess.canChange &&
                    expense.status === "RATE_REQUIRED" &&
                    expense.economicDate === null
                  ? () =>
                      router.push({
                        pathname: "/expenses/confirm-date",
                        params: {
                          expenseId: expense.id,
                        },
                      } as never)
                  : undefined
            }
            style={styles.warning}
          >
            <Text style={styles.warningTitle}>{warning.title}</Text>
            <Text style={styles.meta}>{warning.detail}</Text>
            {needsConflictDecision ? (
              <Text style={styles.meta}>Review changes ›</Text>
            ) : null}
          </Pressable>
        ) : null}
        <Section label={chinese ? "金额" : "Amount"}>
          <View style={[styles.amountRow, largeText && styles.stack]}>
            <View style={styles.amountColumn}>
              <MoneyText
                style={styles.value}
                variant="headline"
                minor={expense.original.minor}
                currency={expense.original.currency}
                scale={expense.original.scale}
              />
              {fxAccess.currency && expense.original.currency !== fxAccess.currency ? (
                <Text style={styles.meta}>Original</Text>
              ) : null}
            </View>
            {fxAccess.currency && expense.original.currency !== fxAccess.currency ? (
              <ExpenseFxDetails
                key={expense.id}
                expense={expense}
                currency={fxAccess.currency}
                scale={fxAccess.scale}
                canChange={canEdit && !needsConflictDecision}
                locked={fxAccess.locked}
                estimate={needsConflictDecision || fxAccess.locked ? null : estimate}
                blocked={needsConflictDecision}
                onChanged={setExpense}
              />
            ) : null}
          </View>
        </Section>
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sharing"
            accessibilityState={{ expanded: sharingExpanded }}
            onPress={() => setSharingExpanded((value) => !value)}
            style={styles.sharingControl}
          >
            <View style={styles.sharingHeading}>
              <Text style={styles.label}>Sharing</Text>
              {shouldShowGroupSettlement(
                expense.participants.map((item) => item.memberId),
                expense.payerMemberId,
              ) ? (
                <ExpenseSettlementTag value={expense.settlementParticipation} />
              ) : null}
            </View>
            <View style={styles.sharingSummary}>
              <Text style={styles.splitName}>
                {sharing.join(" · ").replace(" paid · ", " paid\n")}
              </Text>
              <AppIcon
                color="#64748B"
                name={sharingExpanded ? "chevron.up" : "chevron.down"}
                size={14}
              />
            </View>
          </Pressable>
          {sharingExpanded ? (
            <View style={styles.sharingExpanded}>
              {expense.splits.map((split) => (
                <View
                  key={split.memberId}
                  style={[styles.split, largeText && styles.stack]}
                >
                  <Text style={styles.splitName}>
                    {split.memberId === actorId
                      ? "You"
                      : (participantNames.get(split.memberId) ?? "Traveller")}
                  </Text>
                  <MoneyText
                    style={styles.splitAmount}
                    variant="standard"
                    minor={split.originalMinor}
                    currency={expense.original.currency}
                    scale={expense.original.scale}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.section}>
          {expense.description?.trim() ? (
            <View style={styles.notes}>
              <Text style={styles.label}>Notes</Text>
              <Text style={styles.splitName}>{expense.description}</Text>
            </View>
          ) : null}
          <View style={styles.sharingHeading}>
            <Text style={styles.label}>Attachments · {receipts.length}</Text>
            {expense.status !== "DELETED" &&
            !fxAccess.locked &&
            fxAccess.canAttach &&
            receipts.length < MAX_EXPENSE_ATTACHMENTS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add attachment"
                style={styles.headerAction}
                onPress={() =>
                  router.push({
                    pathname: "/expenses/receipt",
                    params: { expenseId: expense.id, journeyId: expense.journeyId },
                  })
                }
              >
                <AppIcon color="#0F766E" name="plus" size={20} />
              </Pressable>
            ) : null}
          </View>
          {receipts.map((receipt, index) => (
            <View key={receipt.id}>
              <ExpenseAttachmentRow
                attachment={receipt}
                position={index + 1}
                onPreview={() => void previewAttachment(receipt)}
              />
            </View>
          ))}
          {attachmentMessage ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {attachmentMessage}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: raisingReview }}
          disabled={raisingReview}
          onPress={promptForConcern}
          style={styles.reviewAction}
        >
          <Text style={styles.actionText}>
            {raisingReview ? "Adding to Review…" : "Something looks wrong?"}
          </Text>
          <Text style={styles.meta}>Flag this expense in Review. ›</Text>
        </Pressable>
        {reviewMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.meta}>
            {reviewMessage}
          </Text>
        ) : null}
      </ScrollView>
      <ExpenseAttachmentViewer
        images={previewImages}
        selectedId={previewId}
        onSelect={(id) => {
          const receipt = receipts.find((item) => item.id === id);
          if (receipt) void previewAttachment(receipt);
        }}
        onClose={() => setPreviewId(null)}
      />
    </>
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
  actionText: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  reviewAction: { minHeight: 44, gap: 3, paddingVertical: 10 },
  headerAction: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  amountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
  },
  amountColumn: { flexShrink: 1, gap: 4 },
  sharingControl: { gap: 8, minHeight: 44 },
  sharingSummary: { alignItems: "flex-end", flexDirection: "row", gap: 6 },
  sharingExpanded: {
    backgroundColor: cv.color.expanded,
    borderTopColor: cv.color.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -14,
    paddingHorizontal: 14,
  },
  sharingHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notes: { gap: 6 },
  reviewFlag: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF7DB",
    borderRadius: 12,
    color: "#7C5B00",
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  syncNotice: { color: "#7C5B00", fontSize: 12, lineHeight: 18 },
  warning: { backgroundColor: "#FFF7DB", borderRadius: 10, gap: 4, padding: 13 },
  warningTitle: { color: "#7C5B00", fontWeight: "700" },
  section: {
    backgroundColor: cv.color.card,
    borderRadius: cv.radius.card,
    gap: 8,
    padding: 14,
  },
  label: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  value: {
    color: cv.color.text,
    fontSize: 23,
    lineHeight: 44,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
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
  error: { color: "#B91C1C", fontSize: 13 },
  stack: { alignItems: "flex-start", flexDirection: "column", paddingVertical: 8 },
});
