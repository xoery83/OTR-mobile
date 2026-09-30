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
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { LedgerSheetHeader } from "./LedgerSheetHeader";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { RateQuote, SettlementValuationSnapshot } from "@/domain/ledger/types";
import { previewValuation } from "@/domain/ledger/valuation";

import { formatLedgerMoney, formatLedgerRate } from "./format";
import type { DisplayEstimate } from "./displayEstimate";
import { proposedExpenseDate } from "./expenseDraft";
import { contentVisual as cv } from "./contentVisual";
import {
  eligibleExpenseQuote,
  expenseValuationMethod,
  fxStatus,
  valuationHistoryPresentation,
} from "./fxPresentation";

function fullDate(day: string, chinese: boolean) {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(chinese ? "zh-CN" : "en-GB", {
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
  const chinese = Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");
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
            setError(chinese ? "无法读取已缓存汇率。" : "Cached rates unavailable.");
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
      label("Confirm Journey value", "确认旅行估值"),
      `${label("Original", "原始金额")}: ${formatLedgerMoney(expense.original.minor, expense.original.currency, expense.original.scale)}\n${explanation}\n${label("Journey value", "旅行估值")}: ${amount}${input.reason ? `\n${label("Reason", "原因")}: ${input.reason}` : ""}`,
      [
        { text: label("Cancel", "取消"), style: "cancel" },
        {
          text: label("Confirm", "确认"),
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
                    "Could not save valuation. Check the current evidence and try again.",
                    "无法保存估值。请检查当前证据后重试。",
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
        `${label("Agreed rate", "约定汇率")}: 1 ${expense.original.currency} = ${rate.trim()} ${currency}`,
      );
    } catch {
      setError(label("Enter a positive rate and a reason.", "请输入正数汇率及原因。"));
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
            accessibilityLabel={label("Rate details", "汇率详情")}
            accessibilityState={{ expanded }}
            style={styles.detailsToggle}
            onPress={() => setExpanded(true)}
          >
            <AppIcon color="#0F766E" name="info.circle" size={18} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.meta}>{label("Journey", "旅行估值")}</Text>
      {expanded && crossCurrency ? (
        <Modal
          animationType="slide"
          transparent
          visible={expanded}
          onRequestClose={() => setExpanded(false)}
        >
          <View style={styles.overlay}>
            <Pressable
              accessibilityLabel={label("Close rate details", "关闭汇率详情")}
              accessibilityRole="button"
              onPress={() => setExpanded(false)}
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView edges={["bottom"]} style={styles.sheet}>
              <LedgerSheetHeader
                title={label("Rate details", "汇率详情")}
                leftLabel={label("Close", "关闭")}
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
                    {valuation
                      ? label("JOURNEY VALUE", "旅行估值")
                      : label("ESTIMATED VALUE", "预估金额")}
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
                      ? label("Reference rate", "参考汇率")
                      : policy === "MANUAL_AGREED"
                        ? label("Agreed rate", "约定汇率")
                        : policy === "ACTUAL_PAYER_COST"
                          ? label("Actual payer cost", "实际付款金额")
                          : label("Needs review", "待处理")}
                  </Text>
                  {!valuation && estimate ? (
                    <Text style={styles.caption}>
                      {label(
                        "Display estimate · not a recorded Journey value",
                        "仅供展示的预估 · 尚未记录为旅行估值",
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
                      {label("Reference rate not published yet", "当日参考汇率尚未发布")}
                    </Text>
                  ) : null}
                </View>
                {valuation?.decimalRate || estimatedRate ? (
                  <View style={styles.infoCard}>
                    <Text style={styles.cardTitle}>
                      {label("Exchange rate", "换算汇率")}
                    </Text>
                    <Text style={styles.rateText}>
                      1 {expense.original.currency} ={" "}
                      {formatLedgerRate(valuation?.decimalRate ?? estimatedRate!)}{" "}
                      {currency}
                    </Text>
                  </View>
                ) : null}
                {referenceDate ? (
                  <View style={styles.infoCard}>
                    <Text style={styles.cardTitle}>
                      {label("Rate source", "汇率依据")}
                    </Text>
                    {valuation?.referenceEvidence ? (
                      <DetailRow
                        label={label("Expense date", "消费日期")}
                        value={fullDate(
                          valuation.referenceEvidence.economicDate,
                          chinese,
                        )}
                      />
                    ) : null}
                    <DetailRow
                      label={label("Rate date", "汇率日期")}
                      value={fullDate(referenceDate, chinese)}
                    />
                    <DetailRow
                      label={label("Source", "来源")}
                      value={label(
                        "European Central Bank · via Frankfurter",
                        "欧洲中央银行 · 经 Frankfurter 提供",
                      )}
                    />
                    {estimate?.referenceDate &&
                    estimate.referenceDate !== expense.economicDate ? (
                      <Text style={styles.caption}>
                        {label(
                          "Using the latest cached rate available for this date.",
                          "使用该日期可用的最新缓存汇率。",
                        )}
                      </Text>
                    ) : null}
                    <Text style={styles.caption}>
                      {label(
                        "Reference rates estimate value; they do not prove card or bank cost.",
                        "参考汇率仅用于估值，不代表银行卡或银行的实际付款金额。",
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
                    <Text style={styles.cardTitle}>{label("Note", "说明")}</Text>
                    <Text style={styles.meta}>{valuation.reason}</Text>
                  </View>
                ) : null}
                {valuation?.policy === "ACTUAL_PAYER_COST" ? (
                  <Text style={styles.caption}>
                    {label(
                      "Based on posted payer evidence, not a market exchange rate.",
                      "依据付款人的入账凭证，而非市场汇率。",
                    )}
                  </Text>
                ) : null}
                {locked ? (
                  <Text style={styles.meta}>
                    {label(
                      expense.economicDate === null
                        ? "The earlier Settlement value is frozen. Confirm the current transaction date to obtain its own reference valuation."
                        : "The earlier Settlement value remains frozen.",
                      expense.economicDate === null
                        ? "历史结算估值已冻结。确认当前交易日期后将自动获取参考估值。"
                        : "历史结算估值保持冻结。",
                    )}
                  </Text>
                ) : null}
                {editable ? (
                  <View style={styles.actions}>
                    <Text style={styles.cardTitle}>
                      {label("Change Journey value", "更改旅行估值")}
                    </Text>
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
                            ? label("Edit agreed rate", "修改约定汇率")
                            : label("Use agreed rate", "使用约定汇率")}
                        </Text>
                      </Pressable>
                    ) : (
                      <>
                        <Text style={styles.meta}>
                          1 {expense.original.currency} = X {currency}
                        </Text>
                        <TextInput
                          accessibilityLabel={label("Agreed rate", "约定汇率")}
                          keyboardType="decimal-pad"
                          placeholder={label("Rate", "汇率")}
                          value={rate}
                          onChangeText={setRate}
                          style={styles.input}
                        />
                        <TextInput
                          accessibilityLabel={label("Reason, required", "原因，必填")}
                          placeholder={label("Reason (required)", "原因（必填）")}
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
                            {label("Preview agreed rate", "预览约定汇率")}
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
                            `${label("Posted payer cost", "付款人入账金额")}: ${formatLedgerMoney(payment.posted!.minor, currency, scale)}\n${label("This uses the payer's posted cost, not a market rate.", "使用实际入账金额，而非市场汇率。")}`,
                          )
                        }
                      >
                        <Text style={styles.secondaryActionText}>
                          {label("Use actual payer cost", "使用实际付款金额")} ·{" "}
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
                            `1 ${expense.original.currency} = ${formatLedgerRate(quote.decimalRate)} ${currency}\n${label("Reference date", "参考汇率日期")}: ${fullDate(quote.referenceDate!, chinese)}`,
                          );
                        }}
                      >
                        <Text style={styles.secondaryActionText}>
                          {label("Use reference rate", "使用参考汇率")}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {busy ? (
                  <ActivityIndicator
                    accessibilityLabel={label("Saving valuation", "正在保存估值")}
                  />
                ) : null}
                {error ? (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {error}
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
                          ? label("Hide valuation history", "收起估值历史")
                          : label("View valuation history", "查看估值历史")}
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
                                  {new Intl.DateTimeFormat(chinese ? "zh-CN" : "en-GB", {
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
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flexShrink: 1, gap: 4 },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.25)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "85%",
    overflow: "hidden",
  },
  scroll: { flexGrow: 0 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  label: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  value: {
    color: cv.color.accent,
    fontSize: 20,
    lineHeight: 44,
    fontWeight: "700",
    flexShrink: 1,
  },
  meta: { color: "#475569", fontSize: 14, lineHeight: 21 },
  details: {
    gap: 14,
    borderTopColor: "#E5E7EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: cv.color.page,
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: cv.color.card,
    borderRadius: cv.radius.card,
    gap: 5,
    padding: 16,
  },
  eyebrow: {
    color: cv.color.secondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  summaryValue: { color: cv.color.accent, fontSize: 28, fontWeight: "700" },
  infoCard: {
    backgroundColor: cv.color.card,
    borderRadius: cv.radius.card,
    gap: 10,
    padding: 16,
  },
  cardTitle: { color: cv.color.text, fontSize: 15, fontWeight: "700" },
  rateText: { color: cv.color.text, fontSize: 17, fontWeight: "600" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { color: cv.color.secondary, fontSize: 13, flexShrink: 1 },
  detailValue: {
    color: cv.color.text,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  caption: { color: cv.color.secondary, fontSize: 12, lineHeight: 18 },
  actions: { gap: 10, marginTop: 4 },
  primaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: cv.color.accent,
    borderRadius: cv.radius.control,
  },
  primaryActionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  secondaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: cv.color.card,
    borderColor: cv.color.accent,
    borderWidth: 1,
    borderRadius: cv.radius.control,
  },
  secondaryActionText: { color: cv.color.accent, fontSize: 15, fontWeight: "700" },
  detailsToggle: {
    minHeight: 44,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsToggleText: { color: "#0F766E", fontSize: 14, fontWeight: "600" },
  input: {
    minHeight: 44,
    borderColor: "#94A3B8",
    borderWidth: 1,
    borderRadius: 9,
    padding: 10,
    fontSize: 16,
  },
  error: { color: "#B91C1C", fontSize: 14 },
});
