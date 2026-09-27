import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Keyboard,
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
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useLocalSearchParams, useNavigation } from "expo-router";

import { AppIcon } from "@/components/AppIcon";

import { importReceiptAsset } from "@/data/operations/importReceiptAsset";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import {
  discardExpenseReceiptDraft,
  restoreExpenseReceiptDrafts,
  saveExpenseWithReceiptDraft,
  selectExpenseReceiptDraft,
  transferConfirmedReceiptDrafts,
} from "@/data/operations/expenseReceiptDraft";
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
import { currencyScale } from "@/domain/ledger/currency";
import { LedgerValidationError } from "@/domain/ledger/validation";
import type {
  ExpenseSettlementParticipation,
  ExpenseSplitMethod,
} from "@/domain/ledger/types";
import { createLocalId, createUuid } from "@/domain/localId";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";
import { createReceiptOcrProvider } from "@/native/receiptOcr";
import {
  confirmSettlementCorrection,
  previewSettlementCorrection,
} from "@/data/operations/settlementCorrectionOperations";

import {
  buildDraftSplits,
  correctedCurrencyDraft,
  currencyAmountHint,
  currencyAmountInput,
  type DraftMember,
  EXPENSE_CATEGORIES,
  formatMinorInput,
  parseCurrencyAmount,
  parsePercentageUnits,
  preservesExpenseValuation,
  proposedExpenseDate,
  suggestExpenseCategory,
  shouldShowGroupSettlement,
} from "./expenseDraft";
import { formatLedgerMoney } from "./format";
import { CurrencyPicker } from "./CurrencyPicker";
import { LedgerSheetHeader } from "./LedgerSheetHeader";
import {
  createExpenseReceiptOcrSession,
  idleExpenseReceiptOcr,
  shouldRunExpenseReceiptOcr,
} from "./expenseReceiptOcr";
import {
  addReceiptScanDocument,
  beginReceiptScanOcr,
  cancelReceiptScanSession,
  completeReceiptScanOcr,
  createReceiptScanSession,
  removeReceiptScanDocument,
  suspendReceiptScanSession,
  type ReceiptScanSession,
} from "./receiptScanSession";
import {
  createReceiptReviewState,
  prepareReceiptReviewConfirmation,
  refreshReceiptReviewState,
  seedReceiptReviewFromExpense,
  type ReceiptReviewState,
} from "./receiptReview";
import { ReceiptReviewSheet } from "./ReceiptReviewSheet";

