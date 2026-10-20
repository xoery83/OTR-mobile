import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { UiTextInput } from "@/ui/forms";
import { systemMessage } from "@/ui/domainLabels";
import { MoneyText } from "./MoneyText";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Stack } from "expo-router";

import { currencyScale } from "@/domain/ledger/currency";
import type { RepaymentProposition } from "@/domain/ledger/paymentLifecycle";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney, formatValuationPolicy } from "./format";
import { SheetHeader } from "@/components/SheetHeader";
import { PersonalPaymentSection } from "./PersonalPaymentSection";
import {
  paymentStatusLabel,
  primaryTransferAction,
  settlementMemberName,
  settlementTransferRows,
  transferStatusLabel,
  type FinalizedTransfer,
} from "./settlementPresentation";

export function TransferDetailScreen({
  journeyId,
  transferId,
}: {
  journeyId: string;
  transferId: string;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const settlement = useStage7Settlement(journeyId);
  const row = useMemo(
    () =>
      settlement.journeyId === journeyId
        ? (settlementTransferRows(settlement.finalized, settlement.lineage).find(
            (item) =>
              item.settlement.journeyId === journeyId && item.transfer.id === transferId,
          ) ?? null)
        : null,
    [
      journeyId,
      settlement.finalized,
      settlement.journeyId,
      settlement.lineage,
      transferId,
    ],
  );
  const [showExplanation, setShowExplanation] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [correcting, setCorrecting] = useState<
    FinalizedTransfer["payments"][number] | null
  >(null);

  if (!row) return <TransferNotFound loading={settlement.updating} />;

  const { transfer } = row;
  const from = settlementMemberName(row.settlement, transfer.fromMemberId);
  const to = settlementMemberName(row.settlement, transfer.toMemberId);
  const primaryAction = primaryTransferAction(transfer, settlement.actorMemberId);
  const awaiting = transfer.payments.find(
    (payment) => payment.status === "AWAITING_CONFIRMATION",
  );

  const confirmReceived = () => {
    if (!awaiting) return;
    Alert.alert(
      t("ledgerMigration.copy1"),
      t("transfer.confirmArrival", {
        amount: formatLedgerMoney(
          awaiting.payment.minor,
          awaiting.payment.currency,
          awaiting.payment.scale,
        ),
      }),
      [
        { text: t("ledgerMigration.copy2"), style: "cancel" },
        {
          text: t("ledgerMigration.copy3"),
          onPress: () =>
            void settlement.actOnPayment(awaiting.id, "confirm", null, "RECIPIENT"),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t("navigation.transfer") }} />
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.directionCard}>
          <Text accessibilityRole="header" style={styles.title}>
            {t("transfer.direction", { from, to })}
          </Text>
          <Text style={styles.status}>
            {systemMessage(transferStatusLabel(transfer))}
          </Text>
        </View>

        <View style={styles.amounts}>
          <Amount
            label={t("transfer.originalAmount")}
            minor={transfer.amount.minor}
            transfer={transfer}
          />
          <Amount
            label={t("settlement.paid")}
            minor={transfer.confirmedDischarge.minor}
            transfer={transfer}
          />
          <Amount
            emphasized
            label={t("ui.remaining")}
            minor={transfer.confirmedRemaining.minor}
            transfer={transfer}
          />
        </View>

        {transfer.awaitingAmount.minor > 0 ? (
          <Text style={styles.notice}>
            {t("transfer.awaitingReceipt", {
              amount: formatLedgerMoney(
                transfer.awaitingAmount.minor,
                transfer.awaitingAmount.currency,
                transfer.awaitingAmount.scale,
              ),
              name: to,
            })}
          </Text>
        ) : null}
        {settlement.message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {systemMessage(settlement.message)}
          </Text>
        ) : null}

        <PersonalPaymentSection
          actorMemberId={settlement.actorMemberId}
          from={{ id: transfer.fromMemberId, name: from }}
          journeyId={journeyId}
          settlementCurrency={row.settlement.settlementCurrency}
          to={{ id: transfer.toMemberId, name: to }}
        />

        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {t("ledgerMigration.copy4")}
        </Text>
        {primaryAction === "MARK_PAID" ? (
          <Pressable
            accessibilityRole="button"
            disabled={settlement.busy}
            onPress={() => {
              setCorrecting(null);
              setPaymentOpen(true);
            }}
            style={[styles.primary, settlement.busy && styles.disabled]}
          >
            <Text style={styles.primaryText}>{t("ledgerMigration.copy5")}</Text>
          </Pressable>
        ) : primaryAction === "CONFIRM_RECEIVED" ? (
          <Pressable
            accessibilityRole="button"
            disabled={settlement.busy}
            onPress={confirmReceived}
            style={[styles.primary, settlement.busy && styles.disabled]}
          >
            <Text style={styles.primaryText}>{t("ledgerMigration.copy3")}</Text>
          </Pressable>
        ) : null}

        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {t("ledgerMigration.copy6")}
        </Text>
        <TimelineStep complete label={t("ledgerMigration.copy7")} />
        {transfer.payments.length ? (
          transfer.payments.map((payment) => (
            <View key={payment.id} style={styles.paymentCard}>
              <TimelineStep
                complete
                label={t("transfer.markedAmount", {
                  amount: formatLedgerMoney(
                    payment.payment.minor,
                    payment.payment.currency,
                    payment.payment.scale,
                  ),
                })}
              />
              <TimelineStep
                complete={payment.status === "CONFIRMED"}
                label={systemMessage(paymentStatusLabel(payment))}
              />
              {payment.status === "REJECTED" || payment.status === "DISPUTED" ? (
                <Text style={styles.warning}>
                  {payment.status === "REJECTED"
                    ? t("ledgerMigration.copy8")
                    : t("ledgerMigration.copy9")}
                </Text>
              ) : null}
              {payment.status === "AWAITING_CONFIRMATION" &&
              (settlement.actorMemberId === transfer.fromMemberId ||
                settlement.actorMemberId === transfer.toMemberId) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    promptReason(t("ledgerMigration.copy10"), (reason) =>
                      settlement.actOnPayment(
                        payment.id,
                        "dispute",
                        reason,
                        settlement.actorMemberId === transfer.fromMemberId
                          ? "PAYER"
                          : "RECIPIENT",
                      ),
                    )
                  }
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>{t("ledgerMigration.copy11")}</Text>
                </Pressable>
              ) : null}
              {payment.status === "AWAITING_CONFIRMATION" &&
              settlement.actorMemberId === transfer.toMemberId ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    promptReason(t("ledgerMigration.copy12"), (reason) =>
                      settlement.actOnPayment(payment.id, "reject", reason, "RECIPIENT"),
                    )
                  }
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>{t("ledgerMigration.copy13")}</Text>
                </Pressable>
              ) : null}
              {settlement.isOrganizer && payment.status !== "CONFIRMED" ? (
                <View style={styles.organizerActions}>
                  {payment.status === "AWAITING_CONFIRMATION" &&
                  settlement.actorMemberId !== transfer.toMemberId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        promptReason(t("ledgerMigration.copy14"), (reason) =>
                          settlement.actOnPayment(
                            payment.id,
                            "confirm",
                            reason,
                            "ORGANIZER_OVERRIDE",
                          ),
                        )
                      }
                      style={styles.linkButton}
                    >
                      <Text style={styles.linkText}>{t("ledgerMigration.copy15")}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setCorrecting(payment);
                      setPaymentOpen(true);
                    }}
                    style={styles.linkButton}
                  >
                    <Text style={styles.linkText}>{t("ledgerMigration.copy16")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.meta}>{t("ledgerMigration.copy17")}</Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showExplanation }}
          onPress={() => setShowExplanation((visible) => !visible)}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>
            {showExplanation ? t("ledgerMigration.copy18") : t("ledgerMigration.copy19")}
          </Text>
        </Pressable>
        {showExplanation ? (
          <View style={styles.explanation}>
            <Text style={styles.body}>{t("ledgerMigration.copy20")}</Text>
            {row.settlement.inputs.map((input) => (
              <View key={input.expenseId} style={styles.expenseBasis}>
                <Text style={styles.rowTitle}>
                  {t("transfer.basisPaid", {
                    name: input.payer.displayNameSnapshot,
                    amount: formatLedgerMoney(
                      input.original.minor,
                      input.original.currency,
                      input.original.scale,
                    ),
                  })}
                </Text>
                <Text style={styles.meta}>
                  {t(
                    input.splits.length === 1
                      ? "transfer.basisParticipantsOne"
                      : "transfer.basisParticipantsMany",
                    {
                      policy: formatValuationPolicy(input.valuation.policy),
                      count: input.splits.length,
                    },
                  )}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <PaymentSheet
        correcting={correcting}
        key={correcting?.id ?? `new-${transfer.revision}`}
        onClose={() => setPaymentOpen(false)}
        onCorrect={(paymentId, proposition, reason) =>
          settlement.correctPayment(paymentId, proposition, reason)
        }
        onRecord={(proposition) => settlement.recordPayment(transfer.id, proposition)}
        open={paymentOpen}
        transfer={transfer}
      />
    </>
  );
}

export function TransferNotFound({ loading = false }: { loading?: boolean }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.center}>
      <Text style={styles.meta}>
        {loading ? t("ledgerMigration.copy21") : t("ledgerMigration.copy22")}
      </Text>
    </View>
  );
}

function Amount({
  emphasized = false,
  label,
  minor,
  transfer,
}: {
  emphasized?: boolean;
  label: string;
  minor: number;
  transfer: FinalizedTransfer;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.amountRow, largeText && styles.amountRowLarge]}>
      <Text style={styles.meta}>{label}</Text>
      <MoneyText
        style={[
          emphasized ? styles.remainingAmount : styles.amount,
          largeText && styles.amountLarge,
        ]}
        variant="headline"
        minor={minor}
        currency={transfer.amount.currency}
        scale={transfer.amount.scale}
      />
    </View>
  );
}

