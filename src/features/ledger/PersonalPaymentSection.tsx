import { useCallback, useEffect, useMemo, useState } from "react";
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

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerPersonalPaymentRepository } from "@/data/repositories/defaultLedgerPersonalPaymentRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { importReceiptAsset } from "@/data/operations/importReceiptAsset";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";
import {
  refreshPersonalPaymentPresentation,
  refreshPersonalPaymentRateQuotes,
} from "@/data/operations/personalPaymentPresentation";
import { currencyScale } from "@/domain/ledger/currency";
import { convertMoney } from "@/domain/ledger/money";

import { CurrencyPicker } from "./CurrencyPicker";
import { formatLedgerMoney } from "./format";
import { formatMinorInput, parseCurrencyAmount } from "./expenseDraft";
import {
  selectPersonalPaymentReference,
  type PersonalPaymentReference,
} from "./personalPaymentFx";

type Pair = { id: string; name: string };

export function PersonalPaymentSection({
  actorMemberId,
  from,
  journeyId,
  settlementCurrency,
  settlementScale,
  to,
}: {
  actorMemberId: string | null;
  from: Pair;
  journeyId: string;
  settlementCurrency: string;
  settlementScale: number;
  to: Pair;
}) {
  const [records, setRecords] = useState<LocalPersonalPayment[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<
    Record<string, { count: number; pending: boolean }>
  >({});
  const [attachmentsByPayment, setAttachmentsByPayment] = useState<
    Record<string, ReceiptAsset[]>
  >({});
  const [editing, setEditing] = useState<LocalPersonalPayment | "new" | null>(null);
  const [raisingReviewId, setRaisingReviewId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const repository = await getDefaultLedgerPersonalPaymentRepository();
    const next = (await repository.listForJourney(journeyId)).filter(
      (item) =>
        (item.ownerMemberId === from.id && item.counterpartyMemberId === to.id) ||
        (item.ownerMemberId === to.id && item.counterpartyMemberId === from.id),
    );
    setRecords(next);
    const receipts = await getDefaultLedgerReceiptRepository();
    const attachmentEntries = await Promise.all(
      next.map(
        async (record) =>
          [record.id, await receipts.listPersonalPaymentAttachments(record.id)] as const,
      ),
    );
    setAttachmentsByPayment(Object.fromEntries(attachmentEntries));
    setAttachmentCounts(
      Object.fromEntries(
        attachmentEntries.map(([id, items]) => [
          id,
          {
            count: items.filter(
              (item) => item.personalPaymentLinkStatus !== "DELETE_PENDING",
            ).length,
            pending: items.some(
              (item) =>
                item.uploadStatus !== "UPLOADED" ||
                item.personalPaymentLinkStatus === "DELETE_PENDING",
            ),
          },
        ]),
      ),
    );
  }, [from.id, journeyId, to.id]);

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

  const mine = records.filter((item) => item.ownerMemberId === actorMemberId);
  const other = records.filter((item) => item.ownerMemberId !== actorMemberId);
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

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        Personal payment records
      </Text>
      <Text style={styles.explainer}>
        Each person keeps their own record. These entries do not change the final
        Settlement or confirm what the other person received.
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setEditing("new")}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>{action.label}</Text>
        </Pressable>
      ) : null}
      {message ? <Text style={styles.sync}>{message}</Text> : null}
      <RecordGroup
        editable
        empty="You have not recorded anything yet."
        name="Your records"
        onDelete={remove}
        onEdit={setEditing}
        onAttach={attach}
        onConcern={raiseConcern}
        attachmentCounts={attachmentCounts}
        attachmentsByPayment={attachmentsByPayment}
        onDetach={detach}
        records={mine}
      />
      <RecordGroup
        empty="No record from the other person is available."
        name={actorMemberId ? "Other person's records" : "Member records"}
        attachmentCounts={attachmentCounts}
        attachmentsByPayment={attachmentsByPayment}
        onConcern={raiseConcern}
        records={other}
      />
      {action && editing ? (
        <PersonalPaymentEditor
          action={action}
          existing={editing === "new" ? null : editing}
          journeyId={journeyId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            void kickLedgerOperationalSync();
          }}
          settlementCurrency={settlementCurrency}
          settlementScale={settlementScale}
        />
      ) : null}
    </View>
  );
}

