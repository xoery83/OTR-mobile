import { systemMessage } from "@/ui/domainLabels";
import { t, getFormatLocale } from "@/ui/locale";
import { UiTextInput as TextInput } from "@/ui/forms";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { MoneyText } from "./MoneyText";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { RateQuote, SettlementValuationSnapshot } from "@/domain/ledger/types";
import { previewValuation } from "@/domain/ledger/valuation";

import { formatLedgerMoney, formatLedgerRate } from "./format";
import type { DisplayEstimate } from "./displayEstimate";
import { proposedExpenseDate } from "./expenseDraft";
import { visual as cv } from "@/ui/visual";
import {
  eligibleExpenseQuote,
  expenseValuationMethod,
  fxStatus,
  valuationHistoryPresentation,
} from "./fxPresentation";

function fullDate(day: string, chinese: boolean) {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(getFormatLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

export function ExpenseFxDetails({
  expense,
  currency,
  scale,
  canChange,
  locked,
  estimate,
  blocked,
  onChanged,
}: {
  expense: LedgerExpense;
  currency: string;
  scale: number;
  canChange: boolean;
  locked: boolean;
  estimate: DisplayEstimate | null;
  blocked: boolean;
  onChanged: (expense: LedgerExpense) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const chinese = useUiLocale() === "zh-Hans";
  const label = (en: string, zh: string) => (chinese ? zh : en);
  const [expanded, setExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [manual, setManual] = useState(false);
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
  const [previous, setPrevious] = useState<SettlementValuationSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valuation = expense.valuation;
  const policy = expenseValuationMethod(expense);
  const crossCurrency = expense.original.currency !== currency;
  const pending = expense.syncStatus !== "SYNCED";
  const editable =
    crossCurrency &&
    canChange &&
    !locked &&
    !blocked &&
    !pending &&
    expense.status !== "DELETED";
  const quote = eligibleExpenseQuote(expense, quotes, currency);
  const estimatedRate =
    estimate && "decimalRate" in estimate && typeof estimate.decimalRate === "string"
      ? estimate.decimalRate
      : quotes.find((item) => item.id === estimate?.quoteId)?.decimalRate;
  const referenceDate =
    valuation?.referenceEvidence?.referenceDate ?? estimate?.referenceDate;
  const payments = expense.paymentRecords.filter(
    (record) =>
      record.posted?.currency === currency &&
      record.posted.scale === scale &&
      !expense.paymentRecords.some(
        (next) => next.supersedesPaymentRecordId === record.id,
      ),
  );
  useEffect(() => {
    let active = true;
    if (expanded && crossCurrency) {
      void getDefaultLedgerExpenseRepository()
        .then(async (repo) =>
          Promise.all([
            repo.listRateQuotes(expense.journeyId, expense.original.currency, currency),
            repo.listPreviousValuations(expense.id),
          ]),
        )
        .then(([items, history]) => {
          if (active) {
            setQuotes(items);
            setPrevious(history);
          }
        })
        .catch(() => {
          if (active)
            setError(
              chinese ? t("ui.cachedRatesUnavailable") : t("ui.cachedRatesUnavailable"),
            );
        });
    }
    return () => {
      active = false;
    };
  }, [
    expanded,
    crossCurrency,
    expense.id,
    expense.journeyId,
    expense.original.currency,
    currency,
    chinese,
    expense.valuation?.id,
  ]);

  const submit = (
    input: Parameters<
      Awaited<ReturnType<typeof getDefaultLedgerExpenseRepository>>["applyValuation"]
    >[1],
    amount: string,
    explanation: string,
  ) => {
    if (busy || !editable) return;
    Alert.alert(
      t("ui.confirmJourneyValue"),
      `${t("ui.original")}: ${formatLedgerMoney(expense.original.minor, expense.original.currency, expense.original.scale)}\n${explanation}\n${label(t("ui.journeyValue"), t("ui.journeyValue2"))}: ${amount}${input.reason ? `\n${t("ui.reason")}: ${input.reason}` : ""}`,
      [
        { text: t("ui.cancel"), style: "cancel" },
        {
          text: t("ui.confirm"),
          onPress: () => {
            setBusy(true);
            setError(null);
            void getDefaultLedgerExpenseRepository()
              .then((repo) => repo.applyValuation(expense.id, input))
              .then((updated) => {
                onChanged(updated);
                setManual(false);
                setRate("");
                setReason("");
                kickLedgerOperationalSync();
              })
              .catch(() =>
                setError(
                  label(
                    t("ui.couldNotSaveValuationCheckTheCurrentEvidenceAndTry"),
                    t("ui.couldNotSaveValuationCheckTheCurrentEvidenceAndTry"),
                  ),
                ),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };
  const manualPreview = () => {
    try {
      const result = previewValuation({
        policy: "MANUAL_AGREED",
        original: expense.original,
        settlementCurrency: currency,
        settlementScale: scale,
        manualRate: rate.trim(),
        reason,
      });
      submit(
        { policy: "MANUAL_AGREED", manualRate: rate.trim(), reason: reason.trim() },
        formatLedgerMoney(result.settlement.minor, currency, scale),
        `${t("fx.copy0")}: 1 ${expense.original.currency} = ${rate.trim()} ${currency}`,
      );
    } catch {
      setError(t("ui.enterAPositiveRateAndAReason"));
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.valueRow}>
        <MoneyText
          variant="headline"
          style={styles.value}
          minor={valuation ? valuation.settlement.minor : (estimate?.money.minor ?? null)}
          currency={valuation?.settlement.currency ?? currency}
          scale={valuation?.settlement.scale ?? scale}
          prefix={!valuation && estimate ? "≈ " : ""}
          placeholder={`${currency}—`}
        />
        {crossCurrency ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("ui.rateDetails")}
            accessibilityState={{ expanded }}
            style={styles.detailsToggle}
            onPress={() => setExpanded(true)}
          >
            <AppIcon color={colors.accent} name="info.circle" size={18} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.meta}>{t("common.journey")}</Text>
      {expanded && crossCurrency ? (
        <Modal
          animationType="slide"
          transparent
          visible={expanded}
          onRequestClose={() => setExpanded(false)}
        >
          <View style={styles.overlay}>
            <Pressable
              accessibilityLabel={t("ui.closeRateDetails")}
              accessibilityRole="button"
              onPress={() => setExpanded(false)}
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView edges={["bottom"]} style={styles.sheet}>
              <SheetHeader
                title={t("ui.rateDetails")}
                leftLabel={t("ui.close")}
                onLeft={() => setExpanded(false)}
                safeTop={false}
              />
              <ScrollView
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={styles.details}
              >
                <View style={styles.summaryCard}>
                  <Text style={styles.eyebrow}>
                    {valuation ? t("ui.journeyValue2") : t("ui.estimatedValue")}
                  </Text>
                  <MoneyText
                    variant="headline"
                    style={styles.summaryValue}
                    minor={
                      valuation
                        ? valuation.settlement.minor
                        : (estimate?.money.minor ?? null)
                    }
                    currency={valuation?.settlement.currency ?? currency}
                    scale={valuation?.settlement.scale ?? scale}
                    prefix={!valuation && estimate ? "≈ " : ""}
                    placeholder={`${currency}—`}
                  />
                  <Text style={styles.meta}>
                    {policy === "REFERENCE_RATE"
                      ? t("ui.referenceRate2")
                      : policy === "MANUAL_AGREED"
                        ? t("ui.agreedRate")
                        : policy === "ACTUAL_PAYER_COST"
                          ? t("ui.actualPayerCost")
                          : t("ui.needsReview")}
                  </Text>
                  {!valuation && estimate ? (
                    <Text style={styles.caption}>
                      {label(
                        t("ui.displayEstimateNotARecordedJourneyValue"),
                        t("ui.displayEstimateNotARecordedJourneyValue"),
                      )}
                    </Text>
                  ) : null}
                  {!valuation &&
                  expense.status === "RATE_REQUIRED" &&
                  proposedExpenseDate(expense) ? (
                    <Text style={styles.caption}>
                      {fxStatus(expense, chinese, policy, blocked, Boolean(estimate))}
                    </Text>
                  ) : null}
                  {!valuation &&
                  estimate &&
                  expense.syncStatus === "SYNCED" &&
                  expense.economicDate === new Date().toISOString().slice(0, 10) ? (
                    <Text style={styles.caption}>
                      {t("ui.referenceRateNotPublishedYet")}
                    </Text>
                  ) : null}
                </View>
                {valuation?.decimalRate || estimatedRate ? (
                  <View style={styles.infoCard}>
                    <Text style={styles.cardTitle}>{t("ui.exchangeRate")}</Text>
                    <Text style={styles.rateText}>
                      {t("ui.1")}
                      {expense.original.currency} ={" "}
                      {formatLedgerRate(valuation?.decimalRate ?? estimatedRate!)}{" "}
                      {currency}
                    </Text>
                  </View>
                ) : null}
                {referenceDate ? (
                  <View style={styles.infoCard}>
                    <Text style={styles.cardTitle}>{t("ui.rateSource")}</Text>
                    {valuation?.referenceEvidence ? (
                      <DetailRow
                        label={t("ui.expenseDate")}
                        value={fullDate(
                          valuation.referenceEvidence.economicDate,
                          chinese,
                        )}
                      />
                    ) : null}
                    <DetailRow
                      label={t("ui.rateDate")}
                      value={fullDate(referenceDate, chinese)}
                    />
                    <DetailRow label={t("ui.source")} value={t("fx.copy1")} />
                    {estimate?.referenceDate &&
                    estimate.referenceDate !== expense.economicDate ? (
                      <Text style={styles.caption}>
                        {label(
                          t("ui.usingTheLatestCachedRateAvailableForThisDate"),
                          t("ui.usingTheLatestCachedRateAvailableForThisDate"),
                        )}
                      </Text>
                    ) : null}
                    <Text style={styles.caption}>
                      {label(
                        t("ui.referenceRatesEstimateValueTheyDoNotProveCardOr"),
                        t("ui.referenceRatesEstimateValueTheyDoNotProveCardOr"),
                      )}
                    </Text>
                  </View>
                ) : null}
                {valuation?.reason &&
                !(
                  valuation.referenceEvidence &&
                  valuation.reason.startsWith("Accepted cached ECB reference rate dated ")
                ) ? (
                  <View style={styles.infoCard}>
                    <Text style={styles.cardTitle}>{t("ui.note")}</Text>
                    <Text style={styles.meta}>{valuation.reason}</Text>
                  </View>
                ) : null}
                {valuation?.policy === "ACTUAL_PAYER_COST" ? (
                  <Text style={styles.caption}>
                    {label(
                      t("ui.basedOnPostedPayerEvidenceNotAMarketExchangeRate"),
                      t("ui.basedOnPostedPayerEvidenceNotAMarketExchangeRate"),
                    )}
                  </Text>
                ) : null}
                {locked ? (
                  <Text style={styles.meta}>
                    {label(
                      expense.economicDate === null
                        ? t(
                            "ui.theEarlierSettlementValueIsFrozenConfirmTheCurrentTransaction",
                          )
                        : t("ui.theEarlierSettlementValueRemainsFrozen"),
                      expense.economicDate === null
                        ? t(
                            "ui.theEarlierSettlementValueIsFrozenConfirmTheCurrentTransaction",
                          )
                        : t("ui.theEarlierSettlementValueRemainsFrozen"),
                    )}
                  </Text>
                ) : null}
                {editable ? (
                  <View style={styles.actions}>
                    <Text style={styles.cardTitle}>{t("ui.changeJourneyValue")}</Text>
                    {!manual ? (
                      <Pressable
                        accessibilityRole="button"
                        style={styles.primaryAction}
                        onPress={() => {
                          setManual(true);
                          setError(null);
                        }}
                      >
                        <Text style={styles.primaryActionText}>
                          {valuation?.policy === "MANUAL_AGREED"
                            ? t("ui.editAgreedRate")
                            : t("ui.useAgreedRate")}
                        </Text>
                      </Pressable>
                    ) : (
                      <>
                        <Text style={styles.meta}>
                          {t("entry.conversionPreview", {
                            original: expense.original.currency,
                            currency,
                          })}
                        </Text>
                        <TextInput
                          accessibilityLabel={t("ui.agreedRate")}
                          keyboardType="decimal-pad"
                          placeholder={t("ui.rate")}
                          value={rate}
                          onChangeText={setRate}
                          style={styles.input}
                        />
                        <TextInput
                          accessibilityLabel={t("ui.reasonRequired")}
                          placeholder={t("ui.reasonRequired2")}
                          value={reason}
                          onChangeText={setReason}
                          style={styles.input}
                        />
                        <Pressable
                          accessibilityRole="button"
                          style={styles.primaryAction}
                          onPress={manualPreview}
                        >
                          <Text style={styles.primaryActionText}>
                            {t("ui.previewAgreedRate")}
                          </Text>
                        </Pressable>
                      </>
                    )}
                    {payments.map((payment) => (
                      <Pressable
                        key={payment.id}
                        accessibilityRole="button"
                        style={styles.secondaryAction}
                        onPress={() =>
                          submit(
                            { policy: "ACTUAL_PAYER_COST", paymentRecordId: payment.id },
                            formatLedgerMoney(payment.posted!.minor, currency, scale),
                            `${t("fx.copy2")}: ${formatLedgerMoney(payment.posted!.minor, currency, scale)}\n${t("fx.copy3")}`,
                          )
                        }
                      >
                        <Text style={styles.secondaryActionText}>
                          {t("ui.useActualPayerCost")} ·{" "}
                          {formatLedgerMoney(payment.posted!.minor, currency, scale)}
                        </Text>
                      </Pressable>
                    ))}
                    {quote && valuation && valuation.policy !== "REFERENCE_RATE" ? (
                      <Pressable
                        accessibilityRole="button"
                        style={styles.secondaryAction}
                        onPress={() => {
                          const result = previewValuation({
                            policy: "REFERENCE_RATE",
                            original: expense.original,
                            settlementCurrency: currency,
                            settlementScale: scale,
                            rateQuote: quote,
                          });
                          submit(
                            {
                              policy: "REFERENCE_RATE",
                              rateQuoteId: quote.id,
                              reason: "Selected reference rate.",
                            },
                            formatLedgerMoney(result.settlement.minor, currency, scale),
                            `1 ${expense.original.currency} = ${formatLedgerRate(quote.decimalRate)} ${currency}\n${t("fx.copy4")}: ${fullDate(quote.referenceDate!, chinese)}`,
                          );
                        }}
                      >
                        <Text style={styles.secondaryActionText}>
                          {t("ui.useReferenceRate")}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {busy ? (
                  <ActivityIndicator accessibilityLabel={t("ui.savingValuation")} />
                ) : null}
                {error ? (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {systemMessage(error)}
                  </Text>
                ) : null}
                {previous.length ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: historyExpanded }}
                      style={styles.detailsToggle}
                      onPress={() => setHistoryExpanded(!historyExpanded)}
                    >
                      <Text style={styles.detailsToggleText}>
                        {historyExpanded
                          ? t("ui.hideValuationHistory")
                          : t("ui.viewValuationHistory")}
                      </Text>
                    </Pressable>
                    {historyExpanded
                      ? previous.map((item) => {
                          const row = valuationHistoryPresentation(
                            item,
                            expense.original,
                            currency,
                            chinese,
                          );
                          return (
                            <View key={item.id}>
                              <Text style={styles.meta}>{row.title}</Text>
                              {row.pair ? (
                                <Text style={styles.meta}>{row.pair}</Text>
                              ) : null}
                              <Text style={styles.meta} accessibilityLabel={row.value}>
                                <MoneyText
                                  variant="compact"
                                  accessible={false}
                                  style={styles.meta}
                                  minor={item.original.minor}
                                  currency={item.original.currency}
                                  scale={item.original.scale}
                                />
                                {" → "}
                                <MoneyText
                                  variant="compact"
                                  accessible={false}
                                  style={styles.meta}
                                  minor={item.settlement.minor}
                                  currency={item.settlement.currency}
                                  scale={item.settlement.scale}
                                />
                              </Text>
                              {row.context.map((line) => (
                                <Text key={line} style={styles.meta}>
                                  {line}
                                </Text>
                              ))}
                              {item.effectiveAt ? (
                                <Text style={styles.meta}>
                                  {new Intl.DateTimeFormat(getFormatLocale(), {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  }).format(new Date(item.effectiveAt))}
                                </Text>
                              ) : null}
                            </View>
                          );
                        })
                      : null}
                  </>
                ) : null}
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    section: { flexShrink: 1, gap: 4 },
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: colors.overlay,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: "85%",
      overflow: "hidden",
    },
    scroll: { flexGrow: 0 },
    valueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    label: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
    value: {
      color: colors.accent,
      fontSize: 20,
      lineHeight: 44,
      fontWeight: "700",
      flexShrink: 1,
    },
    meta: { color: colors.textTertiary, fontSize: 14, lineHeight: 21 },
    details: {
      gap: 14,
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.background,
      padding: 16,
      paddingBottom: 40,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: cv.radius.card,
      gap: 5,
      padding: 16,
    },
    eyebrow: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
    },
    summaryValue: { color: colors.accent, fontSize: 28, fontWeight: "700" },
    infoCard: {
      backgroundColor: colors.surface,
      borderRadius: cv.radius.card,
      gap: 10,
      padding: 16,
    },
    cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
    rateText: { color: colors.textPrimary, fontSize: 17, fontWeight: "600" },
    detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    detailLabel: { color: colors.textSecondary, fontSize: 13, flexShrink: 1 },
    detailValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "600",
      flexShrink: 1,
      textAlign: "right",
    },
    caption: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    actions: { gap: 10, marginTop: 4 },
    primaryAction: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      backgroundColor: colors.accent,
      borderRadius: cv.radius.control,
    },
    primaryActionText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
    secondaryAction: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      backgroundColor: colors.surface,
      borderColor: colors.accent,
      borderWidth: 1,
      borderRadius: cv.radius.control,
    },
    secondaryActionText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
    detailsToggle: {
      minHeight: 44,
      minWidth: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    detailsToggleText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
    input: {
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      minHeight: 44,
      borderColor: colors.disabled,
      borderWidth: 1,
      borderRadius: 9,
      padding: 10,
      fontSize: 16,
    },
    error: { color: colors.destructive, fontSize: 14 },
  });
