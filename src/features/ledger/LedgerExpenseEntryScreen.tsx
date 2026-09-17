import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useLocalSearchParams, useNavigation } from "expo-router";

import { importReceiptAsset } from "@/data/operations/importReceiptAsset";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { notifyLedgerReviewExpenseSaved } from "@/data/repositories/ledgerReviewRepository";
import type {
  LedgerExpense,
  LedgerExpenseCommand,
} from "@/data/repositories/ledgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { parseAmountToMinor } from "@/domain/expense/money";
import { currencyScale, SUPPORTED_CURRENCY_CODES } from "@/domain/ledger/currency";
import type {
  ExpenseSettlementParticipation,
  ExpenseSplitMethod,
} from "@/domain/ledger/types";
import { createLocalId } from "@/domain/localId";

import {
  buildDraftSplits,
  type DraftMember,
  EXPENSE_CATEGORIES,
  formatMinorInput,
  parsePercentageUnits,
} from "./expenseDraft";
import { formatLedgerMoney } from "./format";

type EntryContext = {
  journeyId: string;
  settlementCurrency: string;
  settlementScale: number;
  actorId: string;
  members: DraftMember[];
};

type Draft = {
  amount: string;
  currency: string;
  title: string;
  date: string;
  payerId: string;
  participantIds: string[];
  splitMode: ExpenseSplitMethod;
  exact: Record<string, string>;
  percentages: Record<string, string>;
  settlementParticipation: ExpenseSettlementParticipation;
  category: string;
  notes: string;
};

const splitLabels: Record<ExpenseSplitMethod, string> = {
  EQUAL_PERSON: "Split equally",
  EQUAL_HOUSEHOLD: "Equal per household",
  HOUSEHOLD_SHARES: "Household shares",
  EXACT: "Exact amounts",
  PERCENTAGE: "Percentages",
};

