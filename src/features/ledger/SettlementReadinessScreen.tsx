import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";

import { type Stage7Preview, useStage7Settlement } from "@/hooks/useStage7Settlement";
import { usePersonalSettlementReview } from "@/hooks/usePersonalSettlementReview";

import { formatLedgerMoney } from "./format";
import { unpublishedEstimateMessage } from "./estimatedSettlement";
import {
  settlementMemberName,
  settlementTransferRows,
  transferStatusLabel,
  type SettlementTransferRow,
} from "./settlementPresentation";

type PreviewTransferRow = {
  key: string;
  from: string;
  to: string;
  amount: { minor: number; currency: string; scale: number };
};

export function SettlementReadinessScreen({
  journeyId,
  embedded = false,
}: {
  journeyId?: string;
  embedded?: boolean;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  const settlement = useStage7Settlement(journeyId);
  const personalReview = usePersonalSettlementReview(settlement.journeyId ?? journeyId);
  const {
    actorMemberId,
    busy,
    displayPreview,
    unavailableExpenseIds,
    pendingPublicationExpenseIds,
    finalized,
    lineage,
    message,
    preview,
    updating,
  } = settlement;
  const finalRows = useMemo(
    () => settlementTransferRows(finalized, lineage),
    [finalized, lineage],
  );
  const previewRows = useMemo(
    () =>
      (preview?.state === "PREVIEW_READY"
        ? preview.transfers
        : (displayPreview?.transfers ?? [])
      ).map((transfer) => ({
        key: `${transfer.fromMemberId}-${transfer.toMemberId}`,
        from:
          preview?.state === "PREVIEW_READY"
            ? previewName(preview, transfer.fromMemberId)
            : (displayPreview?.members.find(
                (member) => member.id === transfer.fromMemberId,
              )?.label ?? "Traveller"),
        to:
          preview?.state === "PREVIEW_READY"
            ? previewName(preview, transfer.toMemberId)
            : (displayPreview?.members.find((member) => member.id === transfer.toMemberId)
                ?.label ?? "Traveller"),
        amount: transfer.amount,
      })),
    [preview, displayPreview],
  );
  const personal = finalized?.balances.find(
    (balance) => balance.memberId === actorMemberId,
  );
  const publicationMessage = displayPreview
    ? unpublishedEstimateMessage(
        pendingPublicationExpenseIds,
        displayPreview.estimatedServerIds,
      )
    : null;
  const rows: (SettlementTransferRow | PreviewTransferRow)[] = finalized
    ? finalRows
    : previewRows;
  const attention =
    finalized || preview?.state === "PREVIEW_READY"
      ? []
      : (preview?.blockers.map((blocker) => ({
          expenseId: blocker.expenseId,
          reason:
            (unavailableExpenseIds.has(
              displayPreview?.serverIds.get(blocker.expenseId) ?? "",
            )
              ? "Review agreed rate"
              : pendingPublicationExpenseIds.has(
                    displayPreview?.serverIds.get(blocker.expenseId) ?? "",
                  )
                ? "Reference rate not published yet"
                : displayPreview?.blockers.find(
                    (item) => item.expenseId === blocker.expenseId,
                  )?.reason) ??
            (blocker.reason === "OPEN_CONFLICT"
              ? "Resolve conflict"
              : "Journey value needs attention"),
        })) ??
        displayPreview?.blockers.map((item) => ({
          ...item,
          reason: unavailableExpenseIds.has(
            displayPreview.serverIds.get(item.expenseId) ?? "",
          )
            ? "Review agreed rate"
            : pendingPublicationExpenseIds.has(
                  displayPreview.serverIds.get(item.expenseId) ?? "",
                )
              ? "Reference rate not published yet"
              : item.reason,
        })) ??
        []);
  const attentionCounts = [...new Set(attention.map((item) => item.reason))].map(
    (reason) =>
      `${attention.filter((item) => item.reason === reason).length} · ${reason}`,
  );

  const confirmFinalize = () => {
    if (!preview || preview.state !== "PREVIEW_READY") return;
    Alert.alert(
      "Create final settlement?",
      "This freezes the listed Expenses and creates real transfer obligations.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finalize", onPress: () => void settlement.finalize(preview) },
      ],
    );
  };

  if (!settlement.journeyId)
    return <Text style={styles.body}>Choose a Journey to prepare settlement.</Text>;

  const header = (
    <View style={styles.header}>
      <View style={styles.statusCard}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={2}
          style={styles.statusTitle}
        >
          {finalized
            ? finalized.adjustmentState === "CURRENT"
              ? "Final settlement"
              : "Settlement needs attention"
            : preview?.state === "PREVIEW_READY"
              ? "Ready to settle"
              : displayPreview
                ? "If settled now"
                : preview?.state === "PREVIEW_BLOCKED"
                  ? "Settlement needs attention"
                  : "Settlement preview"}
        </Text>
        <Text style={styles.body}>
          {finalized
            ? "These are the group’s current transfer obligations."
            : "A preview is not final and does not create a payment obligation."}
        </Text>
        {!finalized &&
        preview?.state !== "PREVIEW_READY" &&
        displayPreview?.estimatedCount ? (
          <Text style={styles.meta}>
            Approximate · includes {displayPreview.estimatedCount} estimated values
          </Text>
        ) : null}
        {!finalized && preview?.state !== "PREVIEW_READY" && publicationMessage ? (
          <Text style={styles.meta}>{publicationMessage}</Text>
        ) : null}
        {!finalized &&
        preview?.state !== "PREVIEW_READY" &&
        displayPreview?.balances.find((balance) => balance.memberId === actorMemberId) ? (
          <Text style={styles.personal}>
            {(() => {
              const balance = displayPreview.balances.find(
                (item) => item.memberId === actorMemberId,
              )!;
              return `${balance.minor > 0 ? "You should receive" : balance.minor < 0 ? "You should pay" : "Your share is balanced"}${balance.minor === 0 ? "" : ` ${displayPreview.estimatedCount ? "≈ " : ""}${formatLedgerMoney(Math.abs(balance.minor), balance.currency, balance.scale)}`}`;
            })()}
          </Text>
        ) : null}
        {personal ? (
          <Text style={styles.personal}>
            {personal.netMinor > 0
              ? "You should receive"
              : personal.netMinor < 0
                ? "You should pay"
                : "Your share is balanced"}
            {personal.netMinor === 0
              ? ""
              : ` ${formatLedgerMoney(
                  Math.abs(personal.netMinor),
                  personal.currency,
                  personal.scale,
                )}`}
          </Text>
        ) : null}
      </View>

      {personalReview.state?.delta ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/expenses/personal-settlement-review",
              params: { journeyId: settlement.journeyId },
            } as never)
          }
          style={styles.reviewNotice}
        >
          <Text style={styles.warningTitle}>Updated since you reviewed</Text>
          <Text style={styles.body}>
            Your balance changed by{" "}
            {formatLedgerMoney(
              personalReview.state.delta.netDeltaMinor,
              personalReview.state.statement.currency,
              personalReview.state.statement.scale,
            )}
          </Text>
          <Text style={styles.link}>Review changes ›</Text>
        </Pressable>
      ) : null}
      {personalReview.state ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/expenses/personal-settlement-review",
              params: { journeyId: settlement.journeyId },
            } as never)
          }
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>Review my settlement</Text>
        </Pressable>
      ) : null}

      {updating ? (
        <Text accessibilityLiveRegion="polite" style={styles.meta}>
          Updating settlement…
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {busy ? <ActivityIndicator accessibilityLabel="Updating Settlement" /> : null}

      {!finalized && (!preview || preview.state === "PREVIEW_BLOCKED") ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void settlement.prepare()}
          style={[styles.primary, busy && styles.disabled]}
        >
          <Text style={styles.primaryText}>
            {preview?.state === "PREVIEW_BLOCKED" ? "Check again" : "Preview settlement"}
          </Text>
        </Pressable>
      ) : null}

      {attention.length ? (
        <View style={styles.blockers}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {attention.length} {attention.length === 1 ? "item needs" : "items need"}{" "}
            attention
          </Text>
          <Text style={styles.meta}>{attentionCounts.join("   ")}</Text>
          {attention.map((blocker) => (
            <Pressable
              accessibilityHint="Opens the affected Expense"
              accessibilityRole="button"
              key={blocker.expenseId}
              onPress={() => router.push(`/expenses/expense/${blocker.expenseId}`)}
              style={styles.blocker}
            >
              <View style={styles.grow}>
                <Text style={styles.warningTitle}>{blocker.reason}</Text>
                <Text style={styles.meta}>Open Expense to resolve it</Text>
              </View>
              <Text importantForAccessibility="no" style={styles.chevron}>
                ›
              </Text>
            </Pressable>
          ))}
          <Text style={styles.warning}>Final settlement needs these values first.</Text>
        </View>
      ) : null}

      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Who pays whom
      </Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>
          {preview || displayPreview
            ? "No transfers are needed."
            : "Preparing settlement…"}
        </Text>
      ) : null}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {preview?.state === "PREVIEW_READY" ? (
        <Pressable
          accessibilityHint="Creates final transfer obligations"
          accessibilityRole="button"
          disabled={busy}
          onPress={confirmFinalize}
          style={[styles.primary, busy && styles.disabled]}
        >
          <Text style={styles.primaryText}>Confirm final settlement</Text>
        </Pressable>
      ) : null}
      {finalized ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/expenses/settlement-adjustment",
                params: { journeyId: settlement.journeyId },
              } as never)
            }
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>
              {settlement.isOrganizer ? "Make corrections" : "Settlement history"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/expenses/settlement-statement",
                params: { journeyId: settlement.journeyId },
              } as never)
            }
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Statement & Export</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );

  const renderRow = (row: SettlementTransferRow | PreviewTransferRow) => {
    if ("transfer" in row) {
      const from = settlementMemberName(row.settlement, row.transfer.fromMemberId);
      const to = settlementMemberName(row.settlement, row.transfer.toMemberId);
      return (
        <Pressable
          accessibilityLabel={`${from} pays ${to}, ${formatLedgerMoney(
            row.transfer.amount.minor,
            row.transfer.amount.currency,
            row.transfer.amount.scale,
          )}, ${transferStatusLabel(row.transfer)}`}
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/expenses/transfer/[id]",
              params: { id: row.transfer.id, journeyId: settlement.journeyId },
            } as never)
          }
          style={[styles.transferRow, largeText && styles.stack]}
        >
          <View style={styles.grow}>
            <Text style={styles.transferTitle}>
              {from} pays {to}
            </Text>
            <Text style={styles.meta}>
              {row.settlement.kind === "ADJUSTMENT" ? "Settlement update · " : ""}
              {transferStatusLabel(row.transfer)}
            </Text>
          </View>
          <View style={[styles.amountColumn, largeText && styles.largeAmountColumn]}>
            <Text style={styles.amount}>
              {formatLedgerMoney(
                row.transfer.amount.minor,
                row.transfer.amount.currency,
                row.transfer.amount.scale,
              )}
            </Text>
            <Text importantForAccessibility="no" style={styles.chevron}>
              ›
            </Text>
          </View>
        </Pressable>
      );
    }
    return (
      <View style={[styles.transferRow, largeText && styles.stack]}>
        <View style={styles.grow}>
          <Text style={styles.transferTitle}>
            {row.from} pays {row.to}
          </Text>
          <Text style={styles.meta}>
            {displayPreview?.estimatedCount && preview?.state !== "PREVIEW_READY"
              ? "Approximate · preview only"
              : "Preview only"}
          </Text>
        </View>
        <Text style={styles.amount}>
          {displayPreview?.estimatedCount && preview?.state !== "PREVIEW_READY"
            ? "≈ "
            : ""}
          {formatLedgerMoney(row.amount.minor, row.amount.currency, row.amount.scale)}
        </Text>
      </View>
    );
  };

  if (embedded)
    return (
      <View style={styles.embedded}>
        {header}
        {rows.map((row) => (
          <View key={"transfer" in row ? row.transfer.id : row.key}>
            {renderRow(row)}
          </View>
        ))}
        {footer}
      </View>
    );

  return (
    <FlatList<SettlementTransferRow | PreviewTransferRow>
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      initialNumToRender={12}
      keyExtractor={(row) => ("transfer" in row ? row.transfer.id : row.key)}
      ListFooterComponent={footer}
      ListHeaderComponent={header}
      renderItem={({ item }) => renderRow(item)}
      windowSize={7}
    />
  );
}