type EntryContext = {
  journeyId: string;
  settlementCurrency: string;
  settlementScale: number;
  recentCurrencies: string[];
  defaultCurrency: string;
  debugMode: boolean;
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

const categoryGroups: {
  title: string;
  items: {
    id: (typeof EXPENSE_CATEGORIES)[number];
    icon: ComponentProps<typeof AppIcon>["name"];
  }[];
}[] = [
  {
    title: "Food & shopping",
    items: [
      { id: "food", icon: "fork.knife" },
      { id: "shopping", icon: "bag" },
      { id: "groceries", icon: "basket" },
    ],
  },
  {
    title: "Getting around",
    items: [
      { id: "flight", icon: "airplane" },
      { id: "car", icon: "car" },
      { id: "fuel", icon: "fuelpump" },
      { id: "transport", icon: "tram" },
    ],
  },
  {
    title: "Stay & experiences",
    items: [
      { id: "hotel", icon: "bed.double" },
      { id: "ticket", icon: "ticket" },
      { id: "activity", icon: "figure.walk" },
    ],
  },
  {
    title: "Insurance & other",
    items: [
      { id: "insurance", icon: "shield" },
      { id: "other", icon: "square.grid.2x2" },
    ],
  },
];

export function LedgerExpenseEntryScreen() {
  const params = useLocalSearchParams<{
    expenseId?: string;
    journeyId?: string;
    mode?: "manual";
    receiptId?: string;
    focusDate?: string;
    correctionRootId?: string;
    correctionReason?: string;
  }>();
  const navigation = useNavigation();
  const [context, setContext] = useState<EntryContext | null>(null);
  const [existing, setExisting] = useState<LedgerExpense | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [receiptId, setReceiptId] = useState(params.receiptId ?? null);
  const [receiptDrafts, setReceiptDrafts] = useState<TemporaryReceiptDraft[]>([]);
  const [recoveredDraftIds, setRecoveredDraftIds] = useState<Set<string>>(new Set());
  const [ocrState, setOcrState] = useState(idleExpenseReceiptOcr);
  const [ocrSession] = useState(() =>
    createExpenseReceiptOcrSession(createReceiptOcrProvider().recognize, setOcrState),
  );
  const scanSessionRef = useRef<ReceiptScanSession | null>(null);
  const discardedScanDraftIdsRef = useRef(new Set<string>());
  const [scanSession, setScanSession] = useState<ReceiptScanSession | null>(null);
  const [receiptReview, setReceiptReview] = useState<ReceiptReviewState | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberSheet, setMemberSheet] = useState(false);
  const [currencySheet, setCurrencySheet] = useState(false);
  const [categorySheet, setCategorySheet] = useState(false);
  const [splitSheet, setSplitSheet] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [pendingDate, setPendingDate] = useState(new Date());
  const [more, setMore] = useState(false);
  const [categoryManual, setCategoryManual] = useState(false);
  const allowClose = useRef(false);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const addingReceiptRef = useRef(false);
  const [selectingReceipt, setSelectingReceipt] = useState(false);
  const expenseDraftId = useRef(createLocalId("ledger-expense"));
  const scrollRef = useRef<ScrollView>(null);
  const notesFocused = useRef(false);
  const largeText = useWindowDimensions().fontScale > 2;

  const discardPendingScan = useCallback(() => {
    const pending = scanSessionRef.current;
    if (!pending) return;
    ocrSession.clear();
    for (const receiptDraft of cancelReceiptScanSession(pending).draftsToDiscard) {
      discardedScanDraftIdsRef.current.add(receiptDraft.id);
      try {
        discardExpenseReceiptDraft(receiptDraft);
      } catch {
        /* retain an orphan candidate for recovery */
      }
    }
    scanSessionRef.current = null;
    setScanSession(null);
    setReceiptReview(null);
    setReviewVisible(false);
  }, [ocrSession]);

  useEffect(() => {
    let active = true;
    void loadEntry(params.expenseId, params.journeyId, params.receiptId)
      .then(async (value) => {
        if (!active) return;
        setContext(value.context);
        setExisting(value.existing);
        setDraft(value.draft);
        setReceiptId(params.receiptId ?? null);
        setCategoryManual(Boolean(value.existing));
        setMore(Boolean(params.receiptId));
        setInitialSnapshot(JSON.stringify(value.draft));
        if (!params.expenseId)
          await restoreExpenseReceiptDrafts(value.context.journeyId)
            .then((recovered) => {
              if (active) {
                const available = recovered.filter(
                  (item) =>
                    !discardedScanDraftIdsRef.current.has(item.id) &&
                    !scanSessionRef.current?.documents.some(
                      (part) => part.draft.id === item.id,
                    ),
                );
                const recoveredSessionId = available.find(
                  (item) => item.scanSessionId,
                )?.scanSessionId;
                const scanParts = available
                  .filter(
                    (item) =>
                      item.scanSessionId === recoveredSessionId && recoveredSessionId,
                  )
                  .sort((a, b) => (a.scanOrder ?? 0) - (b.scanOrder ?? 0));
                const ordinary = available.filter(
                  (item) => !scanParts.some((part) => part.id === item.id),
                );
                setReceiptDrafts((current) => [
                  ...current,
                  ...ordinary.filter(
                    (item) => !current.some((selected) => selected.id === item.id),
                  ),
                ]);
                setRecoveredDraftIds(new Set(ordinary.map((item) => item.id)));
                if (scanParts.length && !scanSessionRef.current) {
                  try {
                    let restored = createReceiptScanSession(recoveredSessionId!, [
                      ...ordinary.map((item) => item.id),
                      ...(params.receiptId ? [params.receiptId] : []),
                    ]);
                    for (const part of scanParts)
                      restored = addReceiptScanDocument(restored, part);
                    scanSessionRef.current = restored;
                    setScanSession(restored);
                    setReceiptReview(
                      createReceiptReviewState(
                        restored,
                        value.context.settlementCurrency,
                        value.context.defaultCurrency,
                      ),
                    );
                    Alert.alert(
                      "Resume receipt review?",
                      `${scanParts.length} receipt ${scanParts.length === 1 ? "image" : "images"} recovered.`,
                      [
                        {
                          text: "Discard",
                          style: "destructive",
                          onPress: discardPendingScan,
                        },
                        { text: "Resume", onPress: () => setReviewVisible(true) },
                      ],
                    );
                  } catch {
                    // Keep verified files accessible if recovery metadata is invalid.
                    setReceiptDrafts((current) => [
                      ...current,
                      ...scanParts.filter(
                        (item) => !current.some((saved) => saved.id === item.id),
                      ),
                    ]);
                    setRecoveredDraftIds(new Set(available.map((item) => item.id)));
                  }
                }
              }
            })
            .catch(() => {
              /* retain files for recovery */
            });
        if (params.focusDate === "1") {
          setPendingDate(value.draft.date ? dateFromKey(value.draft.date) : new Date());
          setDatePicker(true);
        }
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
      ocrSession.clear();
    };
  }, [
    ocrSession,
    params.expenseId,
    params.journeyId,
    params.receiptId,
    params.focusDate,
    discardPendingScan,
  ]);

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (notesFocused.current)
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        ocrSession.cancel();
        if (scanSessionRef.current) {
          const suspended = suspendReceiptScanSession(scanSessionRef.current);
          scanSessionRef.current = suspended;
          setScanSession(suspended);
        }
      }
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
      ocrSession.clear();
    };
  }, [ocrSession]);

  useEffect(() => {
    const current = scanSessionRef.current;
    const part = current?.documents.find((item) => item.draft.id === ocrState.draftId);
    if (!current || !part || ocrState.draftId !== part.draft.id) return;
    let next = current;
    if (ocrState.status === "recognizing" && part.status !== "recognizing")
      next = beginReceiptScanOcr(current, part.documentId);
    else if (
      (ocrState.status === "completed" ||
        ocrState.status === "no-text" ||
        ocrState.status === "failed") &&
      (part.status === "pending" || part.status === "recognizing")
    ) {
      const ready =
        part.status === "recognizing"
          ? current
          : beginReceiptScanOcr(current, part.documentId);
      if (
        (ocrState.status === "completed" || ocrState.status === "no-text") &&
        ocrState.document
      )
        next = completeReceiptScanOcr(
          ready,
          part.documentId,
          ready.documents.find((item) => item.documentId === part.documentId)!.revision,
          ocrState.document,
          {
            journeyCurrency: context?.settlementCurrency,
          },
        );
      else if (ocrState.status === "failed")
        next = completeReceiptScanOcr(
          ready,
          part.documentId,
          ready.documents.find((item) => item.documentId === part.documentId)!.revision,
          ocrState.errorCode ?? "CANCELLED",
        );
    } else if (ocrState.status === "cancelled" && part.status === "recognizing") {
      next = completeReceiptScanOcr(current, part.documentId, part.revision, "CANCELLED");
    }
    if (next !== current) {
      scanSessionRef.current = next;
      setScanSession(next);
      if (context)
        setReceiptReview((review) =>
          review
            ? refreshReceiptReviewState(
                review,
                next,
                context.settlementCurrency,
                context.defaultCurrency,
              )
            : createReceiptReviewState(
                next,
                context.settlementCurrency,
                context.defaultCurrency,
              ),
        );
    }
  }, [ocrState, context]);

  const dirty = Boolean(
    draft &&
    (JSON.stringify(draft) !== initialSnapshot ||
      receiptId !== (params.receiptId ?? null) ||
      receiptDrafts.length > 0 ||
      scanSession !== null),
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
              ocrSession.clear();
              discardPendingScan();
              for (const receiptDraft of receiptDrafts) {
                try {
                  discardExpenseReceiptDraft(receiptDraft);
                } catch {
                  /* keep an orphan candidate */
                }
              }
              allowClose.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ]);
      }),
    [dirty, navigation, ocrSession, receiptDrafts, discardPendingScan],
  );

  const selectedMembers = useMemo(
    () =>
      context?.members.filter((member) => draft?.participantIds.includes(member.id)) ??
      [],
    [context?.members, draft?.participantIds],
  );
  const scale = draft ? currencyScale(draft.currency) : null;
  const minor = draft && scale !== null ? parseCurrencyAmount(draft.amount, scale) : null;
  const amountPrecisionError = Boolean(draft?.amount.trim() && minor === null);
  const selectedEconomicDate = draft?.date || null;
  const settlementMinor =
    minor !== null && context && draft
      ? draft.currency === context.settlementCurrency
        ? minor
        : existing &&
            existing.original.minor === minor &&
            existing.original.currency === draft.currency &&
            (existing.economicDate ?? existing.occurredAt.slice(0, 10)) === draft.date &&
            (existing.economicDate ?? null) === selectedEconomicDate
          ? (existing.valuation?.settlement.minor ?? null)
          : null
      : null;
  const splitResult = useMemo(() => {
    if (!draft || minor === null || selectedMembers.length === 0)
      return { splits: null, error: "Choose an amount and participant." };
    try {
      return {
        splits: buildDraftSplits({
          mode: selectedMembers.length === 1 ? "EQUAL_PERSON" : draft.splitMode,
          originalMinor: minor,
          settlementMinor,
          members: selectedMembers,
          exactMinor: Object.fromEntries(
            selectedMembers.map((member) => [
              member.id,
              parseCurrencyAmount(draft.exact[member.id] ?? "", scale ?? 2, true) ?? -1,
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
    draft.date === (existing.economicDate ?? existing.occurredAt.slice(0, 10)) &&
    selectedEconomicDate === (existing.economicDate ?? null) &&
    draft.splitMode === existing.splits[0]?.method &&
    sameIds(
      draft.participantIds,
      existing.participants.map((participant) => participant.memberId),
    ) &&
    (draft.splitMode !== "EXACT" ||
      existing.splits.every(
        (split) =>
          parseCurrencyAmount(
            draft.exact[split.memberId] ?? "",
            existing.original.scale,
            true,
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
            sum +
            (parseCurrencyAmount(draft.exact[member.id] ?? "", scale ?? 2, true) ?? 0),
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

  const attach = async (
    kind: "camera" | "photo" | "file",
    scan = false,
    addPart = false,
  ) => {
    if (!context) return;
    if (addingReceiptRef.current) return;
    if (scan && scanSessionRef.current && !addPart) {
      Keyboard.dismiss();
      setReviewVisible(true);
      return;
    }
    if (
      addPart &&
      (!scanSessionRef.current ||
        scanSessionRef.current.documents.some((part) => part.status === "recognizing"))
    )
      return;
    if (
      !existing &&
      receiptDrafts.length +
        (receiptId ? 1 : 0) +
        (scanSessionRef.current?.documents.length ?? 0) >=
        MAX_EXPENSE_ATTACHMENTS
    ) {
      setError(`Maximum ${MAX_EXPENSE_ATTACHMENTS} attachments per expense.`);
      return;
    }
    addingReceiptRef.current = true;
    setSelectingReceipt(true);
    let selectedDraft: TemporaryReceiptDraft | null = null;
    try {
      let source: { uri: string; mimeType: string; name?: string | null } | null = null;
      if (kind === "file") {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            ...(addPart ? [] : ["application/pdf"]),
            "image/jpeg",
            "image/png",
            "image/heic",
            "image/heif",
          ],
          copyToCacheDirectory: true,
        });
        if (!result.canceled)
          source = {
            uri: result.assets[0].uri,
            mimeType: result.assets[0].mimeType ?? "",
            name: result.assets[0].name,
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
            mimeType: result.assets[0].mimeType ?? "",
            name: result.assets[0].fileName,
          };
      }
      if (!source) return;
      if (!existing) {
        const currentScan = scanSessionRef.current;
        const scanSessionId =
          scan && source.mimeType !== "application/pdf"
            ? (currentScan?.sessionId ?? createLocalId("receipt-scan"))
            : null;
        const next = await selectExpenseReceiptDraft(
          source.uri,
          source.mimeType,
          params.expenseId,
          receiptDrafts.length +
            (receiptId ? 1 : 0) +
            (scanSessionRef.current?.documents.length ?? 0),
          source.name,
          context.journeyId,
          scanSessionId
            ? { sessionId: scanSessionId, order: currentScan?.usedDraftIds.length ?? 0 }
            : undefined,
        );
        selectedDraft = next;
        if (!mountedRef.current) {
          discardExpenseReceiptDraft(next);
          selectedDraft = null;
          return;
        }
        if (addPart && next.mimeType === "application/pdf") {
          throw new Error("Receipt scan parts must be images.");
        }
        if (
          shouldRunExpenseReceiptOcr(scan, Boolean(existing)) &&
          next.mimeType !== "application/pdf"
        ) {
          const pending = addReceiptScanDocument(
            currentScan ??
              createReceiptScanSession(scanSessionId!, [
                ...receiptDrafts.map((item) => item.id),
                ...(receiptId ? [receiptId] : []),
              ]),
            next,
            { journeyCurrency: context.settlementCurrency },
          );
          scanSessionRef.current = pending;
          selectedDraft = null;
          setScanSession(pending);
          setReceiptReview((review) =>
            review && currentScan
              ? refreshReceiptReviewState(
                  review,
                  pending,
                  context.settlementCurrency,
                  context.defaultCurrency,
                )
              : seedReceiptReviewFromExpense(
                  createReceiptReviewState(
                    pending,
                    context.settlementCurrency,
                    context.defaultCurrency,
                  ),
                  draft!,
                ),
          );
          Keyboard.dismiss();
          setReviewVisible(true);
          ocrSession.start(next);
        } else {
          selectedDraft = null;
          setReceiptDrafts((current) => [...current, next]);
          if (shouldRunExpenseReceiptOcr(scan, Boolean(existing))) ocrSession.start(next);
        }
      } else {
        const receipt = await importReceiptAsset({
          journeyId: context.journeyId,
          expenseId: existing.id,
          sourceUri: source.uri,
          mimeType: source.mimeType,
          originalFilename: source.name,
          requestOcr: false,
        });
        setReceiptId(receipt?.id ?? null);
      }
    } catch (cause) {
      if (selectedDraft) {
        try {
          discardExpenseReceiptDraft(selectedDraft);
        } catch {
          /* retain for recovery */
        }
      }
      setError(cause instanceof Error ? cause.message : "Receipt could not be attached.");
    } finally {
      addingReceiptRef.current = false;
      setSelectingReceipt(false);
    }
  };

  const chooseReceipt = (scan = false, addPart = false) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["Camera", "Photo Library", "Files", "Cancel"], cancelButtonIndex: 3 },
      (index) => {
        if (index === 0) void attach("camera", scan, addPart);
        if (index === 1) void attach("photo", scan, addPart);
        if (index === 2) void attach("file", scan, addPart);
      },
    );

  const save = async () => {
    if (!context || !draft || minor === null || !effectiveSplits || savingRef.current)
      return;
    if (!draft.title.trim()) return setError("Enter a title or merchant.");
    if (!draft.date) return setError("Add an Expense date.");
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const original = { minor, currency: draft.currency, scale: scale! };
      const preserveValuation = Boolean(
        existing &&
        preservesExpenseValuation(existing, original, draft.date, selectedEconomicDate),
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
          existing &&
          draft.date === (existing.economicDate ?? existing.occurredAt.slice(0, 10))
            ? existing.occurredAt
            : draft.date,
        economicDate: selectedEconomicDate,
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
          existing?.status === "DRAFT"
            ? "DRAFT"
            : valuation
              ? "ACCEPTED"
              : "RATE_REQUIRED",
        settlementParticipation: draft.settlementParticipation,
      };
      if (existing && params.correctionRootId) {
        const successor = {
          localId: createUuid(),
          title: command.title,
          description: command.description ?? null,
          category: command.category,
          occurredAt: command.occurredAt,
          economicDate: command.economicDate,
          payerMemberId: command.payerMemberId,
          original: command.original,
          businessStatus: command.status,
          settlementParticipation: command.settlementParticipation,
          participants: command.participants,
          splits: command.splits,
          valuation: command.valuation
            ? {
                policy: command.valuation.policy,
                original: command.valuation.original,
                settlement: command.valuation.settlement,
                rateSnapshotId: command.valuation.rateSnapshotId,
                paymentRecordId: command.valuation.paymentRecordId,
                reason: command.valuation.reason,
              }
            : null,
        };
        const reason = params.correctionReason?.trim() ?? "";
        const correction = { sourceExpenseId: existing.id, successor, reason };
        const preview = await previewSettlementCorrection(
          existing.journeyId,
          params.correctionRootId,
          correction,
        );
        const changes = preview.balances
          .filter((balance) => balance.deltaMinor !== 0)
          .map(
            (balance) =>
              `${balance.displayNameSnapshot}: ${balance.deltaMinor > 0 ? "+" : ""}${formatLedgerMoney(
                balance.deltaMinor,
                balance.currency,
                balance.scale,
              )}`,
          )
          .join("\n");
        Alert.alert(
          "Settlement changes",
          `${changes || "No member balance changes."}\n\nThe previous confirmed settlement will remain in history.`,
          [
            { text: "Keep editing", style: "cancel" },
            {
              text: "Confirm updated amounts",
              onPress: () =>
                void confirmSettlementCorrection(
                  existing.journeyId,
                  params.correctionRootId!,
                  {
                    ...correction,
                    expectedHeadId: preview.expectedHeadId,
                    inputDigest: preview.inputDigest,
                    allowZeroTransfer: preview.zeroTransfer,
                  },
                )
                  .then(() =>
                    router.replace({
                      pathname: "/expenses/settlement",
                      params: { journeyId: existing.journeyId },
                    } as never),
                  )
                  .catch((cause) =>
                    Alert.alert(
                      "Correction not confirmed",
                      cause instanceof Error ? cause.message : "Try again.",
                    ),
                  ),
            },
          ],
        );
        return;
      }
      const saved = existing
        ? await (
            await getDefaultLedgerExpenseRepository()
          ).updateExpense(existing.id, command, "Edited Expense.")
        : await saveExpenseWithReceiptDraft(
            command,
            receiptDrafts,
            expenseDraftId.current,
          );
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
      ocrSession.clear();
      discardPendingScan();
      allowClose.current = true;
      if (existing) router.back();
      else
        router.replace({
          pathname: "/expenses/expense/[id]",
          params: { id: saved.id },
        });
      kickLedgerOperationalSync();
    } catch (cause) {
      setError(
        cause instanceof LedgerValidationError
          ? "Check the amount and participant shares before saving."
          : cause instanceof Error
            ? cause.message
            : "Expense could not be saved.",
      );
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
          ocrSession.clear();
          discardPendingScan();
          for (const receiptDraft of receiptDrafts) {
            try {
              discardExpenseReceiptDraft(receiptDraft);
            } catch {
              /* keep an orphan candidate */
            }
          }
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

  const payer = context.members.find((member) => member.id === draft.payerId);
  const date = draft.date ? dateFromKey(draft.date) : new Date();
  const selectedReceiptCount = receiptDrafts.length + (receiptId ? 1 : 0);
  const receiptCapacityFull =
    selectedReceiptCount + (scanSession?.documents.length ?? 0) >=
    MAX_EXPENSE_ATTACHMENTS;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <Stack.Screen
        options={{
          gestureEnabled: false,
          headerTitle: existing ? "Edit Expense" : "New Expense",
          headerTitleStyle: { color: "#0F766E" },
          headerLeft: () => <HeaderAction label="Cancel" onPress={close} />,
          headerRight: () => (
            <HeaderAction
              disabled={!draft.title.trim() || !draft.date || !effectiveSplits || saving}
              label={saving ? "Saving…" : "Save"}
              onPress={() => void save()}
            />
          ),
        }}
      />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
      >
        <TextInput
          accessibilityLabel="Expense amount"
          autoFocus={!existing}
          inputMode={scale === 0 ? "numeric" : "decimal"}
          keyboardType={scale === 0 ? "number-pad" : "decimal-pad"}
          maxFontSizeMultiplier={2}
          onChangeText={(value) =>
            setDraft({
              ...draft,
              amount: currencyAmountInput(draft.amount, value, scale ?? 2),
            })
          }
          placeholder="0"
          style={styles.amountInput}
          value={draft.amount}
        />
        {amountPrecisionError ? (
          <Text style={styles.error}>
            {currencyAmountHint(draft.currency, scale ?? 2)}
          </Text>
        ) : null}
        <View style={styles.currencyActions}>
          <View style={styles.currencyHalf}>
            <FormRow
              label="Currency"
              onPress={() => setCurrencySheet(true)}
              value={draft.currency}
            />
          </View>
          {!existing ? (
            <Pressable
              accessibilityLabel={
                scanSession
                  ? "Review receipt"
                  : receiptCapacityFull
                    ? `Maximum ${MAX_EXPENSE_ATTACHMENTS} attachments selected`
                    : "Scan receipt"
              }
              accessibilityRole="button"
              accessibilityState={{
                disabled: !scanSession && receiptCapacityFull,
              }}
              disabled={!scanSession && receiptCapacityFull}
              onPress={() => {
                if (scanSession) {
                  Keyboard.dismiss();
                  setReviewVisible(true);
                } else chooseReceipt(true);
              }}
              style={[styles.scanAction, largeText && styles.scanActionLargeText]}
            >
              <AppIcon color="#0F766E" name="doc.text.viewfinder" size={18} />
              <Text style={styles.scanActionText}>
                {scanSession
                  ? "Review receipt"
                  : receiptCapacityFull
                    ? `Maximum ${MAX_EXPENSE_ATTACHMENTS} attachments`
                    : "Scan receipt"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {!existing && ocrState.status !== "idle" ? (
          <View>
            <Text
              style={styles.hint}
              accessibilityLabel={`Receipt OCR ${ocrState.status}`}
            >
              {ocrState.status === "recognizing"
                ? "Reading receipt… You can enter details now."
                : ocrState.status === "completed"
                  ? "Receipt read. Enter details manually."
                  : ocrState.status === "no-text"
                    ? "No text found. Enter details manually."
                    : ocrState.status === "cancelled"
                      ? "Receipt reading stopped. Enter details manually."
                      : ocrState.errorCode === "UNSUPPORTED_IMAGE"
                        ? "OCR is unavailable for this file. You can still attach it."
                        : "Receipt could not be read. Enter details manually."}
            </Text>
            {ocrState.status !== "recognizing" &&
            ocrState.draftId &&
            receiptDrafts.some(
              (item) =>
                item.id === ocrState.draftId && item.mimeType !== "application/pdf",
            ) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const active = receiptDrafts.find(
                    (item) => item.id === ocrState.draftId,
                  );
                  if (active) ocrSession.start(active);
                }}
              >
                <Text style={styles.suggestion}>Read again</Text>
              </Pressable>
            ) : null}
            {context.debugMode ? (
              <Text style={styles.hint}>
                OCR · {ocrState.status}
                {ocrState.document
                  ? ` · ${ocrState.document.observations.length} observations · ${ocrState.document.durationMs} ms · ${ocrState.document.imageWidth}×${ocrState.document.imageHeight} · Apple Vision ${ocrState.document.engineRevision}`
                  : ocrState.errorCode
                    ? ` · ${ocrState.errorCode}`
                    : ""}
              </Text>
            ) : null}
          </View>
        ) : null}
        <TextInput
          accessibilityLabel="Title or merchant"
          onChangeText={(title) =>
            setDraft({
              ...draft,
              title,
              category: categoryManual ? draft.category : suggestExpenseCategory(title),
            })
          }
          placeholder="What was it?"
          style={styles.textInput}
          value={draft.title}
        />
        <FormRow
          label="Category"
          onPress={() => setCategorySheet(true)}
          value={draft.category}
        />
        <FormRow
          label="Expense date"
          onPress={() => {
            setPendingDate(date);
            setDatePicker(true);
          }}
          value={draft.date || "Add date"}
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
            selectedMembers.length === 1
              ? selectedMembers[0].id === context.actorId
                ? "Just you"
                : selectedMembers[0].displayName
              : `${selectedMembers.length} people`
          }
        />
        {selectedMembers.length > 1 ? (
          <FormRow
            label="Split"
            onPress={() => setSplitSheet(true)}
            value={`${splitLabels[draft.splitMode]} · ${selectedMembers.length}`}
          />
        ) : null}
        {selectedMembers.length > 1 && effectiveSplits ? (
          <Text style={styles.hint}>
            {effectiveSplits
              .slice(0, 3)
              .map((split) => {
                const member = selectedMembers.find((item) => item.id === split.memberId);
                return `${member?.displayName ?? "Traveller"} ${formatLedgerMoney(split.originalMinor, draft.currency, scale ?? 2)}`;
              })
              .join(" · ")}
          </Text>
        ) : selectedMembers.length > 1 && minor !== null ? (
          <Text style={styles.error}>{splitResult.error}</Text>
        ) : null}
        {shouldShowGroupSettlement(draft.participantIds, draft.payerId) ? (
          <View style={styles.settlementRow}>
            <Text style={styles.rowLabel}>Group settlement</Text>
            <View style={styles.settlementChoices}>
              {(["INCLUDED", "EXCLUDED"] as const).map((value) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: draft.settlementParticipation === value,
                  }}
                  key={value}
                  onPress={() => setDraft({ ...draft, settlementParticipation: value })}
                  style={[
                    styles.settlementChoice,
                    draft.settlementParticipation === value &&
                      styles.settlementChoiceSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.settlementChoiceText,
                      draft.settlementParticipation === value &&
                        styles.settlementChoiceTextSelected,
                    ]}
                  >
                    {value === "INCLUDED" ? "Include" : "Exclude"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={more ? "Hide More Details" : "Show More Details"}
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          onPress={() => setMore(!more)}
          style={styles.moreToggle}
        >
          <Text style={styles.moreToggleText}>More Details</Text>
          <AppIcon
            color="#0F766E"
            name={more ? "chevron.up" : "chevron.down"}
            size={17}
          />
        </Pressable>
        {more ? (
          <View style={styles.more}>
            <FormRow
              label="Attachment"
              onPress={() => chooseReceipt(false)}
              disabled={!existing && receiptCapacityFull}
              value={
                receiptDrafts.length || receiptId
                  ? `${receiptDrafts.length + (receiptId ? 1 : 0)} selected`
                  : "Optional"
              }
            />
            {receiptDrafts.map((receiptDraft, index) => (
              <View key={receiptDraft.id} style={styles.attachmentItem}>
                <AppIcon color="#0F766E" name="paperclip" size={15} />
                <Text style={styles.attachmentText}>
                  {`Receipt ${index + 1} saved temporarily`}
                </Text>
                {!existing &&
                recoveredDraftIds.has(receiptDraft.id) &&
                receiptDraft.mimeType !== "application/pdf" &&
                ocrState.draftId !== receiptDraft.id ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Read receipt ${index + 1}`}
                    onPress={() => ocrSession.start(receiptDraft)}
                  >
                    <Text style={styles.suggestion}>Read</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove receipt ${index + 1}`}
                  onPress={() => {
                    ocrSession.clear(receiptDraft.id);
                    try {
                      discardExpenseReceiptDraft(receiptDraft);
                    } catch {
                      /* preserve candidate */
                    }
                    setReceiptDrafts((current) =>
                      current.filter((item) => item.id !== receiptDraft.id),
                    );
                  }}
                >
                  <Text>Remove</Text>
                </Pressable>
              </View>
            ))}
            {receiptId ? (
              <Text style={styles.attachmentText}>Receipt attachment</Text>
            ) : null}
            {!existing && receiptCapacityFull ? (
              <Text>Maximum {MAX_EXPENSE_ATTACHMENTS} attachments selected</Text>
            ) : null}
            <TextInput
              accessibilityLabel="Expense notes"
              multiline
              onBlur={() => {
                notesFocused.current = false;
              }}
              onChangeText={(notes) => setDraft({ ...draft, notes })}
              onFocus={() => {
                notesFocused.current = true;
                requestAnimationFrame(() =>
                  scrollRef.current?.scrollToEnd({ animated: true }),
                );
              }}
              placeholder="Notes (optional)"
              style={[styles.textInput, styles.notes]}
              value={draft.notes}
            />
          </View>
        ) : null}
        {receiptId && params.receiptId ? (
          <Text style={styles.suggestion}>
            Receipt suggestions are editable until Save.
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {scanSession && receiptReview ? (
        <ReceiptReviewSheet
          canScanAnother={
            !receiptCapacityFull &&
            !selectingReceipt &&
            !scanSession.documents.some((part) => part.status === "recognizing")
          }
          scanBusy={
            selectingReceipt ||
            scanSession.documents.some((part) => part.status === "recognizing")
          }
          debugMode={context.debugMode}
          defaultCurrency={context.defaultCurrency}
          journeyCurrency={context.settlementCurrency}
          onCancel={() => {
            discardPendingScan();
          }}
          onChange={(next) => {
            setReceiptReview(next);
          }}
          onConfirm={(result, revision) => {
            const current = scanSessionRef.current;
            if (!current || !receiptReview || !draft || selectingReceipt)
              throw new Error("Receipt Review is not ready to confirm.");
            const prepared = prepareReceiptReviewConfirmation(
              receiptReview,
              current,
              result,
              revision,
              draft,
              receiptDrafts,
              receiptId,
            );
            const transferred = transferConfirmedReceiptDrafts(prepared.scannedDrafts);
            ocrSession.clear();
            scanSessionRef.current = null;
            setDraft(prepared.expense);
            setReceiptDrafts([...receiptDrafts, ...transferred]);
            setScanSession(null);
            setReceiptReview(null);
            setReviewVisible(false);
            setMore(true);
            setError(null);
          }}
          onRetry={(documentId) => {
            const part = scanSessionRef.current?.documents.find(
              (item) => item.documentId === documentId,
            );
            if (
              !part ||
              scanSessionRef.current?.documents.some(
                (item) => item.status === "recognizing",
              )
            )
              return;
            ocrSession.start(part.draft);
          }}
          onRemove={(documentId) => {
            const current = scanSessionRef.current;
            if (!current) return;
            const removed = removeReceiptScanDocument(current, documentId, {
              journeyCurrency: context.settlementCurrency,
            });
            if (!removed.removedDraft) return;
            scanSessionRef.current = removed.session;
            setScanSession(removed.session);
            setReceiptReview((review) =>
              review
                ? refreshReceiptReviewState(
                    review,
                    removed.session,
                    context.settlementCurrency,
                    context.defaultCurrency,
                  )
                : null,
            );
            ocrSession.clear(removed.removedDraft.id);
            discardedScanDraftIdsRef.current.add(removed.removedDraft.id);
            try {
              discardExpenseReceiptDraft(removed.removedDraft);
            } catch {
              /* retain for recovery */
            }
          }}
          onScanAnother={() => chooseReceipt(true, true)}
          review={receiptReview}
          session={scanSession}
          visible={reviewVisible}
        />
      ) : null}

      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setCurrencySheet(false)}
        presentationStyle="pageSheet"
        visible={currencySheet}
      >
        <LedgerSheetHeader onLeft={() => setCurrencySheet(false)} title="Currency" />
        {currencySheet ? (
          <CurrencyPicker
            selected={draft.currency}
            suggestions={[
              ...context.recentCurrencies,
              draft.currency,
              context.settlementCurrency,
              context.defaultCurrency,
            ]}
            onSelect={(code) => {
              const corrected = correctedCurrencyDraft(draft, code);
              setDraft({
                ...corrected,
                exact: Object.fromEntries(
                  Object.entries(draft.exact).map(([id, amount]) => [
                    id,
                    correctedCurrencyDraft({ amount, currency: draft.currency }, code)
                      .amount,
                  ]),
                ),
              });
              setCurrencySheet(false);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setCategorySheet(false)}
        presentationStyle="pageSheet"
        visible={categorySheet}
      >
        <LedgerSheetHeader
          onLeft={() => setCategorySheet(false)}
          title="Category"
          titleBold
        />
        <ScrollView contentContainerStyle={styles.categoryContent}>
          {categoryGroups.map((group) => (
            <View key={group.title}>
              <Text style={styles.categoryHeading}>{group.title}</Text>
              <View style={styles.categoryGrid}>
                {group.items.map(({ id, icon }) => {
                  const selected = draft.category === id;
                  return (
                    <Pressable
                      accessibilityLabel={id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={id}
                      onPress={() => {
                        setCategoryManual(true);
                        setDraft({ ...draft, category: id });
                        setCategorySheet(false);
                      }}
                      style={[
                        styles.categoryTile,
                        selected && styles.categoryTileSelected,
                      ]}
                    >
                      <AppIcon color="#0F766E" name={icon} size={22} />
                      <Text style={styles.categoryTileText}>
                        {id[0].toUpperCase() + id.slice(1)}
                      </Text>
                      {selected ? (
                        <AppIcon color="#0F766E" name="checkmark" size={16} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </Modal>

      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setMemberSheet(false)}
        presentationStyle="pageSheet"
        visible={memberSheet}
      >
        <LedgerSheetHeader onLeft={() => setMemberSheet(false)} title="Participants" />
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

      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setSplitSheet(false)}
        presentationStyle="pageSheet"
        visible={splitSheet}
      >
        <LedgerSheetHeader onLeft={() => setSplitSheet(false)} title="Split Expense" />
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
          {(["EQUAL_PERSON", "EXACT"] as const).map((mode) => {
            return (
              <SheetRow
                key={mode}
                label={splitLabels[mode]}
                selected={draft.splitMode === mode}
                onPress={() => setDraft({ ...draft, splitMode: mode })}
              />
            );
          })}
          {draft.splitMode === "EXACT"
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
                    keyboardType={
                      draft.splitMode === "EXACT" && scale === 0
                        ? "number-pad"
                        : "decimal-pad"
                    }
                    onChangeText={(value) => {
                      const field = draft.splitMode === "EXACT" ? "exact" : "percentages";
                      setDraft({
                        ...draft,
                        [field]: {
                          ...draft[field],
                          [member.id]:
                            field === "exact"
                              ? currencyAmountInput(
                                  draft.exact[member.id] ?? "",
                                  value,
                                  scale ?? 2,
                                )
                              : value,
                        },
                      });
                    }}
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
          {minor !== null ? (
            <Text style={effectiveSplits ? styles.success : styles.error}>
              {effectiveSplits
                ? `Allocated exactly · ${formatLedgerMoney(minor, draft.currency, scale ?? 2)} · Remaining 0`
                : splitResult.error}
            </Text>
          ) : null}
        </ScrollView>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setDatePicker(false)}
        transparent
        visible={datePicker}
      >
        <View style={styles.dateOverlay}>
          <Pressable
            accessibilityLabel="Dismiss expense date picker"
            accessibilityRole="button"
            onPress={() => setDatePicker(false)}
            style={styles.dateBackdrop}
          />
          <SafeAreaView edges={["bottom"]} style={styles.datePanel}>
            <LedgerSheetHeader
              leftLabel="Cancel"
              onLeft={() => setDatePicker(false)}
              onRight={() => {
                setDraft({ ...draft, date: dateKey(pendingDate) });
                setDatePicker(false);
              }}
              safeTop={false}
              title="Expense date"
            />
            {datePicker ? (
              <View style={styles.dateWheelContainer}>
                <DateTimePicker
                  display="spinner"
                  mode="date"
                  onChange={(_, value) => {
                    if (value) setPendingDate(value);
                  }}
                  style={styles.dateWheel}
                  textColor="#0F172A"
                  themeVariant="light"
                  value={pendingDate}
                />
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
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
  const [journeys, actor, rawMembers, households, receipt, expenses, preferences] =
    await Promise.all([
      reporting.listJourneys(),
      reporting.getActorMemberId(id),
      reads.listMembers(id),
      reads.listHouseholds(id),
      receiptId
        ? (await getDefaultLedgerReceiptRepository()).getReceipt(receiptId)
        : Promise.resolve(null),
      expenseRepository.listExpensesForJourney(id),
      reporting.getPreferences(),
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
    date: existing
      ? (proposedExpenseDate(existing) ?? "")
      : (suggestion?.occurredAt ?? dateKey(new Date())).slice(0, 10),
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
        : suggestExpenseCategory(suggestion?.title ?? "")),
    notes: existing?.description ?? "",
  };
  return {
    existing,
    draft,
    context: {
      journeyId: id,
      settlementCurrency: journey.settlementCurrency,
      settlementScale: journey.settlementScale,
      recentCurrencies: [
        ...new Set(expenses.map((expense) => expense.original.currency)),
      ],
      defaultCurrency: preferences.defaultCurrency,
      debugMode: preferences.debugMode,
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
  disabled = false,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  return (
    <Pressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { gap: 14, padding: 16, paddingBottom: 48 },
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
  currencyActions: { flexDirection: "row", gap: 10 },
  currencyHalf: { flex: 1, minWidth: 0 },
  scanAction: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 52,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  scanActionLargeText: { alignItems: "flex-start", flexDirection: "column" },
  scanActionText: { color: "#0F766E", fontSize: 15, fontWeight: "600" },
  attachmentItem: { alignItems: "center", flexDirection: "row", gap: 6, marginLeft: 12 },
  attachmentText: { color: "#475569", fontSize: 14 },
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
  settlementRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  settlementChoices: {
    backgroundColor: "#E5E7EB",
    borderRadius: 9,
    flexDirection: "row",
    padding: 3,
  },
  settlementChoice: {
    alignItems: "center",
    borderRadius: 7,
    minHeight: 36,
    minWidth: 64,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  settlementChoiceSelected: { backgroundColor: "#0F766E" },
  settlementChoiceText: { color: "#475569", fontSize: 13, fontWeight: "600" },
  settlementChoiceTextSelected: { color: "#FFFFFF" },
  moreToggle: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  moreToggleText: { color: "#0F766E", fontSize: 15, fontWeight: "600" },
  hint: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  suggestion: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  warning: { color: "#92400E", fontSize: 14, lineHeight: 20 },
  error: { color: "#B91C1C", fontSize: 15, lineHeight: 21 },
  success: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  more: { gap: 12 },
  dateOverlay: { flex: 1, justifyContent: "flex-end" },
  dateBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
  },
  datePanel: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  dateWheelContainer: { alignItems: "center", justifyContent: "center", minHeight: 280 },
  dateWheel: { height: 216, width: "100%" },
  headerAction: { color: "#0F766E", fontSize: 17, fontWeight: "700", padding: 8 },
  headerActionButton: { justifyContent: "center", minHeight: 44 },
  disabledText: { opacity: 0.4 },
  sheetContent: { gap: 10, padding: 16, paddingBottom: 48 },
  categoryContent: { gap: 24, padding: 16, paddingBottom: 48 },
  categoryHeading: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  categoryTile: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 60,
    paddingHorizontal: 12,
    width: "48%",
  },
  categoryTileSelected: { backgroundColor: "#E6F5F1", borderColor: "#0F766E" },
  categoryTileText: { color: "#0F172A", flex: 1, fontSize: 16, fontWeight: "600" },
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