export function LedgerExpenseEntryScreen() {
  const params = useLocalSearchParams<{
    expenseId?: string;
    journeyId?: string;
    mode?: "manual";
    receiptId?: string;
  }>();
  const navigation = useNavigation();
  const [context, setContext] = useState<EntryContext | null>(null);
  const [existing, setExisting] = useState<LedgerExpense | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [receiptId, setReceiptId] = useState(params.receiptId ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberSheet, setMemberSheet] = useState(false);
  const [currencySheet, setCurrencySheet] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState("");
  const [splitSheet, setSplitSheet] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [more, setMore] = useState(false);
  const allowClose = useRef(false);
  const savingRef = useRef(false);
  const largeText = useWindowDimensions().fontScale > 2;

  useEffect(() => {
    let active = true;
    void loadEntry(params.expenseId, params.journeyId, params.receiptId)
      .then((value) => {
        if (!active) return;
        setContext(value.context);
        setExisting(value.existing);
        setDraft(value.draft);
        setInitialSnapshot(JSON.stringify(value.draft));
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Expense could not be opened.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.expenseId, params.journeyId, params.receiptId]);

  const dirty = Boolean(
    draft &&
    (JSON.stringify(draft) !== initialSnapshot ||
      receiptId !== (params.receiptId ?? null)),
  );

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!dirty || allowClose.current) return;
        event.preventDefault();
        Alert.alert("Discard changes?", "Your unsaved Expense changes will be lost.", [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              allowClose.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ]);
      }),
    [dirty, navigation],
  );

  const selectedMembers = useMemo(
    () =>
      context?.members.filter((member) => draft?.participantIds.includes(member.id)) ??
      [],
    [context?.members, draft?.participantIds],
  );
  const scale = draft ? currencyScale(draft.currency) : null;
  const minor = draft && scale !== null ? parseAmountToMinor(draft.amount, scale) : null;
  const settlementMinor =
    minor !== null && context && draft
      ? draft.currency === context.settlementCurrency
        ? minor
        : existing &&
            existing.original.minor === minor &&
            existing.original.currency === draft.currency
          ? (existing.valuation?.settlement.minor ?? null)
          : null
      : null;
  const splitResult = useMemo(() => {
    if (!draft || minor === null || selectedMembers.length === 0)
      return { splits: null, error: "Choose an amount and participant." };
    try {
      return {
        splits: buildDraftSplits({
          mode: draft.splitMode,
          originalMinor: minor,
          settlementMinor,
          members: selectedMembers,
          exactMinor: Object.fromEntries(
            selectedMembers.map((member) => [
              member.id,
              parseAmountToMinor(draft.exact[member.id] ?? "", scale ?? 2) ?? -1,
            ]),
          ),
          percentageUnits: Object.fromEntries(
            selectedMembers.map((member) => [
              member.id,
              parsePercentageUnits(draft.percentages[member.id] ?? "") ?? -1,
            ]),
          ),
        }),
        error: null,
      };
    } catch (cause) {
      return {
        splits: null,
        error: cause instanceof Error ? cause.message : "Split is incomplete.",
      };
    }
  }, [draft, minor, scale, selectedMembers, settlementMinor]);

  const preservesExistingAllocation = Boolean(
    existing &&
    draft &&
    minor === existing.original.minor &&
    draft.currency === existing.original.currency &&
    draft.splitMode === existing.splits[0]?.method &&
    sameIds(
      draft.participantIds,
      existing.participants.map((participant) => participant.memberId),
    ) &&
    (draft.splitMode !== "EXACT" ||
      existing.splits.every(
        (split) =>
          parseAmountToMinor(
            draft.exact[split.memberId] ?? "",
            existing.original.scale,
          ) === split.originalMinor,
      )) &&
    (draft.splitMode !== "PERCENTAGE" ||
      existing.splits.every(
        (split) =>
          parsePercentageUnits(draft.percentages[split.memberId] ?? "") ===
          split.percentageUnits,
      )),
  );
  const effectiveSplits = preservesExistingAllocation
    ? existing!.splits
    : splitResult.splits;
  const allocatedMinor = effectiveSplits
    ? effectiveSplits.reduce((sum, split) => sum + split.originalMinor, 0)
    : draft?.splitMode === "EXACT"
      ? selectedMembers.reduce(
          (sum, member) =>
            sum + (parseAmountToMinor(draft.exact[member.id] ?? "", scale ?? 2) ?? 0),
          0,
        )
      : 0;

  const choosePayer = () => {
    if (!context || !draft) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Paid by",
        options: [...context.members.map((member) => member.displayName), "Cancel"],
        cancelButtonIndex: context.members.length,
      },
      (index) => {
        const member = context.members[index];
        if (member) setDraft({ ...draft, payerId: member.id });
      },
    );
  };

  const chooseCategory = () => {
    if (!draft) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Category",
        options: [...EXPENSE_CATEGORIES, "Cancel"],
        cancelButtonIndex: EXPENSE_CATEGORIES.length,
      },
      (index) => {
        const category = EXPENSE_CATEGORIES[index];
        if (category) setDraft({ ...draft, category });
      },
    );
  };

  const chooseSettlementParticipation = () => {
    if (!draft) return;
    const next = draft.settlementParticipation === "INCLUDED" ? "EXCLUDED" : "INCLUDED";
    Alert.alert(
      next === "INCLUDED" ? "Include in group settlement?" : "Exclude from settlement?",
      next === "INCLUDED"
        ? "Participant shares will affect who owes whom."
        : "This Expense stays in Spending but will not affect who owes whom.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => setDraft({ ...draft, settlementParticipation: next }),
        },
      ],
    );
  };

  const attach = async (kind: "camera" | "photo" | "file") => {
    if (!context) return;
    try {
      let source: { uri: string; mimeType: string } | null = null;
      if (kind === "file") {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "image/jpeg", "image/png"],
          copyToCacheDirectory: true,
        });
        if (!result.canceled)
          source = {
            uri: result.assets[0].uri,
            mimeType: result.assets[0].mimeType ?? "application/pdf",
          };
      } else {
        const permission =
          kind === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted)
          throw new Error("Receipt access permission is required.");
        const result =
          kind === "camera"
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                quality: 1,
              });
        if (!result.canceled)
          source = {
            uri: result.assets[0].uri,
            mimeType: result.assets[0].mimeType ?? "image/jpeg",
          };
      }
      if (!source) return;
      const receipt = await importReceiptAsset({
        journeyId: context.journeyId,
        expenseId: existing?.id,
        sourceUri: source.uri,
        mimeType: source.mimeType as "image/jpeg" | "image/png" | "application/pdf",
        requestOcr: false,
      });
      setReceiptId(receipt?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Receipt could not be attached.");
    }
  };

  const save = async () => {
    if (!context || !draft || minor === null || !effectiveSplits || savingRef.current)
      return;
    if (!draft.title.trim()) return setError("Enter a title or merchant.");
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const original = { minor, currency: draft.currency, scale: scale! };
      const preserveValuation = Boolean(
        existing &&
        existing.original.minor === minor &&
        existing.original.currency === draft.currency &&
        existing.original.scale === scale,
      );
      const valuation = preserveValuation
        ? existing!.valuation
        : draft.currency === context.settlementCurrency
          ? {
              id: createLocalId("ledger-valuation"),
              policy: "SAME_CURRENCY" as const,
              original,
              settlement: original,
              rateSnapshotId: null,
              paymentRecordId: null,
              reason: null,
            }
          : null;
      const command: LedgerExpenseCommand = {
        journeyId: context.journeyId,
        creatorMemberId: existing?.creatorMemberId ?? context.actorId,
        payerMemberId: draft.payerId,
        title: draft.title,
        description: draft.notes,
        category: draft.category,
        occurredAt:
          existing && draft.date === existing.occurredAt.slice(0, 10)
            ? existing.occurredAt
            : draft.date,
        original,
        participants: preservesExistingAllocation
          ? existing!.participants
          : selectedMembers.map((member) => ({
              memberId: member.id,
              displayNameSnapshot: member.displayName,
              householdIdSnapshot: member.householdId,
            })),
        splits: effectiveSplits,
        valuation,
        status:
          existing && existing.status !== "DELETED"
            ? existing.status
            : valuation
              ? "ACCEPTED"
              : "RATE_REQUIRED",
        settlementParticipation: draft.settlementParticipation,
      };
      const repository = await getDefaultLedgerExpenseRepository();
      const saved = existing
        ? await repository.updateExpense(existing.id, command, "Edited Expense.")
        : await repository.createExpense(command);
      if (receiptId) {
        const receipt = await (
          await getDefaultLedgerReceiptRepository()
        ).getReceipt(receiptId);
        if (receipt && receipt.expenseId !== saved.id)
          await (
            await getDefaultLedgerReceiptRepository()
          ).attachExpense(receiptId, saved.id);
      }
      notifyLedgerReviewExpenseSaved(saved.journeyId);
      allowClose.current = true;
      router.replace({
        pathname: "/expenses/expense/[id]",
        params: { id: saved.id, saved: "1" },
      });
      kickLedgerOperationalSync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Expense could not be saved.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const close = () => {
    if (!dirty) return router.back();
    Alert.alert("Discard changes?", "Your unsaved Expense changes will be lost.", [
      { text: "Keep Editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          allowClose.current = true;
          router.back();
        },
      },
    ]);
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Loading Expense form" />
      </View>
    );
  if (!draft || !context)
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Expense is unavailable."}</Text>
      </View>
    );

  if (!existing && params.mode !== "manual") {
    return (
      <ScrollView
        contentContainerStyle={[styles.choice, largeText && styles.choiceLargeText]}
      >
        <Stack.Screen options={{ headerTitle: "Add Expense" }} />
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={2}
          style={styles.choiceTitle}
        >
          Add an Expense
        </Text>
        <Text maxFontSizeMultiplier={2} style={styles.hint}>
          Choose how you want to start. Nothing is saved yet.
        </Text>
        <PrimaryAction
          label="Add manually"
          onPress={() => router.setParams({ mode: "manual" })}
        />
        <SecondaryAction
          label="Scan receipt"
          onPress={() =>
            router.replace({
              pathname: "/expenses/receipt",
              params: { journeyId: context.journeyId, mode: "scan" },
            })
          }
        />
      </ScrollView>
    );
  }

  const payer = context.members.find((member) => member.id === draft.payerId);
  const date = dateFromKey(draft.date);
  const currencyRows = SUPPORTED_CURRENCY_CODES.filter((code) =>
    code.includes(currencyQuery.trim().toUpperCase()),
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <Stack.Screen
        options={{
          gestureEnabled: false,
          headerTitle: existing ? "Edit Expense" : "New Expense",
          headerLeft: () => <HeaderAction label="Cancel" onPress={close} />,
          headerRight: () => (
            <HeaderAction
              disabled={!draft.title.trim() || !effectiveSplits || saving}
              label={saving ? "Saving…" : "Save"}
              onPress={() => void save()}
            />
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          accessibilityLabel="Expense amount"
          autoFocus={!existing}
          inputMode="decimal"
          keyboardType="decimal-pad"
          maxFontSizeMultiplier={2}
          onChangeText={(amount) => setDraft({ ...draft, amount })}
          placeholder="0"
          style={styles.amountInput}
          value={draft.amount}
        />
        <FormRow
          label="Currency"
          onPress={() => setCurrencySheet(true)}
          value={draft.currency}
        />
        <TextInput
          accessibilityLabel="Title or merchant"
          onChangeText={(title) => setDraft({ ...draft, title })}
          placeholder="What was it?"
          style={styles.textInput}
          value={draft.title}
        />
        <FormRow
          label="Expense date"
          onPress={() => setDatePicker(true)}
          value={draft.date}
        />
        <FormRow
          label="Paid by"
          onPress={choosePayer}
          value={payer?.displayName ?? "Choose"}
        />
        <FormRow
          label="Participants"
          onPress={() => setMemberSheet(true)}
          value={
            selectedMembers.length === 1 ? "Just you" : `${selectedMembers.length} people`
          }
        />
        <FormRow
          label="Split"
          onPress={() => setSplitSheet(true)}
          value={`${splitLabels[draft.splitMode]} · ${selectedMembers.length}`}
        />
        {effectiveSplits ? (
          <Text style={styles.hint}>
            {effectiveSplits
              .slice(0, 3)
              .map((split) => {
                const member = selectedMembers.find((item) => item.id === split.memberId);
                return `${member?.displayName ?? "Traveller"} ${formatLedgerMoney(split.originalMinor, draft.currency, scale ?? 2)}`;
              })
              .join(" · ")}
          </Text>
        ) : (
          <Text style={styles.error}>{splitResult.error}</Text>
        )}
        {selectedMembers.length > 1 ? (
          <FormRow
            label="Group settlement"
            onPress={chooseSettlementParticipation}
            value={
              draft.settlementParticipation === "INCLUDED" ? "Included" : "Not included"
            }
          />
        ) : null}
        <FormRow
          label="More Details"
          onPress={() => setMore(!more)}
          value={more ? "Hide" : "Show"}
        />
        {more ? (
          <View style={styles.more}>
            <FormRow label="Category" onPress={chooseCategory} value={draft.category} />
            <FormRow
              label="Attachment"
              onPress={() => {
                ActionSheetIOS.showActionSheetWithOptions(
                  {
                    options: ["Camera", "Photo Library", "Files", "Cancel"],
                    cancelButtonIndex: 3,
                  },
                  (index) => {
                    if (index === 0) void attach("camera");
                    if (index === 1) void attach("photo");
                    if (index === 2) void attach("file");
                  },
                );
              }}
              value={receiptId ? "Attached" : "Optional"}
            />
            <TextInput
              accessibilityLabel="Expense notes"
              multiline
              onChangeText={(notes) => setDraft({ ...draft, notes })}
              placeholder="Notes (optional)"
              style={[styles.textInput, styles.notes]}
              value={draft.notes}
            />
            {draft.currency !== context.settlementCurrency ? (
              <Text style={styles.warning}>
                Exchange rate required. Save locally now, then complete valuation from the
                Expense detail.
              </Text>
            ) : null}
          </View>
        ) : null}
        {receiptId && params.receiptId ? (
          <Text style={styles.suggestion}>
            Receipt suggestions are editable until Save.
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={currencySheet}>
        <SheetHeader title="Currency" onDone={() => setCurrencySheet(false)} />
        <TextInput
          accessibilityLabel="Search currencies"
          autoCapitalize="characters"
          onChangeText={setCurrencyQuery}
          placeholder="Search ISO code"
          style={[styles.textInput, styles.sheetSearch]}
          value={currencyQuery}
        />
        <FlatList
          data={currencyRows}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <SheetRow
              label={item}
              selected={draft.currency === item}
              onPress={() => {
                setDraft({ ...draft, currency: item, amount: "" });
                setCurrencySheet(false);
              }}
            />
          )}
        />
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={memberSheet}>
        <SheetHeader title="Participants" onDone={() => setMemberSheet(false)} />
        <FlatList
          data={context.members}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const selected = draft.participantIds.includes(item.id);
            return (
              <SheetRow
                label={item.displayName}
                selected={selected}
                onPress={() => {
                  const ids = selected
                    ? draft.participantIds.filter((id) => id !== item.id)
                    : [...draft.participantIds, item.id];
                  if (ids.length) setDraft({ ...draft, participantIds: ids });
                }}
              />
            );
          }}
        />
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={splitSheet}>
        <SheetHeader title="Split Expense" onDone={() => setSplitSheet(false)} />
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <Text maxFontSizeMultiplier={2} style={styles.amountSummary}>
            Total ·{" "}
            {minor === null ? "—" : formatLedgerMoney(minor, draft.currency, scale ?? 2)}
          </Text>
          <Text style={styles.hint}>
            Allocated · {formatLedgerMoney(allocatedMinor, draft.currency, scale ?? 2)} ·
            Remaining ·{" "}
            {minor === null
              ? "—"
              : formatLedgerMoney(minor - allocatedMinor, draft.currency, scale ?? 2)}
          </Text>
          {(Object.keys(splitLabels) as ExpenseSplitMethod[]).map((mode) => {
            const householdMode =
              mode === "EQUAL_HOUSEHOLD" || mode === "HOUSEHOLD_SHARES";
            const available =
              !householdMode ||
              selectedMembers.every((member) =>
                mode === "EQUAL_HOUSEHOLD" ? member.householdId : member.shareUnits,
              );
            return (
              <SheetRow
                key={mode}
                disabled={!available}
                label={splitLabels[mode]}
                selected={draft.splitMode === mode}
                onPress={() => setDraft({ ...draft, splitMode: mode })}
              />
            );
          })}
          {selectedMembers.some((member) => !member.householdId) ? (
            <Text style={styles.warning}>
              Household modes need configured Household membership for every selected
              participant.
            </Text>
          ) : null}
          {draft.splitMode === "EXACT" || draft.splitMode === "PERCENTAGE"
            ? selectedMembers.map((member) => (
                <View
                  key={member.id}
                  style={[styles.customRow, largeText && styles.customRowLargeText]}
                >
                  <Text style={styles.rowLabel} numberOfLines={largeText ? undefined : 2}>
                    {member.displayName}
                  </Text>
                  <TextInput
                    accessibilityLabel={`${member.displayName} ${draft.splitMode === "EXACT" ? "amount" : "percentage"}`}
                    keyboardType="decimal-pad"
                    onChangeText={(value) =>
                      setDraft({
                        ...draft,
                        [draft.splitMode === "EXACT" ? "exact" : "percentages"]: {
                          ...(draft.splitMode === "EXACT"
                            ? draft.exact
                            : draft.percentages),
                          [member.id]: value,
                        },
                      })
                    }
                    placeholder={draft.splitMode === "EXACT" ? draft.currency : "%"}
                    style={[styles.customInput, largeText && styles.customInputLargeText]}
                    value={
                      (draft.splitMode === "EXACT" ? draft.exact : draft.percentages)[
                        member.id
                      ] ?? ""
                    }
                  />
                </View>
              ))
            : null}
          <Text style={effectiveSplits ? styles.success : styles.error}>
            {effectiveSplits
              ? `Allocated exactly · ${formatLedgerMoney(minor!, draft.currency, scale ?? 2)} · Remaining 0`
              : splitResult.error}
          </Text>
        </ScrollView>
      </Modal>

      {datePicker ? (
        <DateTimePicker
          display="spinner"
          mode="date"
          onChange={(_, value) => {
            setDatePicker(false);
            if (value) setDraft({ ...draft, date: dateKey(value) });
          }}
          value={date}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

async function loadEntry(expenseId?: string, journeyId?: string, receiptId?: string) {
  const expenseRepository = await getDefaultLedgerExpenseRepository();
  const existing = expenseId ? await expenseRepository.getExpense(expenseId) : null;
  if (expenseId && !existing) throw new Error("Expense is not available on this iPhone.");
  if (existing?.status === "DELETED")
    throw new Error("Restore this Expense before editing it.");
  const id = existing?.journeyId ?? journeyId;
  if (!id) throw new Error("Choose a Journey before adding an Expense.");
  const reporting = await getDefaultLedgerReportingRepository();
  const reads = await getDefaultLedgerReadRepository();
  const [journeys, actor, rawMembers, households, receipt] = await Promise.all([
    reporting.listJourneys(),
    reporting.getActorMemberId(id),
    reads.listMembers(id),
    reads.listHouseholds(id),
    receiptId
      ? (await getDefaultLedgerReceiptRepository()).getReceipt(receiptId)
      : Promise.resolve(null),
  ]);
  const journey = journeys.find((item) => item.journeyId === id);
  const actorMember = rawMembers.find((item) => item.id === actor?.memberId);
  if (!journey || !actorMember) throw new Error("Journey context is unavailable.");
  const members = rawMembers.map<DraftMember>((member) => {
    const household = households.find((item) =>
      item.members.some((candidate) => candidate.id === member.id),
    );
    const householdMember = household?.members.find((item) => item.id === member.id);
    return {
      id: member.id,
      displayName: member.displayName,
      householdId: household?.id ?? null,
      shareUnits: householdMember?.shareUnits ?? null,
    };
  });
  const suggestion = receipt?.ocrSuggestion;
  const currency =
    existing?.original.currency ?? suggestion?.currency ?? journey.settlementCurrency;
  const scale = currencyScale(currency) ?? journey.settlementScale;
  const participantIds = existing?.participants.map((item) => item.memberId) ?? [
    actorMember.id,
  ];
  const draft: Draft = {
    amount: existing
      ? formatMinorInput(existing.original.minor, existing.original.scale)
      : suggestion?.amountMinor
        ? formatMinorInput(suggestion.amountMinor, scale)
        : "",
    currency,
    title: existing?.title ?? suggestion?.title ?? "",
    date: (existing?.occurredAt ?? suggestion?.occurredAt ?? dateKey(new Date())).slice(
      0,
      10,
    ),
    payerId: existing?.payerMemberId ?? actorMember.id,
    participantIds,
    splitMode: existing?.splits[0]?.method ?? "EQUAL_PERSON",
    exact: Object.fromEntries(
      existing?.splits.map((split) => [
        split.memberId,
        formatMinorInput(split.originalMinor, existing.original.scale),
      ]) ?? [],
    ),
    percentages: Object.fromEntries(
      existing?.splits.map((split) => [
        split.memberId,
        split.percentageUnits === null ? "" : String(split.percentageUnits / 10_000),
      ]) ?? [],
    ),
    settlementParticipation: existing?.settlementParticipation ?? "INCLUDED",
    category:
      existing?.category ??
      (EXPENSE_CATEGORIES.some((category) => category === suggestion?.category)
        ? suggestion!.category!
        : "other"),
    notes: existing?.description ?? "",
  };
  return {
    existing,
    draft,
    context: {
      journeyId: id,
      settlementCurrency: journey.settlementCurrency,
      settlementScale: journey.settlementScale,
      actorId: actorMember.id,
      members,
    } satisfies EntryContext,
  };
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function HeaderAction({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.headerActionButton}
    >
      <Text
        maxFontSizeMultiplier={2}
        style={[styles.headerAction, disabled && styles.disabledText]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FormRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  return (
    <Pressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, largeText && styles.rowLargeText]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        numberOfLines={2}
        style={[styles.rowValue, largeText && styles.rowValueLargeText]}
      >
        {value}
      </Text>
    </Pressable>
  );
}

function SheetHeader({ title, onDone }: { title: string; onDone: () => void }) {
  const largeText = useWindowDimensions().fontScale > 2;
  return (
    <View style={[styles.sheetHeader, largeText && styles.sheetHeaderLarge]}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={2}
        style={styles.sheetTitle}
      >
        {title}
      </Text>
      <HeaderAction label="Done" onPress={onDone} />
    </View>
  );
}

function SheetRow({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.sheetRow, disabled && styles.disabledRow]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

function PrimaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.primary}>
      <Text maxFontSizeMultiplier={2} style={styles.primaryText}>
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}>
      <Text maxFontSizeMultiplier={2} style={styles.secondaryText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { gap: 14, padding: 16, paddingBottom: 48 },
  choice: { flexGrow: 1, gap: 16, justifyContent: "center", padding: 24 },
  choiceLargeText: { justifyContent: "flex-start", paddingBottom: 140 },
  choiceTitle: { color: "#0F172A", fontSize: 30, fontWeight: "800" },
  amountInput: {
    color: "#0F172A",
    fontSize: 48,
    fontWeight: "800",
    minHeight: 68,
  },
  amountSummary: { color: "#0F172A", fontSize: 24, fontWeight: "800" },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: "#0F172A",
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  notes: { minHeight: 96, paddingTop: 14, textAlignVertical: "top" },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowLargeText: { alignItems: "flex-start", flexDirection: "column" },
  rowLabel: { color: "#0F172A", flex: 1, fontSize: 17, fontWeight: "600" },
  rowValue: { color: "#475569", flexShrink: 1, fontSize: 16, textAlign: "right" },
  rowValueLargeText: { textAlign: "left" },
  hint: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  suggestion: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  warning: { color: "#92400E", fontSize: 14, lineHeight: 20 },
  error: { color: "#B91C1C", fontSize: 15, lineHeight: 21 },
  success: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  more: { gap: 12 },
  headerAction: { color: "#0F766E", fontSize: 17, fontWeight: "700", padding: 8 },
  headerActionButton: { justifyContent: "center", minHeight: 44 },
  disabledText: { opacity: 0.4 },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 52,
  },
  primaryText: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  secondary: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#0F766E",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
  },
  secondaryText: { color: "#0F766E", fontSize: 18, fontWeight: "700" },
  sheetHeader: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 16,
  },
  sheetHeaderLarge: {
    alignItems: "flex-start",
    flexDirection: "column",
    paddingVertical: 8,
  },
  sheetTitle: { color: "#0F172A", fontSize: 20, fontWeight: "800" },
  sheetSearch: { margin: 16 },
  sheetContent: { gap: 10, padding: 16, paddingBottom: 48 },
  sheetRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  disabledRow: { opacity: 0.4 },
  check: { color: "#0F766E", fontSize: 20, fontWeight: "800" },
  customRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  customRowLargeText: { alignItems: "stretch", flexDirection: "column" },
  customInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: "#0F172A",
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: 10,
    textAlign: "right",
    width: 120,
  },
  customInputLargeText: { width: "100%" },
});
