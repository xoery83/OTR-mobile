import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { RateQuote, SettlementValuationSnapshot } from "@/domain/ledger/types";
import { previewValuation } from "@/domain/ledger/valuation";

import { formatLedgerMoney } from "./format";
import type { DisplayEstimate } from "./displayEstimate";
import { proposedExpenseDate } from "./expenseDraft";
import { eligibleExpenseQuote, fxStatus } from "./fxPresentation";

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
  policy,
  estimate,
  blocked,
  onChanged,
}: {
  expense: LedgerExpense;
  currency: string;
  scale: number;
  canChange: boolean;
  locked: boolean;
  policy: string | null;
  estimate: DisplayEstimate | null;
  blocked: boolean;
  onChanged: (expense: LedgerExpense) => void;
}) {
  const chinese = Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");
  const label = (en: string, zh: string) => (chinese ? zh : en);
  const [expanded, setExpanded] = useState(false);
  const [manual, setManual] = useState(false);
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
  const [previous, setPrevious] = useState<SettlementValuationSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valuation = expense.valuation;
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
      <Text style={styles.label}>{label("JOURNEY VALUE", "旅行估值")}</Text>
      {valuation ? (
        <Text style={styles.value}>
          {formatLedgerMoney(valuation.settlement.minor, currency, scale)}
        </Text>
      ) : estimate ? (
        <Text style={styles.value}>
          ≈ {formatLedgerMoney(estimate.money.minor, currency, scale)}
        </Text>
      ) : (
        <Text style={styles.value}>{currency}—</Text>
      )}
      {crossCurrency &&
      !valuation &&
      expense.status === "RATE_REQUIRED" &&
      proposedExpenseDate(expense) ? (
        <Text style={styles.meta}>
          {estimate ? label("Estimated · ", "估算 · ") : ""}
          {fxStatus(expense, chinese, policy, blocked)}
        </Text>
      ) : null}
      {crossCurrency ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label("Rate details", "汇率详情")}
          accessibilityState={{ expanded }}
          style={styles.detailsToggle}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={styles.detailsToggleText}>
            {label("Rate details", "汇率详情")} {expanded ? "−" : "+"}
          </Text>
        </Pressable>
      ) : null}
      {expanded && crossCurrency ? (
        <View style={styles.details}>
          <Text style={styles.meta}>
            {label("Journey value method", "旅行估值方式")}:{" "}
            {policy === "REFERENCE_RATE"
              ? label("Reference rate", "参考汇率")
              : policy === "MANUAL_AGREED"
                ? label("Agreed rate", "约定汇率")
                : policy === "ACTUAL_PAYER_COST"
                  ? label("Actual payer cost", "实际付款金额")
                  : label("Needs review", "待处理")}
          </Text>
          {valuation ? (
            <>
              <Text style={styles.meta}>
                {label("How calculated", "计算方式")}:{" "}
                {valuation.policy === "REFERENCE_RATE"
                  ? label("Reference rate", "参考汇率")
                  : valuation.policy === "MANUAL_AGREED"
                    ? label("Agreed rate", "约定汇率")
                    : valuation.policy === "ACTUAL_PAYER_COST"
                      ? label("Actual payer cost", "实际付款金额")
                      : label("Imported valuation", "导入估值")}
              </Text>
              {valuation.decimalRate ? (
                <Text style={styles.meta}>
                  1 {expense.original.currency} = {valuation.decimalRate} {currency}
                </Text>
              ) : null}
              {valuation.reason ? (
                <Text style={styles.meta}>
                  {label("Reason", "原因")}: {valuation.reason}
                </Text>
              ) : null}
              {valuation.referenceEvidence ? (
                <>
                  <Text style={styles.meta}>
                    {label("Expense date", "消费日期")}:{" "}
                    {fullDate(valuation.referenceEvidence.economicDate, chinese)}
                  </Text>
                  <Text style={styles.meta}>
                    {label("Reference rate date", "参考汇率日期")}:{" "}
                    {fullDate(valuation.referenceEvidence.referenceDate, chinese)}
                  </Text>
                  <Text style={styles.meta}>
                    {label("Reference rate source", "参考汇率来源")}:{" "}
                    {label("European Central Bank", "欧洲中央银行")}
                  </Text>
                  <Text style={styles.meta}>
                    {label(
                      "Delivered via Frankfurter. Reference rates are for valuation, not proof of card or bank cost.",
                      "由 Frankfurter 提供数据。参考汇率用于估值，不代表银行卡或银行的实际付款汇率。",
                    )}
                  </Text>
                </>
              ) : null}
              {valuation.policy === "ACTUAL_PAYER_COST" ? (
                <Text style={styles.meta}>
                  {label(
                    "This reflects posted payer evidence, not a market exchange rate.",
                    "此金额来自付款人入账凭证，并非市场汇率。",
                  )}
                </Text>
              ) : null}
            </>
          ) : null}
          {previous.length ? (
            <>
              <Text style={styles.label}>
                {label("EARLIER JOURNEY VALUES ON THIS PHONE", "此手机上的以往旅行估值")}
              </Text>
              {previous.map((item) => (
                <Text key={item.id} style={styles.meta}>
                  {item.original.currency} → {item.settlement.currency} ·{" "}
                  {formatLedgerMoney(
                    item.settlement.minor,
                    item.settlement.currency,
                    item.settlement.scale,
                  )}{" "}
                  ·{" "}
                  {item.policy === "REFERENCE_RATE"
                    ? label("Reference rate", "参考汇率")
                    : item.policy === "MANUAL_AGREED"
                      ? label("Agreed rate", "约定汇率")
                      : item.policy === "ACTUAL_PAYER_COST"
                        ? label("Actual payer cost", "实际付款金额")
                        : label("Previous valuation", "历史估值")}
                </Text>
              ))}
            </>
          ) : null}
          {locked ? (
            <Text style={styles.meta}>
              {label(
                "This Journey value cannot change after final settlement.",
                "最终结算后，此旅行估值无法更改。",
              )}
            </Text>
          ) : null}
          {editable ? (
            <>
              {!manual ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.action}
                  onPress={() => {
                    setManual(true);
                    setError(null);
                  }}
                >
                  <Text style={styles.actionText}>
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
                    style={styles.action}
                    onPress={manualPreview}
                  >
                    <Text style={styles.actionText}>
                      {label("Preview agreed rate", "预览约定汇率")}
                    </Text>
                  </Pressable>
                </>
              )}
              {payments.map((payment) => (
                <Pressable
                  key={payment.id}
                  accessibilityRole="button"
                  style={styles.action}
                  onPress={() =>
                    submit(
                      { policy: "ACTUAL_PAYER_COST", paymentRecordId: payment.id },
                      formatLedgerMoney(payment.posted!.minor, currency, scale),
                      `${label("Posted payer cost", "付款人入账金额")}: ${formatLedgerMoney(payment.posted!.minor, currency, scale)}\n${label("This uses the payer's posted cost, not a market rate.", "使用实际入账金额，而非市场汇率。")}`,
                    )
                  }
                >
                  <Text style={styles.actionText}>
                    {label("Use actual payer cost", "使用实际付款金额")} ·{" "}
                    {formatLedgerMoney(payment.posted!.minor, currency, scale)}
                  </Text>
                </Pressable>
              ))}
              {quote && valuation?.policy !== "REFERENCE_RATE" ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.action}
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
                      `1 ${expense.original.currency} = ${quote.decimalRate} ${currency}\n${label("Reference date", "参考汇率日期")}: ${fullDate(quote.referenceDate!, chinese)}`,
                    );
                  }}
                >
                  <Text style={styles.actionText}>
                    {label("Use reference rate", "使用参考汇率")}
                  </Text>
                </Pressable>
              ) : null}
            </>
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
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: "#FFFFFF", borderRadius: 10, gap: 8, padding: 14 },
  label: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  value: { color: "#111827", fontSize: 23, fontWeight: "800" },
  meta: { color: "#475569", fontSize: 14, lineHeight: 21 },
  details: {
    gap: 9,
    borderTopColor: "#E5E7EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  action: {
    minHeight: 44,
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#CCFBF1",
    borderRadius: 9,
  },
  actionText: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  detailsToggle: { minHeight: 44, justifyContent: "center" },
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