function RecordGroup({
  editable = false,
  empty,
  name,
  onDelete,
  onEdit,
  onAttach,
  onConcern,
  attachmentCounts,
  attachmentsByPayment,
  onDetach,
  records,
}: {
  editable?: boolean;
  empty: string;
  name: string;
  onDelete?: (record: LocalPersonalPayment) => void;
  onEdit?: (record: LocalPersonalPayment) => void;
  onAttach?: (record: LocalPersonalPayment) => void;
  onConcern: (record: LocalPersonalPayment) => void;
  attachmentCounts: Record<string, { count: number; pending: boolean }>;
  attachmentsByPayment: Record<string, ReceiptAsset[]>;
  onDetach?: (record: LocalPersonalPayment, attachment: ReceiptAsset) => void;
  records: LocalPersonalPayment[];
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{name}</Text>
      {records.length ? (
        records.map((record) => (
          <View key={record.id} style={styles.record}>
            <Text style={styles.recordAmount}>
              {record.direction === "PAID" ? "Paid " : "Received "}
              {formatLedgerMoney(record.amountMinor, record.currency, record.scale)}
            </Text>
            <Text style={styles.meta}>{record.occurredAt.slice(0, 10)}</Text>
            {record.recordedEquivalentMinor && record.recordedEquivalentCurrency ? (
              <Text style={styles.meta}>
                Recorded equivalent ·{" "}
                {formatLedgerMoney(
                  record.recordedEquivalentMinor,
                  record.recordedEquivalentCurrency,
                  record.recordedEquivalentScale!,
                )}
              </Text>
            ) : null}
            {record.referenceRateDate ? (
              <Text style={styles.meta}>
                Informational reference · {record.referenceRateDate}
              </Text>
            ) : null}
            {record.note ? <Text style={styles.note}>{record.note}</Text> : null}
            {attachmentCounts[record.id]?.count ? (
              <Text style={styles.meta}>
                {attachmentCounts[record.id].count} attachment
                {attachmentCounts[record.id].count === 1 ? "" : "s"}
                {attachmentCounts[record.id].pending
                  ? " · upload queued"
                  : " · available"}
              </Text>
            ) : null}
            {editable
              ? (attachmentsByPayment[record.id] ?? [])
                  .filter(
                    (attachment) =>
                      attachment.personalPaymentLinkStatus !== "DELETE_PENDING",
                  )
                  .map((attachment, index) => (
                    <Pressable
                      key={attachment.id}
                      accessibilityRole="button"
                      onPress={() => onDetach?.(record, attachment)}
                    >
                      <Text style={styles.delete}>Remove attachment {index + 1}</Text>
                    </Pressable>
                  ))
              : null}
            <Text style={styles.sync}>{syncLabel(record.syncStatus)}</Text>
            <Pressable accessibilityRole="button" onPress={() => onConcern(record)}>
              <Text style={styles.link}>Something looks wrong</Text>
            </Pressable>
            {editable ? (
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={() => onEdit?.(record)}>
                  <Text style={styles.link}>Edit</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => onDelete?.(record)}>
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => onAttach?.(record)}>
                  <Text style={styles.link}>Add attachment</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))
      ) : (
        <Text style={styles.meta}>{empty}</Text>
      )}
    </View>
  );
}