function previewName(preview: Stage7Preview | null, memberId: string) {
  return (
    preview?.members.find((member) => member.memberId === memberId)
      ?.displayNameSnapshot ?? "Traveller"
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  embedded: { gap: 10 },
  header: { gap: 12 },
  footer: { gap: 10, paddingTop: 16 },
  statusCard: { backgroundColor: "#E7F5F2", borderRadius: 16, gap: 8, padding: 16 },
  statusTitle: { color: "#0F766E", fontSize: 20, fontWeight: "800" },
  body: { color: "#334155", fontSize: 16, lineHeight: 23 },
  personal: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800", marginTop: 4 },
  blockers: { gap: 8 },
  blocker: {
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    minHeight: 60,
    padding: 12,
  },
  warningTitle: { color: "#9A3412", fontSize: 16, fontWeight: "700" },
  warning: { color: "#9A3412", fontSize: 14, fontWeight: "700" },
  reviewNotice: { backgroundColor: "#FFF7ED", borderRadius: 12, gap: 6, padding: 14 },
  link: { color: "#0F766E", fontSize: 14, fontWeight: "800" },
  grow: { flex: 1 },
  transferRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  transferTitle: { color: "#0F172A", fontSize: 17, fontWeight: "700" },
  amountColumn: { alignItems: "center", flexDirection: "row", gap: 8 },
  largeAmountColumn: { alignSelf: "stretch", justifyContent: "space-between" },
  amount: { color: "#0F172A", fontSize: 17, fontWeight: "800" },
  chevron: { color: "#64748B", fontSize: 24 },
  stack: { alignItems: "flex-start", flexDirection: "column" },
  empty: { color: "#64748B", fontSize: 16, paddingVertical: 16 },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 16,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondary: {
    alignItems: "center",
    borderColor: "#0F766E",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryText: { color: "#0F766E", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
