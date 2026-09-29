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
  Animated,
  AppState,
  Keyboard,
  Modal,
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
import { navigationTextActionStyle } from "@/components/navigationChrome";

import { resolveReceiptAssetUri } from "@/data/operations/openReceiptAsset";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { canEditLedgerExpense } from "@/data/repositories/ledgerExpenseEditAccess";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { ExpenseAttachmentRow } from "./ExpenseAttachmentRow";
import { ExpenseAttachmentViewer } from "./ExpenseAttachmentViewer";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import {
  discardExpenseReceiptDraft,
  restoreExpenseReceiptDrafts,
  saveExpenseWithReceiptDraft,
  saveExpenseEditWithReceiptDrafts,
  selectExpenseReceiptDraft,
  selectExpenseReceiptDraftBatch,
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
import { previewReceiptDraftPdf } from "@/native/receiptDraftPreview";
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
import {
  applyExpenseSharing,
  compactExpenseDate,
  exactSharingAllocation,
  expenseSettlementLabel,
  expenseSharingSummary,
  GROUP_SETTLEMENT_EXPLANATION,
  remainingExpenseAttachmentCapacity,
} from "./expenseEntryPresentation";
import { ExpenseSettlementTag } from "./ExpenseSettlementTag";

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
  const currencyChosen = useRef(false);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [receiptId, setReceiptId] = useState(params.receiptId ?? null);
  const [receiptDrafts, setReceiptDrafts] = useState<TemporaryReceiptDraft[]>([]);
  const [previewDraft, setPreviewDraft] = useState<TemporaryReceiptDraft | null>(null);
  const [existingReceipts, setExistingReceipts] = useState<ReceiptAsset[]>([]);
  const [removedReceiptIds, setRemovedReceiptIds] = useState<string[]>([]);
  const [savedPreviewId, setSavedPreviewId] = useState<string | null>(null);
  const [savedPreviewUris, setSavedPreviewUris] = useState<Record<string, string>>({});
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
  const [currencySheet, setCurrencySheet] = useState(false);
  const [categorySheet, setCategorySheet] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [pendingDate, setPendingDate] = useState(new Date());
  const [dateBackdropOpacity] = useState(() => new Animated.Value(0));
  const { fontScale, height: windowHeight } = useWindowDimensions();
  const [dateSheetOffset] = useState(() => new Animated.Value(windowHeight));
  const dateDismissing = useRef(false);
  const [amountFocused, setAmountFocused] = useState(false);
  const [sharingSheet, setSharingSheet] = useState(false);
  const [sharingDraft, setSharingDraft] = useState<Draft | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [categoryManual, setCategoryManual] = useState(false);
  const allowClose = useRef(false);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const addingReceiptRef = useRef(false);
  const [selectingReceipt, setSelectingReceipt] = useState(false);
  const expenseDraftId = useRef(createLocalId("ledger-expense"));
  const scanOcrQueue = useRef<string[]>([]);
  const [scanSourceVisible, setScanSourceVisible] = useState(false);
  const scanSourceAddPart = useRef(false);
  const pendingScanSource = useRef<"camera" | "photo" | "file" | null>(null);
  const largeText = fontScale > 2;
  const retainedReceipts = existingReceipts.filter(
    (item) => !removedReceiptIds.includes(item.id),
  );
  const selectedReceiptCount =
    receiptDrafts.length +
    retainedReceipts.length +
    (receiptId && !existingReceipts.some((item) => item.id === receiptId) ? 1 : 0);

  const dismissDatePicker = (commit = false) => {
    if (dateDismissing.current) return;
    dateDismissing.current = true;
    Animated.parallel([
      Animated.timing(dateBackdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(dateSheetOffset, {
        toValue: windowHeight,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (commit)
        setDraft((current) => current && { ...current, date: dateKey(pendingDate) });
      setDatePicker(false);
      dateDismissing.current = false;
    });
  };

  const discardPendingScan = useCallback(() => {
    scanOcrQueue.current = [];
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
    void loadEntry(
      params.expenseId,
      params.journeyId,
      params.receiptId,
      Boolean(params.correctionRootId),
    )
      .then(async (value) => {
        if (!active) return;
        setContext(value.context);
        setExisting(value.existing);
        setExistingReceipts(value.receipts);
        setRemovedReceiptIds([]);
        setDraft(value.draft);
        currencyChosen.current = value.currencyChosen;
        setReceiptId(params.receiptId ?? null);
        setCategoryManual(Boolean(value.existing));
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
    params.correctionRootId,
    discardPendingScan,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        scanOcrQueue.current = [];
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

  useEffect(() => {
    if (selectingReceipt || ocrState.status === "recognizing") return;
    if (AppState.currentState !== "active") {
      scanOcrQueue.current = [];
      return;
    }
    while (scanOcrQueue.current.length) {
      const id = scanOcrQueue.current.shift();
      const part = scanSessionRef.current?.documents.find((item) => item.draft.id === id);
      if (part?.status === "pending") {
        ocrSession.start(part.draft);
        break;
      }
    }
  }, [ocrState, scanSession, selectingReceipt, ocrSession]);

  const dirty = Boolean(
    draft &&
    (JSON.stringify(draft) !== initialSnapshot ||
      receiptId !== (params.receiptId ?? null) ||
      receiptDrafts.length > 0 ||
      removedReceiptIds.length > 0 ||
      scanSession !== null),
  );

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (allowClose.current) return;
        if (savingRef.current || addingReceiptRef.current) {
          event.preventDefault();
          return;
        }
        if (!dirty) return;
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

  const attach = async (
    kind: "camera" | "photo" | "file",
    scan = false,
    addPart = false,
  ) => {
    if (!context || (scan && existing)) return;
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
      remainingExpenseAttachmentCapacity(
        selectedReceiptCount,
        scanSessionRef.current?.documents.length ?? 0,
      ) === 0
    ) {
      setError(`Maximum ${MAX_EXPENSE_ATTACHMENTS} attachments per expense.`);
      return;
    }
    addingReceiptRef.current = true;
    setSelectingReceipt(true);
    let selectedDraft: TemporaryReceiptDraft | null = null;
    try {
      const remaining = remainingExpenseAttachmentCapacity(
        selectedReceiptCount,
        scanSessionRef.current?.documents.length ?? 0,
      );
      let sources: { uri: string; mimeType: string; name?: string | null }[] = [];
      if (kind === "file") {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            ...(scan ? [] : ["application/pdf"]),
            "image/jpeg",
            "image/png",
            "image/heic",
            "image/heif",
          ],
          copyToCacheDirectory: true,
          multiple: true,
        });
        if (!result.canceled)
          sources = result.assets.map((asset) => ({
            uri: asset.uri,
            mimeType: asset.mimeType ?? "",
            name: asset.name,
          }));
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
                allowsMultipleSelection: true,
                selectionLimit: remaining,
              });
        if (!result.canceled)
          sources = result.assets.map((asset) => ({
            uri: asset.uri,
            mimeType: asset.mimeType ?? "",
            name: asset.fileName,
          }));
      }
      if (!sources.length) return;
      if (sources.length > remaining)
        throw new Error(
          `Select up to ${remaining} attachment${remaining === 1 ? "" : "s"}.`,
        );
      if (!scan) {
        const result = await selectExpenseReceiptDraftBatch(
          sources,
          selectedReceiptCount,
          existing ? undefined : context.journeyId,
        );
        if (!mountedRef.current) {
          for (const imported of result.drafts) discardExpenseReceiptDraft(imported);
          return;
        }
        if (result.drafts.length)
          setReceiptDrafts((current) => [...current, ...result.drafts]);
        if (result.error)
          setError(
            `${result.error.message}${result.drafts.length ? " Earlier attachments were kept." : ""}`,
          );
        return;
      }
      if (!existing) {
        for (const source of sources) {
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
          if (
            !mountedRef.current ||
            (currentScan && scanSessionRef.current?.sessionId !== currentScan.sessionId)
          ) {
            discardExpenseReceiptDraft(next);
            selectedDraft = null;
            return;
          }
          if (scan && next.mimeType === "application/pdf") {
            throw new Error("Receipt scan parts must be images.");
          }
          if (
            shouldRunExpenseReceiptOcr(scan, Boolean(existing)) &&
            next.mimeType !== "application/pdf"
          ) {
            const pending = addReceiptScanDocument(
              scanSessionRef.current ??
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
                    currencyChosen.current,
                  ),
            );
            scanOcrQueue.current.push(next.id);
          } else {
            selectedDraft = null;
            setReceiptDrafts((current) => [...current, next]);
            if (shouldRunExpenseReceiptOcr(scan, Boolean(existing)))
              ocrSession.start(next);
          }
        }
      }
    } catch (cause) {
      if (selectedDraft) {
        try {
          discardExpenseReceiptDraft(selectedDraft);
        } catch {
          /* retain for recovery */
        }
      }
      const message =
        cause instanceof Error ? cause.message : "Receipt could not be attached.";
      setError(message);
    } finally {
      addingReceiptRef.current = false;
      setSelectingReceipt(false);
      if (scan && mountedRef.current && scanSessionRef.current) {
        Keyboard.dismiss();
        setReviewVisible(true);
      }
    }
  };

  const chooseReceipt = (scan = false, addPart = false) => {
    Keyboard.dismiss();
    if (scan) {
      scanSourceAddPart.current = addPart;
      pendingScanSource.current = null;
      setScanSourceVisible(true);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["Camera", "Photo Library", "Files", "Cancel"], cancelButtonIndex: 3 },
      (index) => {
        if (index === 0) void attach("camera");
        if (index === 1) void attach("photo");
        if (index === 2) void attach("file");
      },
    );
  };

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
        ? await saveExpenseEditWithReceiptDrafts(
            existing,
            command,
            receiptDrafts,
            removedReceiptIds,
            existingReceipts.map((item) => item.id),
          )
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
    if (savingRef.current || addingReceiptRef.current) return;
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

  const sharing = expenseSharingSummary(draft, context.members, context.actorId);
  const sharingEdit = sharingDraft ?? draft;
  const sharingMembers = context.members.filter((member) =>
    sharingEdit.participantIds.includes(member.id),
  );
  const exactAllocation = exactSharingAllocation(
    minor,
    scale ?? 2,
    sharingMembers.map((member) => member.id),
    sharingEdit.exact,
  );
  const date = draft.date ? dateFromKey(draft.date) : new Date();
  const remainingAttachmentSlots = remainingExpenseAttachmentCapacity(
    selectedReceiptCount,
    scanSession?.documents.length ?? 0,
  );
  const receiptCapacityFull = remainingAttachmentSlots === 0;
  const scanSourceSheet = (
    <Modal
      animationType="slide"
      transparent
      visible={scanSourceVisible}
      onRequestClose={() => setScanSourceVisible(false)}
      onDismiss={() => {
        const kind = pendingScanSource.current;
        pendingScanSource.current = null;
        if (kind) void attach(kind, true, scanSourceAddPart.current);
      }}
    >
      <View style={styles.scanSourceOverlay}>
        <Pressable
          accessibilityLabel="Cancel scan receipt"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={() => setScanSourceVisible(false)}
        />
        <SafeAreaView edges={["bottom"]} style={styles.scanSourcePanel}>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.scanSourceContent}
          >
            <Text accessibilityRole="header" style={styles.scanSourceTitle}>
              Scan receipt
            </Text>
            <Text style={styles.hint}>
              Scan one receipt, or add multiple parts of a long receipt.
            </Text>
            <Text style={styles.hint}>
              {selectedReceiptCount + (scanSession?.documents.length ?? 0) === 0
                ? `Up to ${MAX_EXPENSE_ATTACHMENTS} images per expense`
                : `${remainingAttachmentSlots} attachment slot${remainingAttachmentSlots === 1 ? "" : "s"} remaining`}
            </Text>
            {(
              [
                ["camera", "Camera", "Take one photo"],
                ["photo", "Photo Library", "Select one or multiple photos"],
                ["file", "Files", "Select receipt images"],
              ] as const
            ).map(([kind, title, subtitle]) => (
              <Pressable
                key={kind}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${subtitle}`}
                disabled={receiptCapacityFull}
                style={styles.scanSourceOption}
                onPress={() => {
                  pendingScanSource.current = kind;
                  setScanSourceVisible(false);
                }}
              >
                <Text style={styles.scanActionText}>{title}</Text>
                <Text style={styles.hint}>{subtitle}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              style={styles.scanSourceOption}
              onPress={() => setScanSourceVisible(false)}
            >
              <Text style={styles.scanActionText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
  const previewImages = [
    ...retainedReceipts
      .filter((item) => item.mimeType.startsWith("image/"))
      .map((item) => ({
        id: item.id,
        localUri: savedPreviewUris[item.id] ?? item.localUri ?? "",
      })),
    ...receiptDrafts.filter((item) => item.mimeType.startsWith("image/")),
  ];
  const previewExisting = async (receipt: ReceiptAsset) => {
    try {
      const uri = await resolveReceiptAssetUri(receipt);
      if (receipt.mimeType === "application/pdf") previewReceiptDraftPdf(uri);
      else {
        setSavedPreviewUris((current) => ({ ...current, [receipt.id]: uri }));
        setSavedPreviewId(receipt.id);
        setPreviewDraft(null);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Attachment could not be opened.",
      );
    }
  };
  const deleteExpense = () => {
    if (!existing || saving || params.correctionRootId) return;
    Alert.alert(
      "Delete this expense?",
      "This expense will be removed from the trip, spending and settlement calculations. Its history and attachments are retained.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Expense",
          style: "destructive",
          onPress: () => {
            if (savingRef.current) return;
            savingRef.current = true;
            setSaving(true);
            void getDefaultLedgerExpenseRepository()
              .then((repo) => repo.tombstoneExpense(existing.id, "Deleted Expense."))
              .then(() => {
                for (const receiptDraft of receiptDrafts) {
                  try {
                    discardExpenseReceiptDraft(receiptDraft);
                  } catch {
                    /* recovery candidate */
                  }
                }
                allowClose.current = true;
                notifyLedgerReviewExpenseSaved(existing.journeyId);
                kickLedgerOperationalSync();
                router.dismissTo({
                  pathname: "/expenses/journey/[journeyId]",
                  params: { journeyId: existing.journeyId },
                });
              })
              .catch((cause) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Expense could not be deleted.",
                ),
              )
              .finally(() => {
                savingRef.current = false;
                setSaving(false);
              });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          gestureEnabled: false,
          headerTitle: existing ? "Edit Expense" : "New Expense",
          headerTitleStyle: { color: "#0F766E" },
          headerLeft: () => (
            <HeaderAction
              disabled={saving || selectingReceipt}
              label="Cancel"
              onPress={close}
            />
          ),
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
        pointerEvents={saving ? "none" : "auto"}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <TextInput
          accessibilityLabel="Expense amount"
          accessibilityHint={
            amountPrecisionError && !amountFocused
              ? currencyAmountHint(draft.currency, scale ?? 2)
              : undefined
          }
          autoFocus={!existing}
          inputMode={scale === 0 ? "numeric" : "decimal"}
          keyboardType={scale === 0 ? "number-pad" : "decimal-pad"}
          maxFontSizeMultiplier={2}
          onBlur={() => setAmountFocused(false)}
          onChangeText={(value) =>
            setDraft({
              ...draft,
              amount: currencyAmountInput(draft.amount, value, scale ?? 2),
            })
          }
          onFocus={() => setAmountFocused(true)}
          placeholder="0"
          style={[
            styles.amountInput,
            amountPrecisionError && !amountFocused && styles.amountInvalid,
          ]}
          value={draft.amount}
        />
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
              accessibilityLabel={scanSession ? "Review receipt" : "Scan receipt"}
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
              style={[
                styles.scanAction,
                largeText && styles.scanActionLargeText,
                !scanSession && receiptCapacityFull && styles.disabledScanAction,
              ]}
            >
              <AppIcon color="#0F766E" name="doc.text.viewfinder" size={18} />
              <Text style={styles.scanActionText}>
                {scanSession ? "Review receipt" : "Scan receipt"}
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
        <View style={styles.compactPair}>
          <View style={styles.compactHalf}>
            <FormRow
              label="Category"
              onPress={() => setCategorySheet(true)}
              value={draft.category}
              stacked
            />
          </View>
          <View style={styles.compactHalf}>
            <FormRow
              label="Date"
              onPress={() => {
                Keyboard.dismiss();
                setPendingDate(date);
                setDatePicker(true);
              }}
              value={draft.date ? compactExpenseDate(draft.date) : "Add date"}
              stacked
            />
          </View>
        </View>
        <View style={styles.summaryCard}>
          <View style={styles.sharingTitleRow}>
            <Text style={styles.rowLabel}>Sharing</Text>
            <Pressable
              accessibilityLabel="About group settlement"
              accessibilityRole="button"
              onPress={() =>
                Alert.alert("Group settlement", GROUP_SETTLEMENT_EXPLANATION)
              }
              style={styles.infoAction}
            >
              <AppIcon color="#0F766E" name="info.circle" size={19} />
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel={`Sharing, ${sharing.join(", ")}${expenseSettlementLabel(draft) ? `, ${expenseSettlementLabel(draft)}` : ""}`}
            accessibilityRole="button"
            onPress={() => {
              Keyboard.dismiss();
              setSharingDraft({
                ...draft,
                participantIds: [...draft.participantIds],
                exact: { ...draft.exact },
                percentages: { ...draft.percentages },
              });
              setSharingSheet(true);
            }}
            style={styles.sharingSummaryAction}
          >
            {sharing.map((line) => (
              <Text key={line} style={styles.summaryValue}>
                {line}
              </Text>
            ))}
            {expenseSettlementLabel(draft) ? (
              <ExpenseSettlementTag value={draft.settlementParticipation} />
            ) : null}
          </Pressable>
        </View>
        {selectedMembers.length > 1 && minor !== null && !effectiveSplits ? (
          <Text style={styles.error}>{splitResult.error}</Text>
        ) : null}
        <View style={styles.optionalSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.rowLabel}>
              Attachments{selectedReceiptCount ? ` · ${selectedReceiptCount}` : ""}
            </Text>
            {!selectedReceiptCount ? (
              <Text style={styles.optionalLabel}>Optional</Text>
            ) : null}
          </View>
          {retainedReceipts.map((receipt, index) => (
            <ExpenseAttachmentRow
              key={receipt.id}
              attachment={{
                ...receipt,
                localUri: savedPreviewUris[receipt.id] ?? receipt.localUri,
              }}
              position={index + 1}
              onPreview={() => void previewExisting(receipt)}
              onRemove={
                params.correctionRootId
                  ? undefined
                  : () => setRemovedReceiptIds((current) => [...current, receipt.id])
              }
            />
          ))}
          {receiptDrafts.map((receiptDraft, index) => (
            <ExpenseAttachmentRow
              key={receiptDraft.id}
              attachment={receiptDraft}
              position={retainedReceipts.length + index + 1}
              onPreview={() => {
                Keyboard.dismiss();
                if (receiptDraft.mimeType.startsWith("image/")) {
                  setSavedPreviewId(null);
                  setPreviewDraft(receiptDraft);
                } else {
                  try {
                    previewReceiptDraftPdf(receiptDraft.localUri);
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "Preview unavailable.",
                    );
                  }
                }
              }}
              onRemove={() => {
                ocrSession.clear(receiptDraft.id);
                try {
                  discardExpenseReceiptDraft(receiptDraft);
                } catch {
                  /* recovery candidate */
                }
                setReceiptDrafts((current) =>
                  current.filter((item) => item.id !== receiptDraft.id),
                );
              }}
            />
          ))}
          {receiptId && !existingReceipts.some((item) => item.id === receiptId) ? (
            <Text style={styles.attachmentText}>Receipt attachment</Text>
          ) : null}
          {!receiptCapacityFull && !params.correctionRootId ? (
            <Pressable
              accessibilityLabel="Add attachment"
              accessibilityRole="button"
              onPress={() => chooseReceipt(false)}
              style={styles.addAttachment}
            >
              <Text style={styles.suggestion}>+ Add attachment</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.optionalSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.rowLabel}>Notes</Text>
            <Text style={styles.optionalLabel}>Optional</Text>
          </View>
          {notesExpanded || draft.notes ? (
            <TextInput
              accessibilityLabel="Expense notes"
              autoFocus={notesExpanded && !draft.notes}
              multiline
              onChangeText={(notes) => setDraft({ ...draft, notes })}
              onFocus={() => {
                setNotesExpanded(true);
              }}
              placeholder="Add a note..."
              style={[styles.textInput, styles.notes]}
              value={draft.notes}
            />
          ) : (
            <Pressable
              accessibilityLabel="Add a note"
              accessibilityRole="button"
              onPress={() => setNotesExpanded(true)}
              style={styles.addNote}
            >
              <Text style={styles.optionalLabel}>Add a note...</Text>
            </Pressable>
          )}
        </View>
        {receiptId && params.receiptId ? (
          <Text style={styles.suggestion}>
            Receipt suggestions are editable until Save.
          </Text>
        ) : null}
        {existing && !params.correctionRootId ? (
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={deleteExpense}
            style={styles.deleteExpense}
          >
            <Text style={styles.error}>Delete Expense</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <ExpenseAttachmentViewer
        images={previewImages}
        selectedId={savedPreviewId ?? previewDraft?.id ?? null}
        onClose={() => {
          setSavedPreviewId(null);
          setPreviewDraft(null);
        }}
        onSelect={(id) => {
          const next = receiptDrafts.find((item) => item.id === id);
          if (next) {
            setPreviewDraft(next);
            setSavedPreviewId(null);
          } else {
            const receipt = retainedReceipts.find((item) => item.id === id);
            if (receipt) void previewExisting(receipt);
          }
        }}
      />

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
            scanOcrQueue.current = [];
            ocrSession.clear();
            scanSessionRef.current = null;
            setDraft(prepared.expense);
            currencyChosen.current = true;
            setReceiptDrafts([...receiptDrafts, ...transferred]);
            setScanSession(null);
            setReceiptReview(null);
            setReviewVisible(false);
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
          sourceChooser={reviewVisible ? scanSourceSheet : null}
          review={receiptReview}
          session={scanSession}
          visible={reviewVisible}
        />
      ) : null}

      {!reviewVisible ? scanSourceSheet : null}
      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setSharingSheet(false)}
        presentationStyle="pageSheet"
        visible={sharingSheet}
      >
        <LedgerSheetHeader
          leftLabel="Cancel"
          onLeft={() => setSharingSheet(false)}
          onRight={() => {
            setDraft(applyExpenseSharing(draft, sharingEdit));
            setSharingSheet(false);
          }}
          rightDisabled={
            sharingMembers.length > 1 &&
            sharingEdit.splitMode === "EXACT" &&
            !exactAllocation.valid
          }
          title="Sharing"
        />
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.sheetContent}
        >
          <Text style={styles.sharingHeading}>Paid by</Text>
          <View style={styles.chipList}>
            {context.members.map((member) => (
              <ChoiceChip
                key={`payer-${member.id}`}
                label={member.id === context.actorId ? "You" : member.displayName}
                selected={sharingEdit.payerId === member.id}
                onPress={() => setSharingDraft({ ...sharingEdit, payerId: member.id })}
              />
            ))}
          </View>
          <Text style={styles.sharingHeading}>Participants</Text>
          <View style={styles.chipList}>
            {context.members.map((member) => {
              const selected = sharingEdit.participantIds.includes(member.id);
              return (
                <ChoiceChip
                  key={`participant-${member.id}`}
                  label={member.id === context.actorId ? "You" : member.displayName}
                  selected={selected}
                  onPress={() => {
                    const ids = selected
                      ? sharingEdit.participantIds.filter((id) => id !== member.id)
                      : [...sharingEdit.participantIds, member.id];
                    if (ids.length)
                      setSharingDraft({ ...sharingEdit, participantIds: ids });
                  }}
                />
              );
            })}
          </View>
          {sharingMembers.length > 1 ? (
            <>
              <Text style={styles.sharingHeading}>Split</Text>
              <View style={styles.chipList}>
                {(
                  [
                    ...new Set<ExpenseSplitMethod>([
                      "EQUAL_PERSON",
                      "EXACT",
                      sharingEdit.splitMode,
                    ]),
                  ] as ExpenseSplitMethod[]
                ).map((mode) => (
                  <ChoiceChip
                    key={mode}
                    label={splitLabels[mode]}
                    selected={sharingEdit.splitMode === mode}
                    onPress={() => setSharingDraft({ ...sharingEdit, splitMode: mode })}
                  />
                ))}
              </View>
              {sharingEdit.splitMode === "EXACT" ? (
                <>
                  <View style={styles.allocationSummary}>
                    <AllocationLine
                      label="Expense total"
                      value={
                        minor === null
                          ? "Add an amount"
                          : formatLedgerMoney(minor, draft.currency, scale ?? 2)
                      }
                    />
                    <AllocationLine
                      label="Assigned"
                      value={formatLedgerMoney(
                        exactAllocation.assignedMinor,
                        draft.currency,
                        scale ?? 2,
                      )}
                    />
                    <AllocationLine
                      label="Remaining"
                      value={
                        exactAllocation.remainingMinor === null
                          ? "—"
                          : formatLedgerMoney(
                              exactAllocation.remainingMinor,
                              draft.currency,
                              scale ?? 2,
                            )
                      }
                      warning={
                        exactAllocation.remainingMinor !== null &&
                        exactAllocation.remainingMinor !== 0
                      }
                    />
                    {!exactAllocation.valid ? (
                      <Text style={styles.allocationHint}>
                        {minor === null
                          ? "Enter an Expense amount before completing Exact amounts."
                          : exactAllocation.remainingMinor !== null &&
                              exactAllocation.remainingMinor < 0
                            ? "Assigned amounts exceed the Expense total."
                            : "Assign the full Expense total across selected participants."}
                      </Text>
                    ) : null}
                  </View>
                  {minor !== null
                    ? sharingMembers.map((member) => (
                        <View
                          key={member.id}
                          style={[
                            styles.customRow,
                            largeText && styles.customRowLargeText,
                          ]}
                        >
                          <Text style={styles.rowLabel}>
                            {member.id === context.actorId ? "You" : member.displayName}
                          </Text>
                          <TextInput
                            accessibilityLabel={`${member.id === context.actorId ? "You" : member.displayName} amount`}
                            keyboardType={scale === 0 ? "number-pad" : "decimal-pad"}
                            onChangeText={(value) =>
                              setSharingDraft({
                                ...sharingEdit,
                                exact: {
                                  ...sharingEdit.exact,
                                  [member.id]: currencyAmountInput(
                                    sharingEdit.exact[member.id] ?? "",
                                    value,
                                    scale ?? 2,
                                  ),
                                },
                              })
                            }
                            placeholder={draft.currency}
                            style={[
                              styles.customInput,
                              largeText && styles.customInputLargeText,
                            ]}
                            value={sharingEdit.exact[member.id] ?? ""}
                          />
                        </View>
                      ))
                    : null}
                </>
              ) : null}
            </>
          ) : null}
          {shouldShowGroupSettlement(sharingEdit.participantIds, sharingEdit.payerId) ? (
            <>
              <Text style={styles.sharingHeading}>Group settlement</Text>
              <View style={styles.chipList}>
                {(["INCLUDED", "EXCLUDED"] as const).map((value) => (
                  <ChoiceChip
                    key={value}
                    label={value === "INCLUDED" ? "Include" : "Exclude"}
                    selected={sharingEdit.settlementParticipation === value}
                    onPress={() =>
                      setSharingDraft({ ...sharingEdit, settlementParticipation: value })
                    }
                  />
                ))}
              </View>
              <Text style={styles.hint}>
                {sharingEdit.settlementParticipation === "INCLUDED"
                  ? "Included in this trip’s calculation of who owes whom."
                  : "Saved in Expenses, but excluded from this trip’s calculation of who owes whom."}
              </Text>
            </>
          ) : null}
        </ScrollView>
      </Modal>

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
              currencyChosen.current = true;
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
        animationType="none"
        onRequestClose={() => dismissDatePicker()}
        onShow={() => {
          dateBackdropOpacity.setValue(0);
          dateSheetOffset.setValue(windowHeight);
          Animated.parallel([
            Animated.timing(dateBackdropOpacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(dateSheetOffset, {
              toValue: 0,
              duration: 240,
              useNativeDriver: true,
            }),
          ]).start();
        }}
        transparent
        visible={datePicker}
      >
        <View style={styles.dateOverlay}>
          <Animated.View style={[styles.dateBackdrop, { opacity: dateBackdropOpacity }]}>
            <Pressable
              accessibilityLabel="Dismiss expense date picker"
              accessibilityRole="button"
              onPress={() => dismissDatePicker()}
              style={styles.flex}
            />
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: dateSheetOffset }] }}>
            <SafeAreaView edges={["bottom"]} style={styles.datePanel}>
              <LedgerSheetHeader
                leftLabel="Cancel"
                onLeft={() => dismissDatePicker()}
                onRight={() => dismissDatePicker(true)}
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
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

async function loadEntry(
  expenseId?: string,
  journeyId?: string,
  receiptId?: string,
  correction = false,
) {
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
  const access = await reporting.getActorContext(id);
  if (!canEditLedgerExpense(access?.role, false))
    throw new Error("Expense write access is required.");
  if (
    existing &&
    !correction &&
    (await (
      await getDefaultLedgerSettlementRepository()
    ).isExpenseFinalized(id, existing.id))
  )
    throw new Error("This Expense belongs to a completed settlement and is read-only.");
  const receipts = existing
    ? (await (await getDefaultLedgerReceiptRepository()).listReceipts(id)).filter(
        (item) =>
          item.expenseId === existing.id ||
          (existing.serverId && item.expenseId === existing.serverId),
      )
    : [];
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
    receipts,
    draft,
    currencyChosen: Boolean(existing || suggestion?.currency),
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
  stacked = false,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  stacked?: boolean;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  return (
    <Pressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, (largeText || stacked) && styles.rowLargeText]}
    >
      <Text style={[styles.rowLabel, stacked && styles.rowLabelStacked]}>{label}</Text>
      <Text
        numberOfLines={2}
        style={[styles.rowValue, (largeText || stacked) && styles.rowValueLargeText]}
      >
        {value}
      </Text>
    </Pressable>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choiceChip, selected && styles.choiceChipSelected]}
    >
      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AllocationLine({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <View style={styles.allocationLine}>
      <Text style={styles.allocationLabel}>{label}</Text>
      <Text style={[styles.allocationValue, warning && styles.allocationWarning]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  deleteExpense: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { gap: 10, padding: 16, paddingBottom: 48 },
  amountInput: {
    color: "#0F172A",
    fontSize: 48,
    fontWeight: "800",
    minHeight: 68,
  },
  amountInvalid: { borderBottomColor: "#B91C1C", borderBottomWidth: 2 },
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
  disabledScanAction: { opacity: 0.4 },
  scanActionText: { color: "#0F766E", fontSize: 15, fontWeight: "600" },
  attachmentText: { color: "#475569", fontSize: 15 },
  compactPair: { flexDirection: "row", gap: 10 },
  compactHalf: { flex: 1, minWidth: 0 },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sharingTitleRow: { alignItems: "center", flexDirection: "row" },
  infoAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  sharingSummaryAction: { minHeight: 44, justifyContent: "center" },
  summaryValue: { color: "#475569", fontSize: 15, marginTop: 3 },
  optionalSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 30,
  },
  optionalLabel: { color: "#64748B", fontSize: 15 },
  addAttachment: { justifyContent: "center", minHeight: 44 },
  addNote: { justifyContent: "center", minHeight: 44 },
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
  rowLabelStacked: { flex: 0, fontSize: 14 },
  rowValue: { color: "#475569", flexShrink: 1, fontSize: 16, textAlign: "right" },
  rowValueLargeText: { textAlign: "left" },
  hint: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  suggestion: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  error: { color: "#B91C1C", fontSize: 15, lineHeight: 21 },
  scanSourceTitle: { color: "#0F172A", fontSize: 20, fontWeight: "700" },
  scanSourceOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.25)",
  },
  scanSourcePanel: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "90%",
  },
  scanSourceContent: { padding: 20, gap: 12 },
  scanSourceOption: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 14,
    gap: 4,
    minHeight: 44,
  },
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
  headerAction: { ...navigationTextActionStyle, padding: 8 },
  headerActionButton: { justifyContent: "center", minHeight: 44 },
  disabledText: { opacity: 0.4 },
  sheetContent: { gap: 10, padding: 16, paddingBottom: 48 },
  sharingHeading: { color: "#475569", fontSize: 15, fontWeight: "700", marginTop: 12 },
  chipList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: {
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  choiceChipSelected: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  choiceChipText: { color: "#0F172A", fontSize: 15, fontWeight: "600" },
  choiceChipTextSelected: { color: "#FFFFFF" },
  allocationSummary: { backgroundColor: "#F8FAFC", borderRadius: 8, gap: 6, padding: 12 },
  allocationLine: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  allocationLabel: { color: "#475569", fontSize: 14 },
  allocationValue: { color: "#0F172A", fontSize: 14, fontWeight: "700" },
  allocationWarning: { color: "#B91C1C" },
  allocationHint: { color: "#B91C1C", fontSize: 13 },
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