function PersonalPaymentEditor({
  action,
  existing,
  journeyId,
  onClose,
  onSaved,
  settlementCurrency,
  settlementScale,
}: {
  action: { label: string; direction: "PAID" | "RECEIVED"; counterparty: Pair };
  existing: LocalPersonalPayment | null;
  journeyId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  settlementCurrency: string;
  settlementScale: number;
}) {
  const [amount, setAmount] = useState(
    existing ? formatMinorInput(existing.amountMinor, existing.scale) : "",
  );
  const [currency, setCurrency] = useState(existing?.currency ?? settlementCurrency);
  const [date, setDate] = useState(
    existing?.occurredAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [equivalent, setEquivalent] = useState(
    existing?.recordedEquivalentMinor
      ? formatMinorInput(
          existing.recordedEquivalentMinor,
          existing.recordedEquivalentScale ?? settlementScale,
        )
      : "",
  );
  const equivalentCurrency = existing?.recordedEquivalentCurrency ?? settlementCurrency;
  const equivalentScale =
    existing?.recordedEquivalentScale ??
    currencyScale(equivalentCurrency) ??
    settlementScale;
  const [reference, setReference] = useState<PersonalPaymentReference | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const read = async (refresh: boolean) => {
      const repository = await getDefaultLedgerExpenseRepository();
      if (refresh) {
        try {
          await refreshPersonalPaymentRateQuotes(journeyId, currency, settlementCurrency);
        } catch {
          // Cached data and manual save remain available offline.
        }
      }
      const quotes = await repository.listRateQuotes(
        journeyId,
        currency,
        settlementCurrency,
      );
      if (active) setReference(selectPersonalPaymentReference(quotes, date));
    };
    if (currency !== settlementCurrency) {
      void read(false);
      void read(true);
    }
    return () => {
      active = false;
    };
  }, [currency, date, journeyId, settlementCurrency]);

  const paymentScale = currencyScale(currency);
  const activeReference = currency === settlementCurrency ? null : reference;
  const paymentMinor =
    paymentScale === null ? null : parseCurrencyAmount(amount, paymentScale);
  const referenceEquivalent = useMemo(() => {
    if (!activeReference || paymentMinor === null || paymentScale === null) return null;
    try {
      return convertMoney(
        { minor: paymentMinor, currency, scale: paymentScale },
        settlementCurrency,
        settlementScale,
        activeReference.quote.decimalRate,
      );
    } catch {
      return null;
    }
  }, [
    currency,
    paymentMinor,
    paymentScale,
    activeReference,
    settlementCurrency,
    settlementScale,
  ]);

  const save = async () => {
    const equivalentMinor = equivalent.trim()
      ? parseCurrencyAmount(equivalent, equivalentScale)
      : null;
    if (
      paymentScale === null ||
      paymentMinor === null ||
      (equivalent.trim() && !equivalentMinor)
    ) {
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
        note: note.trim() || null,
        recordedEquivalentMinor: equivalentMinor,
        recordedEquivalentCurrency: equivalentMinor ? equivalentCurrency : null,
        recordedEquivalentScale: equivalentMinor ? equivalentScale : null,
        referenceRateDecimal: activeReference?.quote.decimalRate ?? null,
        referenceRateDate: activeReference?.quote.referenceDate ?? null,
        referenceSource: activeReference ? "ECB reference via Frankfurter" : null,
        referenceProvenance: activeReference
          ? { quoteId: activeReference.quote.id, kind: activeReference.kind }
          : null,
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
        {currency !== settlementCurrency ? (
          <View style={styles.reference}>
            <Text style={styles.groupTitle}>
              {activeReference?.kind === "REQUESTED_DATE"
                ? "Reference rate"
                : activeReference
                  ? "Latest available reference"
                  : "No reference rate available"}
            </Text>
            {activeReference ? (
              <>
                <Text style={styles.note}>
                  1 {currency} ≈ {activeReference.quote.decimalRate} {settlementCurrency}
                </Text>
                <Text style={styles.meta}>
                  {activeReference.quote.referenceDate} · informational market reference
                </Text>
                {referenceEquivalent ? (
                  <Text style={styles.note}>
                    Reference equivalent ≈{" "}
                    {formatLedgerMoney(
                      referenceEquivalent.minor,
                      referenceEquivalent.currency,
                      referenceEquivalent.scale,
                    )}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.meta}>You can still save the original amount.</Text>
            )}
          </View>
        ) : null}
        <Text style={styles.label}>
          Recorded equivalent (optional, {equivalentCurrency})
        </Text>
        <TextInput
          accessibilityLabel="Recorded equivalent"
          keyboardType="decimal-pad"
          onChangeText={setEquivalent}
          placeholder="Leave blank"
          style={styles.field}
          value={equivalent}
        />
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
      <Modal
        animationType="slide"
        onRequestClose={() => setCurrencyOpen(false)}
        visible={currencyOpen}
      >
        <CurrencyPicker
          onSelect={(value) => {
            setCurrency(value);
            setCurrencyOpen(false);
          }}
          selected={currency}
          suggestions={[settlementCurrency, currency]}
        />
      </Modal>
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

function syncLabel(status: LocalPersonalPayment["syncStatus"]) {
  if (status === "SYNCED") return "Synced";
  if (status === "CONFLICT") return "Your local edit is kept · needs attention";
  if (status === "FAILED") return "Saved here · sync needs attention";
  return "Saved here · waiting to sync";
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  explainer: { color: "#475569", fontSize: 14, lineHeight: 20 },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 12,
    padding: 14,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  group: { gap: 8 },
  groupTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  record: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 4, padding: 12 },
  recordAmount: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  meta: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  note: { color: "#334155", fontSize: 15, lineHeight: 21 },
  sync: { color: "#0F766E", fontSize: 13, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 20, paddingTop: 5 },
  link: { color: "#0F766E", fontSize: 15, fontWeight: "800" },
  delete: { color: "#B91C1C", fontSize: 15, fontWeight: "800" },
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
  reference: { backgroundColor: "#ECFDF5", borderRadius: 12, gap: 5, padding: 12 },
});