function TimelineStep({ complete, label }: { complete: boolean; label: string }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.timelineRow}>
      <Text importantForAccessibility="no" style={complete ? styles.dotDone : styles.dot}>
        {complete ? "●" : "○"}
      </Text>
      <Text style={complete ? styles.timelineDone : styles.timelinePending}>{label}</Text>
    </View>
  );
}

function PaymentSheet({
  correcting,
  onClose,
  onCorrect,
  onRecord,
  open,
  transfer,
}: {
  correcting: FinalizedTransfer["payments"][number] | null;
  onClose: () => void;
  onCorrect: (
    paymentId: string,
    proposition: RepaymentProposition & PaymentMetadata,
    reason: string,
  ) => Promise<void>;
  onRecord: (proposition: RepaymentProposition & PaymentMetadata) => Promise<void>;
  open: boolean;
  transfer: FinalizedTransfer;
}) {
  const source = correcting;
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [currency, setCurrency] = useState(
    source?.payment.currency ?? transfer.amount.currency,
  );
  const [paymentAmount, setPaymentAmount] = useState(
    amountInput(
      source?.payment.minor ?? transfer.availableToReport.minor,
      source?.payment.scale ?? transfer.amount.scale,
    ),
  );
  const [settlementAmount, setSettlementAmount] = useState(
    amountInput(
      source?.assertedDischarge.minor ?? transfer.availableToReport.minor,
      source?.assertedDischarge.scale ?? transfer.amount.scale,
    ),
  );
  const [rate, setRate] = useState(source?.repaymentValuation?.decimalRate ?? "");
  const [reason, setReason] = useState("");

  const save = async () => {
    const scale = currencyScale(currency);
    const paymentMinor = parseAmount(paymentAmount, scale);
    const countsMinor = parseAmount(
      currency === transfer.amount.currency ? paymentAmount : settlementAmount,
      transfer.amount.scale,
    );
    if (scale === null || !paymentMinor || !countsMinor) {
      Alert.alert(t("ledgerMigration.copy23"));
      return;
    }
    if (countsMinor > transfer.availableToReport.minor && !correcting) {
      Alert.alert(t("ledgerMigration.copy24"), t("ledgerMigration.copy25"));
      return;
    }
    if ((currency !== transfer.amount.currency || correcting) && !reason.trim()) {
      Alert.alert(t("ledgerMigration.copy26"));
      return;
    }
    const proposition: RepaymentProposition & PaymentMetadata = {
      payment: { minor: paymentMinor, currency, scale },
      assertedDischarge: {
        minor: countsMinor,
        currency: transfer.amount.currency,
        scale: transfer.amount.scale,
      },
      repaymentValuation:
        currency === transfer.amount.currency
          ? null
          : {
              decimalRate: rate,
              source: "MANUAL_AGREED",
              // ui-foundation-exception: string -- Stored payment evidence source; preserve existing financial payload.
              sourceLabel: "Traveller agreement",
              effectiveAt: new Date().toISOString(),
              reason: reason.trim(),
            },
      feeTreatment: null,
      paidAt: new Date().toISOString(),
      evidenceAssetId: null,
      notes: null,
    };
    if (correcting) await onCorrect(correcting.id, proposition, reason.trim());
    else await onRecord(proposition);
    onClose();
  };

  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={open}
    >
      <SheetHeader
        leftLabel={t("common.cancel")}
        onLeft={onClose}
        onRight={() => void save()}
        rightLabel={t("ui.save")}
        title={source ? t("ledgerMigration.copy16") : t("ledgerMigration.copy5")}
      />
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.sheet}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <UiTextInput
          accessibilityLabel={t("ledgerMigration.copy27")}
          autoCapitalize="characters"
          maxLength={3}
          onChangeText={(value) => setCurrency(value.toUpperCase())}
          placeholder={t("navigation.currency")}
          style={styles.input}
          value={currency}
        />
        <UiTextInput
          accessibilityLabel={t("ledgerMigration.copy28")}
          autoFocus
          keyboardType="decimal-pad"
          onChangeText={setPaymentAmount}
          placeholder={t("ledgerMigration.copy28")}
          style={styles.largeInput}
          value={paymentAmount}
        />
        {currency !== transfer.amount.currency ? (
          <>
            <UiTextInput
              accessibilityLabel={t("transfer.countedCurrency", {
                currency: transfer.amount.currency,
              })}
              keyboardType="decimal-pad"
              onChangeText={setSettlementAmount}
              placeholder={t("transfer.countedCurrency", {
                currency: transfer.amount.currency,
              })}
              style={styles.input}
              value={settlementAmount}
            />
            <UiTextInput
              accessibilityLabel={t("format.agreedRate")}
              keyboardType="decimal-pad"
              onChangeText={setRate}
              placeholder={t("format.agreedRate")}
              style={styles.input}
              value={rate}
            />
          </>
        ) : null}
        {currency !== transfer.amount.currency || correcting ? (
          <UiTextInput
            accessibilityLabel={t("ledgerMigration.copy29")}
            onChangeText={setReason}
            placeholder={
              correcting ? t("reviewFlow.copy87") : t("ledgerMigration.copy30")
            }
            style={styles.input}
            value={reason}
          />
        ) : null}
        <Text style={styles.meta}>{t("ledgerMigration.copy31")}</Text>
      </ScrollView>
    </Modal>
  );
}

