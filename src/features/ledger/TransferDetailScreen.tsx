import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { currencyScale } from "@/domain/ledger/currency";
import type { RepaymentProposition } from "@/domain/ledger/paymentLifecycle";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney, formatValuationPolicy } from "./format";
import {
  paymentStatusLabel,
  primaryTransferAction,
  settlementMemberName,
  settlementTransferRows,
  transferStatusLabel,
  type FinalizedTransfer,
} from "./settlementPresentation";

export function TransferDetailScreen() {
  const { id, journeyId } = useLocalSearchParams<{ id: string; journeyId?: string }>();
  const settlement = useStage7Settlement(journeyId);
  const row = useMemo(
    () =>
      settlementTransferRows(settlement.finalized, settlement.lineage).find(
        (item) => item.transfer.id === id,
      ) ?? null,
    [id, settlement.finalized, settlement.lineage],
  );
  const [showExplanation, setShowExplanation] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [correcting, setCorrecting] = useState<
    FinalizedTransfer["payments"][number] | null
  >(null);

  if (!row)
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>
          {settlement.updating ? "Loading transfer…" : "Transfer is not available."}
        </Text>
      </View>
    );

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
      "Confirm received?",
      `Confirm that ${formatLedgerMoney(
        awaiting.payment.minor,
        awaiting.payment.currency,
        awaiting.payment.scale,
      )} arrived.`,
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Confirm received",
          onPress: () =>
            void settlement.actOnPayment(awaiting.id, "confirm", null, "RECIPIENT"),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Transfer" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.directionCard}>
          <Text accessibilityRole="header" style={styles.title}>
            {from} pays {to}
          </Text>
          <Text style={styles.status}>{transferStatusLabel(transfer)}</Text>
        </View>

        <View style={styles.amounts}>
          <Amount
            label="Original amount"
            minor={transfer.amount.minor}
            transfer={transfer}
          />
          <Amount
            label="Paid"
            minor={transfer.confirmedDischarge.minor}
            transfer={transfer}
          />
          <Amount
            emphasized
            label="Remaining"
            minor={transfer.confirmedRemaining.minor}
            transfer={transfer}
          />
        </View>

        {transfer.awaitingAmount.minor > 0 ? (
          <Text style={styles.notice}>
            {formatLedgerMoney(
              transfer.awaitingAmount.minor,
              transfer.awaitingAmount.currency,
              transfer.awaitingAmount.scale,
            )}{" "}
            was marked as paid and is waiting for {to} to confirm receipt.
          </Text>
        ) : null}
        {settlement.message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {settlement.message}
          </Text>
        ) : null}

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
            <Text style={styles.primaryText}>Mark as paid</Text>
          </Pressable>
        ) : primaryAction === "CONFIRM_RECEIVED" ? (
          <Pressable
            accessibilityRole="button"
            disabled={settlement.busy}
            onPress={confirmReceived}
            style={[styles.primary, settlement.busy && styles.disabled]}
          >
            <Text style={styles.primaryText}>Confirm received</Text>
          </Pressable>
        ) : null}

        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Payment progress
        </Text>
        <TimelineStep complete label="Amount due" />
        {transfer.payments.length ? (
          transfer.payments.map((payment) => (
            <View key={payment.id} style={styles.paymentCard}>
              <TimelineStep
                complete
                label={`Marked as paid · ${formatLedgerMoney(
                  payment.payment.minor,
                  payment.payment.currency,
                  payment.payment.scale,
                )}`}
              />
              <TimelineStep
                complete={payment.status === "CONFIRMED"}
                label={paymentStatusLabel(payment)}
              />
              {payment.status === "REJECTED" || payment.status === "DISPUTED" ? (
                <Text style={styles.warning}>
                  {payment.status === "REJECTED"
                    ? "The receiver did not confirm this payment."
                    : "This payment is disputed and needs agreement before continuing."}
                </Text>
              ) : null}
              {payment.status === "AWAITING_CONFIRMATION" &&
              (settlement.actorMemberId === transfer.fromMemberId ||
                settlement.actorMemberId === transfer.toMemberId) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    promptReason("Dispute payment", (reason) =>
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
                  <Text style={styles.linkText}>Dispute this payment</Text>
                </Pressable>
              ) : null}
              {payment.status === "AWAITING_CONFIRMATION" &&
              settlement.actorMemberId === transfer.toMemberId ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    promptReason("Payment not received", (reason) =>
                      settlement.actOnPayment(payment.id, "reject", reason, "RECIPIENT"),
                    )
                  }
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>I did not receive this</Text>
                </Pressable>
              ) : null}
              {settlement.isOrganizer && payment.status !== "CONFIRMED" ? (
                <View style={styles.organizerActions}>
                  {payment.status === "AWAITING_CONFIRMATION" &&
                  settlement.actorMemberId !== transfer.toMemberId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        promptReason("Confirm as organizer", (reason) =>
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
                      <Text style={styles.linkText}>Organizer confirm received</Text>
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
                    <Text style={styles.linkText}>Correct payment</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.meta}>No payment has been marked yet.</Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showExplanation }}
          onPress={() => setShowExplanation((visible) => !visible)}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>
            {showExplanation ? "Hide explanation" : "Why does this transfer exist?"}
          </Text>
        </Pressable>
        {showExplanation ? (
          <View style={styles.explanation}>
            <Text style={styles.body}>
              The group’s finalized Expenses were combined into the fewest transfer
              obligations. These are the Expenses used for this settlement.
            </Text>
            {row.settlement.inputs.map((input) => (
              <View key={input.expenseId} style={styles.expenseBasis}>
                <Text style={styles.rowTitle}>
                  {input.payer.displayNameSnapshot} paid{" "}
                  {formatLedgerMoney(
                    input.original.minor,
                    input.original.currency,
                    input.original.scale,
                  )}
                </Text>
                <Text style={styles.meta}>
                  {formatValuationPolicy(input.valuation.policy)} · {input.splits.length}{" "}
                  participant{input.splits.length === 1 ? "" : "s"}
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
  return (
    <View style={[styles.amountRow, largeText && styles.amountRowLarge]}>
      <Text style={styles.meta}>{label}</Text>
      <Text
        style={[
          emphasized ? styles.remainingAmount : styles.amount,
          largeText && styles.amountLarge,
        ]}
      >
        {formatLedgerMoney(minor, transfer.amount.currency, transfer.amount.scale)}
      </Text>
    </View>
  );
}

function TimelineStep({ complete, label }: { complete: boolean; label: string }) {
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
  const largeText = useWindowDimensions().fontScale > 2;
  const source = correcting;
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
      Alert.alert("Check payment amounts");
      return;
    }
    if (countsMinor > transfer.availableToReport.minor && !correcting) {
      Alert.alert("Amount is too high", "A payment cannot exceed the remaining amount.");
      return;
    }
    if ((currency !== transfer.amount.currency || correcting) && !reason.trim()) {
      Alert.alert("Reason required");
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
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={open}
    >
      <ScrollView
        contentContainerStyle={styles.sheet}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.sheetHeader, largeText && styles.sheetHeaderLarge]}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.headerButton}
          >
            <Text style={styles.linkText}>Cancel</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.sheetTitle}>
            {source ? "Correct payment" : "Mark as paid"}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void save()}
            style={styles.headerButton}
          >
            <Text style={styles.linkText}>Save</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Payment currency"
          autoCapitalize="characters"
          maxLength={3}
          onChangeText={(value) => setCurrency(value.toUpperCase())}
          placeholder="Currency"
          style={styles.input}
          value={currency}
        />
        <TextInput
          accessibilityLabel="Payment amount"
          autoFocus
          keyboardType="decimal-pad"
          onChangeText={setPaymentAmount}
          placeholder="Payment amount"
          style={styles.largeInput}
          value={paymentAmount}
        />
        {currency !== transfer.amount.currency ? (
          <>
            <TextInput
              accessibilityLabel={`Amount counted in ${transfer.amount.currency}`}
              keyboardType="decimal-pad"
              onChangeText={setSettlementAmount}
              placeholder={`Amount counted in ${transfer.amount.currency}`}
              style={styles.input}
              value={settlementAmount}
            />
            <TextInput
              accessibilityLabel="Agreed exchange rate"
              keyboardType="decimal-pad"
              onChangeText={setRate}
              placeholder="Agreed exchange rate"
              style={styles.input}
              value={rate}
            />
          </>
        ) : null}
        {currency !== transfer.amount.currency || correcting ? (
          <TextInput
            accessibilityLabel="Payment reason"
            onChangeText={setReason}
            placeholder={correcting ? "Why is this correction needed?" : "Agreement note"}
            style={styles.input}
            value={reason}
          />
        ) : null}
        <Text style={styles.meta}>
          Marking a payment does not reduce the confirmed balance until the receiver
          confirms it. Offline actions remain queued on this iPhone.
        </Text>
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
  Alert.prompt(
    title,
    "A reason is required and will be kept with the action.",
    (reason) => {
      if (reason?.trim()) void action(reason.trim());
    },
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  directionCard: { backgroundColor: "#E7F5F2", borderRadius: 16, gap: 6, padding: 18 },
  title: { color: "#0F172A", fontSize: 24, fontWeight: "800" },
  status: { color: "#0F766E", fontSize: 16, fontWeight: "800" },
  amounts: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14 },
  amountRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 44 },
  amountRowLarge: {
    alignItems: "flex-start",
    flexDirection: "column",
    paddingVertical: 8,
  },
  amount: { color: "#0F172A", fontSize: 17, fontWeight: "700", marginLeft: "auto" },
  remainingAmount: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "800",
    marginLeft: "auto",
  },
  amountLarge: { marginLeft: 0 },
  notice: {
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    color: "#9A3412",
    fontSize: 15,
    lineHeight: 21,
    padding: 12,
  },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800", marginTop: 4 },
  timelineRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 32 },
  dotDone: { color: "#0F766E", fontSize: 18 },
  dot: { color: "#94A3B8", fontSize: 18 },
  timelineDone: { color: "#0F172A", flex: 1, fontSize: 15, fontWeight: "600" },
  timelinePending: { color: "#64748B", flex: 1, fontSize: 15 },
  paymentCard: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 6, padding: 12 },
  warning: { color: "#9A3412", fontSize: 14, lineHeight: 20 },
  organizerActions: {
    borderTopColor: "#E2E8F0",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingTop: 6,
  },
  explanation: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 10, padding: 14 },
  expenseBasis: {
    borderTopColor: "#E2E8F0",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingTop: 8,
  },
  rowTitle: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  body: { color: "#334155", fontSize: 15, lineHeight: 21 },
  meta: { color: "#64748B", flex: 1, fontSize: 14, lineHeight: 20 },
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
  linkButton: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
  linkText: { color: "#0F766E", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  sheet: { gap: 12, padding: 20, paddingBottom: 40 },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sheetHeaderLarge: { alignItems: "stretch", flexDirection: "column" },
  sheetTitle: { color: "#0F172A", fontSize: 20, fontWeight: "800" },
  headerButton: { justifyContent: "center", minHeight: 44, minWidth: 64 },
  input: {
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 12,
  },
  largeInput: {
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "800",
    minHeight: 64,
    paddingHorizontal: 12,
  },
});
