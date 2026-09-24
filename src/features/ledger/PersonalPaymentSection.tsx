import { useCallback, useEffect, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getDefaultLedgerPersonalPaymentRepository } from "@/data/repositories/defaultLedgerPersonalPaymentRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { importReceiptAsset } from "@/data/operations/importReceiptAsset";
import {
  kickLedgerOperationalSync,
  runLedgerOperationalSync,
} from "@/data/operations/kickLedgerSync";
import { refreshPersonalPaymentPresentation } from "@/data/operations/personalPaymentPresentation";
import { currencyScale } from "@/domain/ledger/currency";

import { CurrencyPicker } from "./CurrencyPicker";
import { formatLedgerMoney } from "./format";
import { formatMinorInput, parseCurrencyAmount } from "./expenseDraft";
import { chronologicalPersonalPayments } from "./settlementSections";

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
  settlementScale: number;
  to: Pair;
}) {
  const [records, setRecords] = useState<LocalPersonalPayment[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [attachmentsByPayment, setAttachmentsByPayment] = useState<
    Record<string, ReceiptAsset[]>
  >({});
  const [editing, setEditing] = useState<LocalPersonalPayment | null>(null);
  const [raisingReviewId, setRaisingReviewId] = useState<string | null>(null);
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
    const receipts = await getDefaultLedgerReceiptRepository();
    const attachmentEntries = await Promise.all(
      next.map(
        async (record) =>
          [record.id, await receipts.listPersonalPaymentAttachments(record.id)] as const,
      ),
    );
    setAttachmentsByPayment(Object.fromEntries(attachmentEntries));
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
          if (active) setMessage("Offline · saved records remain available");
        }
      })
      .catch(() => active && setMessage("Payment records are unavailable."));
    return () => {
      active = false;
    };
  }, [journeyId, load]);

  const timeline = chronologicalPersonalPayments(records);
  const action =
    actorMemberId === from.id
      ? { label: "Record payment", direction: "PAID" as const, counterparty: to }
      : actorMemberId === to.id
        ? {
            label: "Record amount received",
            direction: "RECEIVED" as const,
            counterparty: from,
          }
        : null;

  const remove = (record: LocalPersonalPayment) =>
    Alert.alert("Delete your record?", "It will remain in the audit history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void getDefaultLedgerPersonalPaymentRepository()
            .then((repository) => repository.remove(record.id, "Deleted by owner"))
            .then(load)
            .then(() => kickLedgerOperationalSync()),
      },
    ]);

  const attach = async (record: LocalPersonalPayment) => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: ["image/jpeg", "image/png", "application/pdf"],
      });
      if (picked.canceled) return;
      for (const item of picked.assets)
        await importReceiptAsset({
          journeyId,
          personalPaymentId: record.id,
          sourceUri: item.uri,
          mimeType: (item.mimeType ?? "application/pdf") as
            "image/jpeg" | "image/png" | "application/pdf",
          requestOcr: false,
        });
      await load();
      kickLedgerOperationalSync();
    } catch (error) {
      Alert.alert(
        "Attachment not added",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const detach = (record: LocalPersonalPayment, attachment: ReceiptAsset) =>
    Alert.alert("Remove attachment?", "The payment record will stay unchanged.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void getDefaultLedgerReceiptRepository()
            .then((repository) => repository.detachPersonalPayment(attachment.id))
            .then(load)
            .then(() => kickLedgerOperationalSync()),
      },
    ]);

  const raiseConcern = async (record: LocalPersonalPayment) => {
    if (raisingReviewId) return;
    if (!record.revision) {
      setMessage("Sync this payment record before adding it to Review.");
      return;
    }
    setRaisingReviewId(record.id);
    try {
      await (
        await getDefaultLedgerReviewRepository()
      ).raise(journeyId, {
        targetType: "PERSONAL_PAYMENT",
        expenseId: null,
        targetMemberId: null,
        personalPaymentId: record.id,
        settlementId: null,
        sourceRevision: record.revision,
        note: null,
        targetTitle:
          record.direction === "PAID"
            ? "Personal payment record"
            : "Amount received record",
      });
      setMessage("Added to Review");
      kickLedgerOperationalSync();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add this to Review.",
      );
    } finally {
      setRaisingReviewId(null);
    }
  };

  const manage = (record: LocalPersonalPayment) => {
    const mine = record.ownerMemberId === actorMemberId;
    const attachments = (attachmentsByPayment[record.id] ?? []).filter(
      (attachment) => attachment.personalPaymentLinkStatus !== "DELETE_PENDING",
    );
    Alert.alert(
      mine ? "Manage your record" : "Payment record",
      `${formatLedgerMoney(record.amountMinor, record.currency, record.scale)} · ${record.occurredAt.slice(0, 10)}`,
      [
        ...(mine
          ? [
              { text: "Edit", onPress: () => setEditing(record) },
              { text: "Add attachment", onPress: () => void attach(record) },
              ...attachments.map((attachment, index) => ({
                text: `Remove attachment ${index + 1}`,
                onPress: () => detach(record, attachment),
              })),
            ]
          : []),
        { text: "Something looks wrong", onPress: () => void raiseConcern(record) },
        ...(mine
          ? [
              {
                text: "Delete",
                style: "destructive" as const,
                onPress: () => remove(record),
              },
            ]
          : []),
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const saveQuick = async () => {
    if (!action || savingQuick) return;
    const scale = currencyScale(quickCurrency);
    const amountMinor = scale === null ? null : parseCurrencyAmount(quickAmount, scale);
    if (scale === null || amountMinor === null) {
      Alert.alert("Check the amount");
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
      void runLedgerOperationalSync().then(load).catch(() => undefined);
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof Error ? error.message : "Please try again.",
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
                  accessibilityHint={mine ? "Opens record actions" : "Reports a concern"}
                  accessibilityRole="button"
                  onPress={() => manage(record)}
                  style={[
                    styles.timelineRecord,
                    payerSide ? styles.timelineRecordLeft : styles.timelineRecordRight,
                  ]}
                >
                  <Text style={[styles.timelineText, !payerSide && styles.alignRight]}>
                    {formatLedgerMoney(record.amountMinor, record.currency, record.scale)}{" "}
                    · {payerSide ? "paid" : "received"} · {record.occurredAt.slice(0, 10)}
                  </Text>
                </Pressable>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyTimeline}>No payment records yet.</Text>
        )}
      </View>
      {message && !message.startsWith("Offline") ? (
        <Text style={styles.sync}>{message}</Text>
      ) : null}
      {action ? (
        <View style={styles.quickEntry}>
          <Text style={styles.quickLabel}>
            {action.direction === "PAID"
              ? "Enter a new amount paid"
              : "Enter a new amount received"}
          </Text>
          <View style={styles.quickRow}>
            <Pressable
              accessibilityLabel={`Currency ${quickCurrency}`}
              accessibilityRole="button"
              onPress={() => setQuickCurrencyOpen(true)}
              style={styles.currencyButton}
            >
              <Text style={styles.currencyButtonText}>{quickCurrency} ⌄</Text>
            </Pressable>
            <TextInput
              accessibilityLabel="Personal payment amount"
              keyboardType="decimal-pad"
              onChangeText={setQuickAmount}
              placeholder="0.00"
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
                {savingQuick ? "Saving…" : "Add"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {action && editing ? (
        <PersonalPaymentEditor
          action={action}
          existing={editing}
          journeyId={journeyId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            void runLedgerOperationalSync().then(load).catch(() => undefined);
          }}
          settlementCurrency={settlementCurrency}
        />
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
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.currencySheet}>
        <View style={styles.currencyHeader}>
          <Text accessibilityRole="header" style={styles.heading}>
            Choose currency
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
        <CurrencyPicker
          onSelect={onSelect}
          selected={selected}
          suggestions={suggestions}
        />
      </SafeAreaView>
    </Modal>
  );
}

function PersonalPaymentEditor({
  action,
  existing,
  journeyId,
  onClose,
  onSaved,
  settlementCurrency,
}: {
  action: { label: string; direction: "PAID" | "RECEIVED"; counterparty: Pair };
  existing: LocalPersonalPayment | null;
  journeyId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  settlementCurrency: string;
}) {
  const [amount, setAmount] = useState(
    existing ? formatMinorInput(existing.amountMinor, existing.scale) : "",
  );
  const [currency, setCurrency] = useState(existing?.currency ?? settlementCurrency);
  const [date, setDate] = useState(
    existing?.occurredAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const paymentScale = currencyScale(currency);
  const paymentMinor =
    paymentScale === null ? null : parseCurrencyAmount(amount, paymentScale);

  const save = async () => {
    if (paymentScale === null || paymentMinor === null) {
      Alert.alert("Check the amount");
      return;
    }
    setSaving(true);
    try {
      const repository = await getDefaultLedgerPersonalPaymentRepository();
      const command = {
        journeyId,
        counterpartyMemberId: action.counterparty.id,
        direction: existing?.direction ?? action.direction,
        amountMinor: paymentMinor,
        currency,
        scale: paymentScale,
        occurredAt: `${date}T12:00:00.000Z`,
        economicDate: date,
        note: note.trim() || null,
        recordedEquivalentMinor: null,
        recordedEquivalentCurrency: null,
        recordedEquivalentScale: null,
        referenceRateDecimal: null,
        referenceRateDate: null,
        referenceSource: null,
        referenceProvenance: null,
      };
      if (existing) await repository.update(existing.id, command);
      else await repository.create(command);
      await onSaved();
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ScrollView
        contentContainerStyle={styles.editor}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.editorHeader}>
          <Pressable accessibilityRole="button" onPress={onClose}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.heading}>
            {existing ? "Edit your record" : action.label}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void save()}
          >
            <Text style={styles.link}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
        <Text style={styles.label}>
          Amount {action.direction === "PAID" ? "paid" : "received"}
        </Text>
        <TextInput
          accessibilityLabel="Personal payment amount"
          autoFocus
          keyboardType="decimal-pad"
          onChangeText={setAmount}
          placeholder="0.00"
          style={styles.amountInput}
          value={amount}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setCurrencyOpen(true)}
          style={styles.field}
        >
          <Text style={styles.fieldValue}>{currency} · Change currency</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDateOpen(true)}
          style={styles.field}
        >
          <Text style={styles.fieldValue}>{date} · Change date</Text>
        </Pressable>
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput
          accessibilityLabel="Personal payment note"
          multiline
          onChangeText={setNote}
          placeholder="What was this payment for?"
          style={[styles.field, styles.multiline]}
          value={note}
        />
        <Text style={styles.meta}>
          Saves immediately on this iPhone. Sync continues in the background.
        </Text>
      </ScrollView>
      <CurrencyModal
        onClose={() => setCurrencyOpen(false)}
        onSelect={(value) => {
          setCurrency(value);
          setCurrencyOpen(false);
        }}
        selected={currency}
        suggestions={[settlementCurrency, currency]}
        visible={currencyOpen}
      />
      {dateOpen ? (
        <DateTimePicker
          display="spinner"
          mode="date"
          onChange={(_, value) => {
            setDateOpen(false);
            if (value) setDate(value.toISOString().slice(0, 10));
          }}
          value={new Date(`${date}T12:00:00`)}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: "#DDECEA", gap: 12, padding: 12 },
  heading: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  groupTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  note: { color: "#334155", fontSize: 15, lineHeight: 21 },
  sync: { color: "#0F766E", fontSize: 13, fontWeight: "700" },
  link: { color: "#0F766E", fontSize: 15, fontWeight: "800" },
  alignRight: { textAlign: "right" },
  currencyButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#94A3B8",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 9,
  },
  currencyButtonText: { color: "#334155", fontSize: 13, fontWeight: "800" },
  currencyHeader: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 16,
  },
  currencySheet: { backgroundColor: "#F6F7F9", flex: 1 },
  disabled: { opacity: 0.55 },
  emptyTimeline: { color: "#64748B", fontSize: 13, textAlign: "center" },
  editor: { gap: 12, padding: 16, paddingBottom: 40 },
  editorHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
  },
  label: { color: "#334155", fontSize: 14, fontWeight: "700" },
  amountInput: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    color: "#0F172A",
    fontSize: 32,
    fontWeight: "800",
    minHeight: 68,
    padding: 14,
  },
  field: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 48,
    padding: 13,
  },
  fieldValue: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  quickEntry: { gap: 7 },
  quickInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#94A3B8",
    borderRadius: 9,
    borderWidth: 1,
    color: "#0F172A",
    flex: 1,
    fontSize: 16,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  quickLabel: { color: "#334155", fontSize: 13, fontWeight: "700" },
  quickRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  quickSubmit: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  quickSubmitText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  reference: { backgroundColor: "#ECFDF5", borderRadius: 12, gap: 5, padding: 12 },
  timeline: { gap: 7 },
  timelineRecord: {
    backgroundColor: "#C8DEDA",
    borderRadius: 9,
    maxWidth: "84%",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timelineRecordLeft: { alignSelf: "flex-start" },
  timelineRecordRight: { alignSelf: "flex-end" },
  timelineRow: { alignItems: "flex-end" },
  timelineRowLeft: { alignItems: "flex-start" },
  timelineText: { color: "#334155", fontSize: 12, fontWeight: "600" },
});