type PaymentMetadata = {
  paidAt: string;
  evidenceAssetId: string | null;
  notes: string | null;
};

function parseAmount(value: string, scale: number | null) {
  if (scale === null) return null;
  const match = new RegExp(`^(\\d+)(?:\\.(\\d{1,${scale}}))?$`).exec(value.trim());
  if (!match) return null;
  const minor =
    Number(match[1]) * 10 ** scale + Number((match[2] ?? "").padEnd(scale, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function amountInput(minor: number, scale: number) {
  const divisor = 10 ** scale;
  return scale === 0
    ? String(minor)
    : `${Math.floor(minor / divisor)}.${String(minor % divisor).padStart(scale, "0")}`;
}

function promptReason(title: string, action: (reason: string) => Promise<void>) {
  Alert.prompt(title, t("ledgerMigration.copy32"), (reason) => {
    if (reason?.trim()) void action(reason.trim());
  });
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    center: {
      backgroundColor: colors.background,
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 24,
    },
    content: { gap: 14, padding: 16, paddingBottom: 40 },
    directionCard: {
      backgroundColor: colors.accentSurface,
      borderRadius: 16,
      gap: 6,
      padding: 18,
    },
    title: { color: colors.textPrimary, fontSize: 24, fontWeight: "800" },
    status: { color: colors.accent, fontSize: 16, fontWeight: "800" },
    amounts: { backgroundColor: colors.surface, borderRadius: 14, padding: 14 },
    amountRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 44 },
    amountRowLarge: {
      alignItems: "flex-start",
      flexDirection: "column",
      paddingVertical: 8,
    },
    amount: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: "700",
      marginLeft: "auto",
    },
    remainingAmount: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: "800",
      marginLeft: "auto",
    },
    amountLarge: { marginLeft: 0 },
    notice: {
      backgroundColor: colors.warningSurface,
      borderRadius: 12,
      color: colors.warning,
      fontSize: 15,
      lineHeight: 21,
      padding: 12,
    },
    message: { color: colors.accent, fontSize: 14, fontWeight: "700" },
    sectionTitle: { color: colors.textPrimary, ...visual.type.section, marginTop: 4 },
    timelineRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 32 },
    dotDone: { color: colors.accent, fontSize: 18 },
    dot: { color: colors.disabled, fontSize: 18 },
    timelineDone: { color: colors.textPrimary, flex: 1, fontSize: 15, fontWeight: "600" },
    timelinePending: { color: colors.textSecondary, flex: 1, fontSize: 15 },
    paymentCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      gap: 6,
      padding: 12,
    },
    warning: { color: colors.warning, fontSize: 14, lineHeight: 20 },
    organizerActions: {
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 4,
      paddingTop: 6,
    },
    explanation: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      gap: 10,
      padding: 14,
    },
    expenseBasis: {
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 4,
      paddingTop: 8,
    },
    rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
    body: { color: colors.textSecondary, fontSize: 15, lineHeight: 21 },
    meta: { color: colors.textSecondary, flex: 1, fontSize: 14, lineHeight: 20 },
    primary: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 50,
      paddingHorizontal: 16,
    },
    primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
    secondary: {
      alignItems: "center",
      borderColor: colors.accent,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 16,
    },
    secondaryText: { color: colors.accent, fontSize: 16, fontWeight: "800" },
    linkButton: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
    linkText: { color: colors.accent, fontSize: 15, fontWeight: "800" },
    disabled: { opacity: 0.5 },
    sheet: { gap: 12, padding: 20, paddingBottom: 40 },
    input: {
      borderColor: colors.separator,
      borderRadius: 10,
      borderWidth: 1,
      color: colors.textPrimary,
      fontSize: 16,
      minHeight: 50,
      paddingHorizontal: 12,
    },
    largeInput: {
      borderColor: colors.separator,
      borderRadius: 10,
      borderWidth: 1,
      color: colors.textPrimary,
      fontSize: 28,
      fontWeight: "800",
      minHeight: 64,
      paddingHorizontal: 12,
    },
  });
