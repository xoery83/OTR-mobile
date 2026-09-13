import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useState } from "react";
import { router } from "expo-router";

import {
  type Stage7Finalized,
  type Stage7Preview,
  useStage7Settlement,
} from "@/hooks/useStage7Settlement";

import { formatLedgerMoney } from "./format";
import { currencyScale } from "@/domain/ledger/currency";
import type { RepaymentProposition } from "@/domain/ledger/paymentLifecycle";

export function SettlementReadinessScreen({
  journeyId,
  embedded = false,
}: {
  journeyId?: string;
  embedded?: boolean;
}) {
  const settlement = useStage7Settlement(journeyId);
  const {
    actorMemberId,
    adjustmentPreview,
    busy,
    exports,
    finalized,
    isOrganizer,
    lineage,
    message,
    preview,
  } = settlement;
  const [payingTransferId, setPayingTransferId] = useState<string | null>(null);
  const [correctingPaymentId, setCorrectingPaymentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("");
  const [dischargeAmount, setDischargeAmount] = useState("");
  const [repaymentRate, setRepaymentRate] = useState("");
  const [paymentReason, setPaymentReason] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [showStatement, setShowStatement] = useState(false);
  const canExport =
    isOrganizer &&
    finalized?.adjustmentState === "CURRENT" &&
    lineage
      .flatMap((row) => row.transfers)
      .every(
        (transfer) =>
          transfer.status === "SETTLED" &&
          transfer.confirmedRemaining.minor === 0 &&
          transfer.awaitingAmount.minor === 0,
      );

  const confirmFinalize = () => {
    if (!preview || preview.state !== "PREVIEW_READY") return;
    Alert.alert(
      "Finalize settlement?",
      "This freezes the listed Expenses and creates real transfer obligations.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finalize", onPress: () => void settlement.finalize(preview) },
      ],
    );
  };

  if (!settlement.journeyId) {
    return <Text style={styles.body}>Choose a Journey to prepare settlement.</Text>;
  }

  const content = (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        Settlement
      </Text>
      <Text style={styles.body}>
        Preview uses canonical server data. Suggested transfers become obligations only
        after finalization.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy || Boolean(finalized)}
        onPress={() => void settlement.prepare()}
        style={[styles.primary, busy && styles.disabled]}
      >
        <Text style={styles.primaryText}>
          {finalized ? "Settlement finalized" : "Prepare settlement"}
        </Text>
      </Pressable>
      {busy ? <ActivityIndicator accessibilityLabel="Preparing settlement" /> : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {preview ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            {preview.state === "PREVIEW_READY" ? "Ready to finalize" : "Needs attention"}
          </Text>
          <Text style={styles.meta}>
            {preview.inputs.length} included · {preview.exclusions.length} excluded
          </Text>
          {preview.blockers.map((blocker) => (
            <Pressable
              accessibilityRole="button"
              key={`${blocker.expenseId}-${blocker.reason}`}
              onPress={() => router.push(`/expenses/expense/${blocker.expenseId}`)}
              style={styles.blocker}
            >
              <Text style={styles.warning}>
                {blocker.reason === "RATE_REQUIRED" ? "Rate required" : "Open conflict"}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                Expense {blocker.expenseId}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.section}>MEMBER BALANCES</Text>
          {preview.balances.map((balance) => (
            <View key={balance.memberId} style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>{balance.displayNameSnapshot}</Text>
                <Text style={styles.meta}>
                  Covered{" "}
                  {formatLedgerMoney(balance.paidMinor, balance.currency, balance.scale)}
                  {" · "}Share{" "}
                  {formatLedgerMoney(balance.owedMinor, balance.currency, balance.scale)}
                </Text>
              </View>
              <Text style={styles.amount}>
                {formatLedgerMoney(balance.netMinor, balance.currency, balance.scale)}
              </Text>
            </View>
          ))}
          <Text style={styles.section}>SUGGESTED TRANSFERS</Text>
          {preview.transfers.map((transfer) => (
            <Text
              key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
              style={styles.body}
            >
              {name(preview, transfer.fromMemberId)} →{" "}
              {name(preview, transfer.toMemberId)} ·{" "}
              {formatLedgerMoney(
                transfer.amount.minor,
                transfer.amount.currency,
                transfer.amount.scale,
              )}
            </Text>
          ))}
          {preview.state === "PREVIEW_READY" ? (
            <Pressable
              accessibilityHint="Creates immutable transfer obligations"
              accessibilityRole="button"
              disabled={busy}
              onPress={confirmFinalize}
              style={[styles.primary, busy && styles.disabled]}
            >
              <Text style={styles.primaryText}>Finalize settlement</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {finalized ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Finalized
          </Text>
          <Text style={styles.meta}>
            {finalized.inputs.length} frozen Expenses · {lineage.length - 1} Adjustments
          </Text>
          {finalized.adjustmentState === "ADJUSTMENT_REQUIRED" ? (
            <Text style={styles.warning}>
              Canonical financial facts changed · Adjustment required
            </Text>
          ) : finalized.adjustmentState === "ADJUSTMENT_BLOCKED" ? (
            <Text style={styles.warning}>
              Adjustment blocked · resolve rates or conflicts
            </Text>
          ) : (
            <Text style={styles.status}>Canonical financial facts are current</Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void settlement.prepareAdjustment()}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Preview Adjustment</Text>
          </Pressable>

          {adjustmentPreview ? (
            <View style={styles.adjustmentCard}>
              <Text style={styles.rowTitle}>
                {adjustmentPreview.state === "PREVIEW_BLOCKED"
                  ? "Adjustment blocked"
                  : adjustmentPreview.state === "PREVIEW_UNCHANGED"
                    ? "No Adjustment required"
                    : adjustmentPreview.zeroTransfer
                      ? "Changed financial input · zero transfer"
                      : "Adjustment ready"}
              </Text>
              {adjustmentPreview.balances
                .filter((balance) => balance.deltaMinor !== 0)
                .map((balance) => (
                  <Text key={balance.memberId} style={styles.body}>
                    {balance.displayNameSnapshot} · delta{" "}
                    {formatLedgerMoney(
                      balance.deltaMinor,
                      balance.currency,
                      balance.scale,
                    )}
                  </Text>
                ))}
              {adjustmentPreview.blockers.map((blocker) => (
                <Text
                  key={`${blocker.expenseId}-${blocker.reason}`}
                  style={styles.warning}
                >
                  {blocker.reason.replaceAll("_", " ")} · {blocker.expenseId}
                </Text>
              ))}
              {adjustmentPreview.state === "PREVIEW_READY" && isOrganizer ? (
                <>
                  <TextInput
                    accessibilityLabel="Adjustment reason"
                    onChangeText={setAdjustmentReason}
                    placeholder="Required Adjustment reason"
                    style={styles.input}
                    value={adjustmentReason}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || !adjustmentReason.trim()}
                    onPress={() => {
                      void settlement.finalizeAdjustment(
                        adjustmentPreview,
                        adjustmentReason.trim(),
                      );
                      setAdjustmentReason("");
                    }}
                    style={[
                      styles.primary,
                      (busy || !adjustmentReason.trim()) && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryText}>Finalize Adjustment</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}

          {(lineage.length ? lineage : [finalized])
            .flatMap((lineageSettlement) =>
              lineageSettlement.transfers.map((transfer) => ({
                lineageSettlement,
                transfer,
              })),
            )
            .map(({ lineageSettlement, transfer }) => {
              const isPayer = actorMemberId === transfer.fromMemberId;
              const isRecipient = actorMemberId === transfer.toMemberId;
              return (
                <View key={transfer.id} style={styles.transferCard}>
                  <Text style={styles.meta}>
                    {lineageSettlement.kind === "ADJUSTMENT"
                      ? `Adjustment ${lineageSettlement.lineageSequence}`
                      : "Root Settlement"}
                  </Text>
                  <Text style={styles.rowTitle}>
                    {memberName(lineageSettlement, transfer.fromMemberId)} →{" "}
                    {memberName(lineageSettlement, transfer.toMemberId)}
                  </Text>
                  <Text style={styles.body}>
                    Remaining{" "}
                    {formatLedgerMoney(
                      transfer.confirmedRemaining.minor,
                      transfer.confirmedRemaining.currency,
                      transfer.confirmedRemaining.scale,
                    )}
                  </Text>
                  <Text style={styles.meta}>
                    Confirmed{" "}
                    {formatLedgerMoney(
                      transfer.confirmedDischarge.minor,
                      transfer.confirmedDischarge.currency,
                      transfer.confirmedDischarge.scale,
                    )}{" "}
                    · Awaiting{" "}
                    {formatLedgerMoney(
                      transfer.awaitingAmount.minor,
                      transfer.awaitingAmount.currency,
                      transfer.awaitingAmount.scale,
                    )}{" "}
                    · Available{" "}
                    {formatLedgerMoney(
                      transfer.availableToReport.minor,
                      transfer.availableToReport.currency,
                      transfer.availableToReport.scale,
                    )}
                  </Text>
                  <Text style={styles.status}>
                    {transfer.status.replaceAll("_", " ")}
                  </Text>

                  {isPayer && transfer.availableToReport.minor > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setPayingTransferId(transfer.id);
                        setPaymentCurrency(transfer.amount.currency);
                        setPaymentAmount(
                          amountInput(
                            transfer.availableToReport.minor,
                            transfer.amount.scale,
                          ),
                        );
                        setDischargeAmount(
                          amountInput(
                            transfer.availableToReport.minor,
                            transfer.amount.scale,
                          ),
                        );
                      }}
                      style={styles.secondary}
                    >
                      <Text style={styles.secondaryText}>Record Paid</Text>
                    </Pressable>
                  ) : null}

                  {payingTransferId === transfer.id ? (
                    <View style={styles.form}>
                      <TextInput
                        accessibilityLabel="Payment currency"
                        autoCapitalize="characters"
                        maxLength={3}
                        onChangeText={(value) => setPaymentCurrency(value.toUpperCase())}
                        placeholder="Currency"
                        style={styles.input}
                        value={paymentCurrency}
                      />
                      <TextInput
                        accessibilityLabel="Actual payment amount"
                        keyboardType="decimal-pad"
                        onChangeText={setPaymentAmount}
                        placeholder="Actual payment amount"
                        style={styles.input}
                        value={paymentAmount}
                      />
                      {paymentCurrency !== transfer.amount.currency ? (
                        <>
                          <TextInput
                            accessibilityLabel="Settlement amount discharged"
                            keyboardType="decimal-pad"
                            onChangeText={setDischargeAmount}
                            placeholder={`${transfer.amount.currency} discharged`}
                            style={styles.input}
                            value={dischargeAmount}
                          />
                          <TextInput
                            accessibilityLabel="Repayment exchange rate"
                            keyboardType="decimal-pad"
                            onChangeText={setRepaymentRate}
                            placeholder="Settlement currency per payment currency"
                            style={styles.input}
                            value={repaymentRate}
                          />
                        </>
                      ) : null}
                      {paymentCurrency !== transfer.amount.currency ||
                      correctingPaymentId ? (
                        <TextInput
                          accessibilityLabel="Payment reason"
                          onChangeText={setPaymentReason}
                          placeholder={
                            correctingPaymentId ? "Correction reason" : "Agreement reason"
                          }
                          style={styles.input}
                          value={paymentReason}
                        />
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => {
                          const paymentScale = currencyScale(paymentCurrency);
                          const paymentMinor = parseAmount(paymentAmount, paymentScale);
                          const dischargeMinor = parseAmount(
                            paymentCurrency === transfer.amount.currency
                              ? paymentAmount
                              : dischargeAmount,
                            transfer.amount.scale,
                          );
                          if (paymentScale === null || !paymentMinor || !dischargeMinor) {
                            Alert.alert("Check payment amounts");
                            return;
                          }
                          const proposition: RepaymentProposition & {
                            paidAt: string;
                            evidenceAssetId: string | null;
                            notes: string | null;
                          } = {
                            payment: {
                              minor: paymentMinor,
                              currency: paymentCurrency,
                              scale: paymentScale,
                            },
                            assertedDischarge: {
                              minor: dischargeMinor,
                              currency: transfer.amount.currency,
                              scale: transfer.amount.scale,
                            },
                            repaymentValuation:
                              paymentCurrency === transfer.amount.currency
                                ? null
                                : {
                                    decimalRate: repaymentRate,
                                    source: "MANUAL_AGREED",
                                    sourceLabel: "Traveller agreement",
                                    effectiveAt: new Date().toISOString(),
                                    reason: paymentReason,
                                  },
                            feeTreatment: null,
                            paidAt: new Date().toISOString(),
                            evidenceAssetId: null,
                            notes: null,
                          };
                          if (correctingPaymentId) {
                            if (!paymentReason.trim()) {
                              Alert.alert("A correction reason is required");
                              return;
                            }
                            void settlement.correctPayment(
                              correctingPaymentId,
                              proposition,
                              paymentReason.trim(),
                            );
                          } else {
                            void settlement.recordPayment(transfer.id, proposition);
                          }
                          setPayingTransferId(null);
                          setCorrectingPaymentId(null);
                        }}
                        style={styles.primary}
                      >
                        <Text style={styles.primaryText}>
                          {correctingPaymentId ? "Save correction" : "Save Paid"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {transfer.payments.map((payment) => (
                    <View key={payment.id} style={styles.paymentRow}>
                      <Text style={styles.body}>
                        Paid{" "}
                        {formatLedgerMoney(
                          payment.payment.minor,
                          payment.payment.currency,
                          payment.payment.scale,
                        )}{" "}
                        · Discharge{" "}
                        {formatLedgerMoney(
                          payment.assertedDischarge.minor,
                          payment.assertedDischarge.currency,
                          payment.assertedDischarge.scale,
                        )}
                      </Text>
                      <Text style={styles.meta}>
                        {payment.status.replaceAll("_", " ")}
                        {payment.syncStatus !== "SYNCED" ? " · Saved on this device" : ""}
                        {payment.discharge?.confirmationAuthority === "ORGANIZER_OVERRIDE"
                          ? " · Organizer recorded receipt"
                          : ""}
                      </Text>
                      {payment.status === "AWAITING_CONFIRMATION" && isRecipient ? (
                        <View style={styles.actions}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              void settlement.actOnPayment(
                                payment.id,
                                "confirm",
                                null,
                                "RECIPIENT",
                              )
                            }
                            style={styles.secondary}
                          >
                            <Text style={styles.secondaryText}>Received</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              promptReason("Reject payment", (reason) =>
                                settlement.actOnPayment(
                                  payment.id,
                                  "reject",
                                  reason,
                                  "RECIPIENT",
                                ),
                              )
                            }
                            style={styles.secondary}
                          >
                            <Text style={styles.secondaryText}>Reject</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {payment.status === "AWAITING_CONFIRMATION" &&
                      isOrganizer &&
                      !isRecipient ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            promptReason("Organizer receipt override", (reason) =>
                              settlement.actOnPayment(
                                payment.id,
                                "confirm",
                                reason,
                                "ORGANIZER_OVERRIDE",
                              ),
                            )
                          }
                          style={styles.secondary}
                        >
                          <Text style={styles.secondaryText}>
                            Organizer receipt override
                          </Text>
                        </Pressable>
                      ) : null}
                      {payment.status === "AWAITING_CONFIRMATION" &&
                      (isPayer || isRecipient) ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            promptReason("Dispute payment", (reason) =>
                              settlement.actOnPayment(
                                payment.id,
                                "dispute",
                                reason,
                                isPayer ? "PAYER" : "RECIPIENT",
                              ),
                            )
                          }
                          style={styles.linkButton}
                        >
                          <Text style={styles.linkText}>Dispute</Text>
                        </Pressable>
                      ) : null}
                      {isOrganizer && payment.status !== "CONFIRMED" ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setPayingTransferId(transfer.id);
                            setCorrectingPaymentId(payment.id);
                            setPaymentCurrency(payment.payment.currency);
                            setPaymentAmount(
                              amountInput(payment.payment.minor, payment.payment.scale),
                            );
                            setDischargeAmount(
                              amountInput(
                                payment.assertedDischarge.minor,
                                payment.assertedDischarge.scale,
                              ),
                            );
                            setRepaymentRate(
                              payment.repaymentValuation?.decimalRate ?? "",
                            );
                            setPaymentReason("");
                          }}
                          style={styles.linkButton}
                        >
                          <Text style={styles.linkText}>Organizer correction</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              );
            })}

          <Pressable
            accessibilityRole="button"
            onPress={() => setShowStatement((visible) => !visible)}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>
              {showStatement ? "Hide statement basis" : "View explainable statement"}
            </Text>
          </Pressable>
          {showStatement ? (
            <View style={styles.adjustmentCard}>
              {(finalized.outstandingBalances ?? []).map((balance) => (
                <Text key={balance.memberId} style={styles.body}>
                  {balance.displayNameSnapshot} · outstanding{" "}
                  {formatLedgerMoney(
                    balance.amount.minor,
                    balance.amount.currency,
                    balance.amount.scale,
                  )}
                </Text>
              ))}
              {(lineage.length ? lineage : [finalized]).map((row) => (
                <View key={row.id} style={styles.statementSection}>
                  <Text style={styles.rowTitle}>
                    {row.kind === "ADJUSTMENT"
                      ? `Adjustment ${row.lineageSequence}`
                      : "Root Settlement"}
                  </Text>
                  <Text selectable style={styles.meta}>
                    Input digest {row.inputDigest}
                  </Text>
                  {row.balances.map((balance) => (
                    <Text key={balance.memberId} style={styles.body}>
                      {balance.displayNameSnapshot}: covered{" "}
                      {formatLedgerMoney(
                        balance.paidMinor,
                        balance.currency,
                        balance.scale,
                      )}
                      {" · share "}
                      {formatLedgerMoney(
                        balance.owedMinor,
                        balance.currency,
                        balance.scale,
                      )}
                      {" · net "}
                      {formatLedgerMoney(
                        balance.netMinor,
                        balance.currency,
                        balance.scale,
                      )}
                    </Text>
                  ))}
                  {row.inputs.map((input) => (
                    <View key={input.expenseId} style={styles.paymentRow}>
                      <Pressable
                        accessibilityRole="link"
                        onPress={() =>
                          router.push(`/expenses/expense/${input.expenseId}`)
                        }
                      >
                        <Text selectable style={styles.linkText}>
                          Expense {input.expenseId} · revision {input.expenseRevision}
                        </Text>
                      </Pressable>
                      <Text style={styles.body}>
                        {input.payer.displayNameSnapshot} paid{" "}
                        {formatLedgerMoney(
                          input.original.minor,
                          input.original.currency,
                          input.original.scale,
                        )}
                        {" → settlement "}
                        {formatLedgerMoney(
                          input.settlement.minor,
                          input.settlement.currency,
                          input.settlement.scale,
                        )}
                      </Text>
                      <Text style={styles.meta}>
                        {input.valuation.policy}
                        {input.valuation.decimalRate
                          ? ` · rate ${input.valuation.decimalRate}`
                          : ""}
                        {` · ${input.valuation.roundingMode}`}
                      </Text>
                      {input.splits.map((split) => (
                        <Text key={split.member.memberId} style={styles.meta}>
                          {split.member.displayNameSnapshot} ·{" "}
                          {formatLedgerMoney(
                            split.settlementMinor,
                            input.settlement.currency,
                            input.settlement.scale,
                          )}
                          {split.roundingAdjustmentMinor
                            ? ` · rounding ${split.roundingAdjustmentMinor}`
                            : ""}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.section}>FINAL REPORTS</Text>
          {canExport ? (
            <View style={styles.actions}>
              {(["PDF", "CSV"] as const).map((format) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  key={format}
                  onPress={() => choosePrivacy(format, settlement.generateExport)}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Generate {format}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.meta}>
              A new current report requires organizer access, online canonical validation,
              CURRENT lineage and fully settled Transfers.
            </Text>
          )}
          {exports.map((item) => (
            <View
              key={`${item.statementDigest}-${item.privacyMode}-${item.format}`}
              style={styles.exportRow}
            >
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>
                  {item.format} ·{" "}
                  {item.privacyMode === "MEMBER" ? "Member" : "De-identified"}
                </Text>
                <Text style={item.isCurrent ? styles.status : styles.warning}>
                  {item.isCurrent ? "Current" : "Historical"} ·{" "}
                  {item.statementDigest.slice(0, 12)}
                </Text>
              </View>
              {isOrganizer ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void settlement.shareExport(item)}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Open / Share</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
  return embedded ? (
    <View style={styles.content}>{content}</View>
  ) : (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </ScrollView>
  );
}

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

function promptReason(title: string, action: (reason: string) => void) {
  Alert.prompt(title, "A reason is required and will be audited.", (reason) => {
    if (reason?.trim()) void action(reason.trim());
  });
}

function choosePrivacy(
  format: "PDF" | "CSV",
  generate: (format: "PDF" | "CSV", privacy: "MEMBER" | "DE_IDENTIFIED") => void,
) {
  Alert.alert(
    `Generate ${format}`,
    "Member exports contain names and financial amounts. Once shared, the recipient controls the file.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "De-identified", onPress: () => void generate(format, "DE_IDENTIFIED") },
      { text: "Member", onPress: () => void generate(format, "MEMBER") },
    ],
  );
}

function name(preview: Stage7Preview, memberId: string) {
  return (
    preview.members.find((member) => member.memberId === memberId)?.displayNameSnapshot ??
    "Traveller"
  );
}

function memberName(settlement: Stage7Finalized, memberId: string) {
  return (
    settlement.balances.find((balance) => balance.memberId === memberId)
      ?.displayNameSnapshot ??
    settlement.adjustmentDeltas?.find((balance) => balance.memberId === memberId)
      ?.displayNameSnapshot ??
    "Traveller"
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  screenContent: { gap: 12, padding: 16, paddingBottom: 32 },
  title: { color: "#111827", fontSize: 24, fontWeight: "800" },
  body: { color: "#334155", fontSize: 16, lineHeight: 23 },
  note: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  cardTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  section: { color: "#475569", fontSize: 12, fontWeight: "800", marginTop: 6 },
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  rowTitle: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  grow: { flex: 1 },
  amount: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  meta: { color: "#64748B", fontSize: 13, lineHeight: 18 },
  blocker: { borderLeftColor: "#B45309", borderLeftWidth: 3, paddingLeft: 10 },
  warning: { color: "#B45309", fontSize: 14, fontWeight: "800" },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  transferCard: {
    borderTopColor: "#E2E8F0",
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  status: { color: "#0F766E", fontSize: 12, fontWeight: "800" },
  secondary: {
    alignItems: "center",
    borderColor: "#0F766E",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  secondaryText: { color: "#0F766E", fontSize: 15, fontWeight: "800" },
  form: { gap: 8 },
  input: {
    borderColor: "#CBD5E1",
    borderRadius: 9,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  paymentRow: { backgroundColor: "#F8FAFC", borderRadius: 9, gap: 6, padding: 10 },
  adjustmentCard: { backgroundColor: "#F8FAFC", borderRadius: 9, gap: 8, padding: 12 },
  statementSection: { gap: 8 },
  exportRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  actions: { flexDirection: "row", gap: 8 },
  linkButton: { minHeight: 44, justifyContent: "center" },
  linkText: { color: "#B45309", fontSize: 14, fontWeight: "800" },
});
