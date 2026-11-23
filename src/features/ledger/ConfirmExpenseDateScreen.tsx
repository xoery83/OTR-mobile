import { systemMessage } from "@/ui/domainLabels";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { UiDatePicker as DateTimePicker } from "@/ui/forms";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";

import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { UiButton } from "@/ui/controls";

import { confirmExpenseEconomicDate } from "@/data/operations/completeEconomicDate";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import { proposedExpenseDate } from "./expenseDraft";
import { useLedgerCurrencySheet, type LedgerCurrencyChoice } from "./ledgerCurrencySheet";

type DateConfirmation = Extract<LedgerCurrencyChoice, { kind: "confirm-date" }>;

export function useOpenExpenseDateConfirmation(journeyId?: string, sourceKey?: string) {
  const openPicker = useLedgerCurrencySheet(journeyId, sourceKey);
  return (expenseId: string) => {
    if (journeyId && openPicker({
      kind: "confirm-date", titleKey: "ui.transactionDate", expenseId, journeyId, busy: { current: false },
    })) return;
    router.push({ pathname: "/expenses/confirm-date", params: { expenseId } });
  };
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function ConfirmExpenseDateScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  return <ConfirmExpenseDateForm key={expenseId} expenseId={expenseId} onClose={() => router.back()} />;
}

export function HostedConfirmExpenseDate({
  choice, isCurrent,
}: {
  choice: DateConfirmation;
  isCurrent(): boolean;
}) {
  const { requestClose } = useSheetMotion();
  return <ConfirmExpenseDateForm
    expenseId={choice.expenseId}
    onClose={requestClose}
    hosted={choice}
    isCurrent={isCurrent}
  />;
}

function ConfirmExpenseDateForm({ expenseId, onClose, hosted, isCurrent }: {
  expenseId?: string;
  onClose(): void;
  hosted?: DateConfirmation;
  isCurrent?(): boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const localBusy = useRef(false);
  const completed = useRef(false);
  const inFlight = hosted?.busy ?? localBusy;
  const generation = getAccountGeneration();
  const [expense, setExpense] = useState<LedgerExpense | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(!expenseId);
  const [shouldClose, setShouldClose] = useState(false);
  usePreventRemove(Boolean(hosted && busy), () => {});
  useEffect(() => {
    if (shouldClose && !busy) onClose();
  }, [busy, onClose, shouldClose]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (expenseId)
        void getDefaultLedgerExpenseRepository()
          .then((repository) => repository.getExpense(expenseId))
          .then((value) => {
            if (!active || generation !== getAccountGeneration()) return;
            if (!value || (hosted && value.journeyId !== hosted.journeyId)) {
              setExpense(null);
              setLoadFailed(true);
              return;
            }
            setLoadFailed(false);
            setExpense(value);
            const suggestion = proposedExpenseDate(value);
            setSuggested(Boolean(suggestion));
            setDate(suggestion ?? dateKey(new Date()));
          })
          .catch(() => {
            if (active && generation === getAccountGeneration()) {
              setExpense(null);
              setLoadFailed(true);
            }
          });
      return () => {
        active = false;
      };
    }, [expenseId, generation, hosted]),
  );
  const canUseForm = () => navigation.isFocused() && generation === getAccountGeneration() && isCurrent?.() !== false;
  const confirm = async () => {
    if (!expense || expense.economicDate || !date || inFlight.current || completed.current || !canUseForm()) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await confirmExpenseEconomicDate(expense.id, date);
      if (!canUseForm()) return;
      completed.current = true;
      setSaved(true);
      if (result.state === "VALUED") setShouldClose(true);
      else {
        setMessage(
          result.state === "SAVED_WAITING"
            ? t("ui.dateSavedOnThisIphoneItWillSyncWhenPossible")
            : t("ui.dateConfirmedTheTrustedReferenceRateIsStillResolving"),
        );
      }
    } catch (error) {
      if (canUseForm()) {
        setMessage(
          error instanceof Error ? error.message : t("ui.dateCouldNotBeConfirmed"),
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const disabled = !date || busy || saved;
  const contentStyle = [styles.content, hosted && styles.hostedContent];
  const body = !expense ? (
    loadFailed ? <Text style={contentStyle}>{t("expense.loadFailed")}</Text> :
      <ActivityIndicator style={styles.loading} />
  ) : expense.economicDate ? (
    <Text style={contentStyle}>{t("ui.transactionDateIsAlreadyConfirmed")}</Text>
  ) : (
    <View style={contentStyle}>
      <Text style={styles.subtitle}>{expense.title}</Text>
      <Text style={styles.explanation}>
        {t("ui.theSavedTimestampSuggestsThisDateButItIsNot")}
      </Text>
      {date ? (
        <>
          <Text style={styles.label}>
            {suggested
              ? t("ui.suggestedFromSavedTimestampPleaseConfirm")
              : t("ui.selectDatePleaseConfirm")}
          </Text>
          <View style={hosted && styles.wheel}>
            <DateTimePicker
              disabled={busy || saved}
              display={hosted ? "spinner" : undefined}
              accessibilityLabel={t("ui.transactionDate")}
              mode="date"
              onChange={(_, value) => {
                if (value && !inFlight.current && !completed.current) setDate(dateKey(value));
              }}
              value={localDate(date)}
            />
          </View>
          <Text style={styles.date}>{date}</Text>
        </>
      ) : (
        <Text style={styles.explanation}>{t("ui.selectTheTransactionDate")}</Text>
      )}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {systemMessage(message)}
        </Text>
      ) : null}
      {!hosted ? (
        <UiButton label={busy ? t("ui.checking") : t("ui.confirmTransactionDate")}
          disabled={disabled} onPress={() => void confirm()} />
      ) : null}
      {message && !hosted ? (
        <Pressable accessibilityRole="button" onPress={onClose}>
          <Text style={styles.back}>{t("ui.returnToSettlementReview")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
  if (!hosted) return body;
  return <SheetRoutePanel title={t(hosted.titleKey)} leadingDisabled={busy} action={expense && !expense.economicDate ? {
    label: busy ? t("ui.checking") : t("ui.confirmTransactionDate"),
    disabled,
    onPress: () => void confirm(),
  } : undefined}>
    {body}
  </SheetRoutePanel>;
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    loading: { flex: 1 },
    content: { flex: 1, padding: 24, gap: 18, backgroundColor: colors.background },
    hostedContent: { backgroundColor: colors.surface },
    subtitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "600" },
    explanation: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
    label: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
    date: { color: colors.textPrimary, fontSize: 20 },
    message: { color: colors.accent, fontSize: 15 },
    wheel: { alignItems: "center" },
    back: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  });
