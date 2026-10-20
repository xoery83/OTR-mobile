import { systemMessage } from "@/ui/domainLabels";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { UiTextInput as TextInput } from "@/ui/forms";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { MoneyText } from "./MoneyText";
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { getDefaultLedgerPersonalPaymentRepository } from "@/data/repositories/defaultLedgerPersonalPaymentRepository";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import {
  kickLedgerOperationalSync,
  runLedgerOperationalSync,
} from "@/data/operations/kickLedgerSync";
import { refreshPersonalPaymentPresentation } from "@/data/operations/personalPaymentPresentation";
import { currencyScale } from "@/domain/ledger/currency";

import { CurrencyPicker } from "./CurrencyPicker";
import { formatLedgerMoney, formatLedgerDate } from "./format";
import { parseCurrencyAmount } from "./expenseDraft";
import { chronologicalPersonalPayments } from "./settlementSections";
import { SheetHeader } from "@/components/SheetHeader";

type Pair = { id: string; name: string };

export function PersonalPaymentSection({
  actorMemberId,
  from,
  journeyId,
  onChanged,
  settlementCurrency,
  to,
}: {
  actorMemberId: string | null;
  from: Pair;
  journeyId: string;
  onChanged?: (records: LocalPersonalPayment[]) => void;
  settlementCurrency: string;
  to: Pair;
}) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);
  const [records, setRecords] = useState<LocalPersonalPayment[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCurrency, setQuickCurrency] = useState(settlementCurrency);
  const [quickCurrencyOpen, setQuickCurrencyOpen] = useState(false);
  const [savingQuick, setSavingQuick] = useState(false);
  const load = useCallback(async () => {
    const repository = await getDefaultLedgerPersonalPaymentRepository();
    const all = await repository.listForJourney(journeyId);
    const next = all.filter(
      (item) =>
        (item.ownerMemberId === from.id && item.counterpartyMemberId === to.id) ||
        (item.ownerMemberId === to.id && item.counterpartyMemberId === from.id),
    );
    setRecords(next);
    onChanged?.(all);
  }, [from.id, journeyId, onChanged, to.id]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(load)
      .then(async () => {
        try {
          await refreshPersonalPaymentPresentation(journeyId);
          if (active) await load();
        } catch {
          if (active) setMessage(t("ui.offlineSavedRecordsRemainAvailable"));
        }
      })
      .catch(() => active && setMessage(t("ui.paymentRecordsAreUnavailable")));
    return () => {
      active = false;
    };
  }, [journeyId, load]);

  const timeline = chronologicalPersonalPayments(records);
  const action =
    actorMemberId === from.id
      ? { direction: "PAID" as const, counterparty: to }
      : actorMemberId === to.id
        ? {
            direction: "RECEIVED" as const,
            counterparty: from,
          }
        : null;

  const remove = (record: LocalPersonalPayment) =>
    Alert.alert(t("ui.deleteYourRecord"), t("ui.itWillRemainInTheAuditHistory"), [
      { text: t("ui.cancel"), style: "cancel" },
      {
        text: t("ui.delete"),
        style: "destructive",
        onPress: () =>
          void getDefaultLedgerPersonalPaymentRepository()
            .then((repository) => repository.remove(record.id, "Deleted by owner"))
            .then(load)
            .then(() => kickLedgerOperationalSync()),
      },
    ]);

  const manage = (record: LocalPersonalPayment) => {
    Alert.alert(
      t("ui.manageYourRecord"),
      `${formatLedgerMoney(record.amountMinor, record.currency, record.scale)} · ${formatLedgerDate(record.occurredAt)}`,
      [
        { text: t("ui.delete"), style: "destructive", onPress: () => remove(record) },
        { text: t("ui.cancel"), style: "cancel" },
      ],
    );
  };

  const saveQuick = async () => {
    if (!action || savingQuick) return;
    const scale = currencyScale(quickCurrency);
    const amountMinor = scale === null ? null : parseCurrencyAmount(quickAmount, scale);
    if (scale === null || amountMinor === null) {
      Alert.alert(t("ui.checkTheAmount"));
      return;
    }
    setSavingQuick(true);
    const date = new Date().toISOString().slice(0, 10);
    try {
      await (
        await getDefaultLedgerPersonalPaymentRepository()
      ).create({
        journeyId,
        counterpartyMemberId: action.counterparty.id,
        direction: action.direction,
        amountMinor,
        currency: quickCurrency,
        scale,
        occurredAt: `${date}T12:00:00.000Z`,
        economicDate: date,
        note: null,
        recordedEquivalentMinor: null,
        recordedEquivalentCurrency: null,
        recordedEquivalentScale: null,
        referenceRateDecimal: null,
        referenceRateDate: null,
        referenceSource: null,
        referenceProvenance: null,
      });
      setQuickAmount("");
      await load();
      kickLedgerOperationalSync(() => runLedgerOperationalSync().then(load));
    } catch (error) {
      Alert.alert(
        t("ui.couldNotSave"),
        error instanceof Error ? error.message : t("ui.pleaseTryAgain"),
      );
    } finally {
      setSavingQuick(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.timeline}>
        {timeline.length ? (
          timeline.map((record) => {
            const payerSide = record.ownerMemberId === from.id;
            const mine = record.ownerMemberId === actorMemberId;
            return (
              <View
                key={record.id}
                style={[styles.timelineRow, payerSide && styles.timelineRowLeft]}
              >
                <Pressable
                  accessibilityHint={mine ? t("ui.opensRecordActions") : undefined}
                  accessibilityRole={mine ? "button" : undefined}
                  disabled={!mine}
                  onPress={() => manage(record)}
                  style={[
                    styles.timelineRecord,
                    payerSide ? styles.timelineRecordLeft : styles.timelineRecordRight,
                  ]}
                >
                  <Text style={[styles.timelineText, !payerSide && styles.alignRight]}>
                    <MoneyText
                      accessible={false}
                      style={styles.timelineText}
                      minor={record.amountMinor}
                      currency={record.currency}
                      scale={record.scale}
                    />{" "}
                    · {payerSide ? t("ui.paid") : t("ui.received")} ·{" "}
                    {formatLedgerDate(record.occurredAt)}
                  </Text>
                </Pressable>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyTimeline}>{t("ui.noPaymentRecordsYet")}</Text>
        )}
      </View>
      {message && !message.startsWith("Offline") ? (
        <Text style={styles.sync}>{systemMessage(message)}</Text>
      ) : null}
      {action ? (
        <View style={styles.quickEntry}>
          <Text style={styles.quickLabel}>
            {action.direction === "PAID"
              ? t("ui.enterANewAmountPaid")
              : t("ui.enterANewAmountReceived")}
          </Text>
          <View style={styles.quickRow}>
            <Pressable
              accessibilityLabel={t("payment.currency", { currency: quickCurrency })}
              accessibilityRole="button"
              onPress={() => setQuickCurrencyOpen(true)}
              style={styles.currencyButton}
            >
              <Text style={styles.currencyButtonText}>{quickCurrency} ⌄</Text>
            </Pressable>
            <TextInput
              accessibilityLabel={t("ui.personalPaymentAmount")}
              keyboardType="decimal-pad"
              onChangeText={setQuickAmount}
              placeholder={t("ui.000")}
              style={styles.quickInput}
              value={quickAmount}
            />
            <Pressable
              accessibilityRole="button"
              disabled={savingQuick}
              onPress={() => void saveQuick()}
              style={[styles.quickSubmit, savingQuick && styles.disabled]}
            >
              <Text style={styles.quickSubmitText}>
                {savingQuick ? t("ui.saving") : t("ui.add")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <CurrencyModal
        onClose={() => setQuickCurrencyOpen(false)}
        onSelect={(value) => {
          setQuickCurrency(value);
          setQuickCurrencyOpen(false);
        }}
        selected={quickCurrency}
        suggestions={[settlementCurrency, quickCurrency]}
        visible={quickCurrencyOpen}
      />
    </View>
  );
}

function CurrencyModal({
  onClose,
  onSelect,
  selected,
  suggestions,
  visible,
}: {
  onClose: () => void;
  onSelect: (value: string) => void;
  selected: string;
  suggestions: string[];
  visible: boolean;
}) {
  useUiLocale();

  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SheetHeader
        leftLabel={t("ui.cancel")}
        onLeft={onClose}
        title={t("ui.chooseCurrency")}
      />
      <CurrencyPicker onSelect={onSelect} selected={selected} suggestions={suggestions} />
    </Modal>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    section: { backgroundColor: colors.expandedSurface, gap: 12, padding: 12 },
    sync: { color: colors.accent, fontSize: 13, fontWeight: "700" },
    alignRight: { textAlign: "right" },
    currencyButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.disabled,
      borderRadius: 9,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 9,
    },
    currencyButtonText: { color: colors.textTertiary, fontSize: 13, fontWeight: "800" },
    disabled: { opacity: 0.55 },
    emptyTimeline: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
    quickEntry: { gap: 7 },
    quickInput: {
      backgroundColor: colors.surface,
      borderColor: colors.disabled,
      borderRadius: 9,
      borderWidth: 1,
      color: colors.textPrimary,
      flex: 1,
      fontSize: 16,
      minHeight: 42,
      paddingHorizontal: 10,
    },
    quickLabel: { color: colors.textTertiary, fontSize: 13, fontWeight: "700" },
    quickRow: { alignItems: "center", flexDirection: "row", gap: 7 },
    quickSubmit: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 9,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 12,
    },
    quickSubmitText: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
    timeline: { gap: 7 },
    timelineRecord: {
      backgroundColor: colors.selected,
      borderRadius: 9,
      maxWidth: "84%",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    timelineRecordLeft: { alignSelf: "flex-start" },
    timelineRecordRight: { alignSelf: "flex-end" },
    timelineRow: { alignItems: "flex-end" },
    timelineRowLeft: { alignItems: "flex-start" },
    timelineText: { color: colors.textTertiary, fontSize: 12, fontWeight: "600" },
  });
