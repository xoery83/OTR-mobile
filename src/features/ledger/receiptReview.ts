import { currencyScale } from "@/domain/ledger/currency";
import { assertExpenseAttachmentDrafts } from "@/domain/ledger/attachments";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import type { AmountCandidateB2 } from "@/domain/receipt/receiptParserB2";
import type { ReceiptScanSession } from "./receiptScanSession";
import { formatMinorInput, parseCurrencyAmount } from "./expenseDraft";

export type ReviewOwner = "SYSTEM_SUGGESTED" | "USER_EDITED";
export type SuggestionClass =
  "STRONG_SUGGESTION" | "CANDIDATES_AVAILABLE" | "NO_SUGGESTION";
type ReviewField = { value: string; owner: ReviewOwner };
export type ReceiptReviewState = {
  title: ReviewField;
  amount: ReviewField;
  selectedAmountCurrency: string | null;
  selectedTitleCandidate: string | null;
  selectedAmountCandidate: { decimal: string; currency: string | null } | null;
  currency: ReviewField;
  suggestions: {
    title: SuggestionClass;
    amount: SuggestionClass;
    currency: SuggestionClass;
    titles: string[];
    amounts: { decimal: string; currency: string | null }[];
    currencyAlternatives: string[];
    languageCurrencyAlternatives: string[];
    currencySource: "receipt" | "journey" | "default";
  };
};

export type ReceiptReviewResult = {
  title: string;
  amount: string;
  currency: string;
  sessionId: string;
  documentIds: string[];
  draftIds: string[];
};

const finalReasons = new Set([
  "EXPLICIT_GRAND_TOTAL",
  "EXPLICIT_TOTAL",
  "AMOUNT_DUE",
  "AMOUNT_PAID",
]);

function strongAmount(
  candidate: AmountCandidateB2 | undefined,
  session: ReceiptScanSession,
) {
  if (
    !candidate ||
    session.combined?.status.amount !== "clear" ||
    session.combined.status.currency !== "clear"
  )
    return false;
  if (
    !candidate.currency ||
    candidate.minorUnits === null ||
    candidate.ambiguousCurrency ||
    candidate.ambiguousSeparator ||
    !candidate.reasons.includes("SAME_LINE_VALUE") ||
    !candidate.reasons.some((reason) => finalReasons.has(reason))
  )
    return false;
  return !session.combined.amountCandidates
    .slice(1)
    .some(
      (other) =>
        other.score >= 40 &&
        other.reasons.some((reason) => finalReasons.has(reason)) &&
        (other.decimal !== candidate.decimal || other.currency !== candidate.currency),
    );
}

function suggestions(
  session: ReceiptScanSession,
  journeyCurrency: string,
  defaultCurrency: string,
) {
  const parse = session.combined;
  const titles = [...new Set(parse?.merchantCandidates.map((item) => item.name) ?? [])];
  const amounts = [
    ...new Map(
      (parse?.amountCandidates ?? []).map((item) => [
        `${item.minorUnits ?? item.decimal}:${item.currency ?? "?"}`,
        { decimal: item.decimal, currency: item.currency },
      ]),
    ).values(),
  ];
  const receiptCodes = [
    ...new Set(
      (parse?.currencyCandidates ?? [])
        .filter((item) => item.source === "receipt" && item.code)
        .map((item) => item.code!),
    ),
  ];
  const currencyAlternatives = [
    ...new Set(
      (parse?.currencyCandidates ?? [])
        .filter((item) => item.source === "receipt")
        .flatMap((item) => (item.code ? [item.code] : item.possibleCodes))
        .filter((code) => currencyScale(code) !== null),
    ),
  ];
  const receiptCurrency =
    receiptCodes.length === 1
      ? parse?.currencyCandidates.find(
          (item) =>
            item.source === "receipt" &&
            item.code === receiptCodes[0] &&
            ["code", "region-symbol", "distinct-symbol"].includes(item.strength),
        )?.code
      : null;
  const ocrText = session.documents
    .flatMap((document) => document.ocrDocument?.observations ?? [])
    .map((observation) => observation.text)
    .join(" ");
  const languageCurrencyAlternatives = receiptCurrency
    ? []
    : /[\u3040-\u30ff]/u.test(ocrText)
      ? ["JPY"]
      : /\p{Script=Han}/u.test(ocrText)
        ? ["JPY", "CNY", "TWD", "HKD"]
        : [];
  const currency =
    receiptCurrency ??
    (currencyScale(journeyCurrency) !== null ? journeyCurrency : defaultCurrency);
  const currencySource = receiptCurrency
    ? ("receipt" as const)
    : currency === journeyCurrency
      ? ("journey" as const)
      : ("default" as const);
  const amountCandidate = parse?.amountCandidates[0];
  const amountStrong =
    strongAmount(amountCandidate, session) && amountCandidate?.currency === currency;
  const titleStrong = Boolean(
    parse?.status.merchant === "clear" && parse.merchantCandidates[0]?.score >= 60,
  );
  return {
    values: {
      title: titleStrong ? titles[0] : "",
      amount: amountStrong ? amountCandidate!.decimal : "",
      currency,
    },
    classes: {
      title: titleStrong
        ? ("STRONG_SUGGESTION" as const)
        : titles.length
          ? ("CANDIDATES_AVAILABLE" as const)
          : ("NO_SUGGESTION" as const),
      amount: amountStrong
        ? ("STRONG_SUGGESTION" as const)
        : amounts.length
          ? ("CANDIDATES_AVAILABLE" as const)
          : ("NO_SUGGESTION" as const),
      currency: receiptCurrency
        ? ("STRONG_SUGGESTION" as const)
        : currencyAlternatives.length || languageCurrencyAlternatives.length
          ? ("CANDIDATES_AVAILABLE" as const)
          : ("NO_SUGGESTION" as const),
      titles,
      amounts,
      currencyAlternatives,
      languageCurrencyAlternatives,
      currencySource,
    },
  };
}

export function createReceiptReviewState(
  session: ReceiptScanSession,
  journeyCurrency: string,
  defaultCurrency: string,
): ReceiptReviewState {
  const suggestion = suggestions(session, journeyCurrency, defaultCurrency);
  return {
    title: { value: suggestion.values.title, owner: "SYSTEM_SUGGESTED" },
    amount: { value: suggestion.values.amount, owner: "SYSTEM_SUGGESTED" },
    selectedAmountCurrency: suggestion.values.amount
      ? (session.combined?.amountCandidates[0]?.currency ?? null)
      : null,
    selectedTitleCandidate: null,
    selectedAmountCandidate: null,
    currency: { value: suggestion.values.currency, owner: "SYSTEM_SUGGESTED" },
    suggestions: suggestion.classes,
  };
}

export function seedReceiptReviewFromExpense(
  review: ReceiptReviewState,
  expense: { title: string; amount: string; currency: string },
): ReceiptReviewState {
  if (!expense.title.trim() && !expense.amount.trim()) return review;
  return {
    ...review,
    title: expense.title.trim()
      ? { value: expense.title, owner: "USER_EDITED" }
      : review.title,
    amount: expense.amount.trim()
      ? { value: expense.amount, owner: "USER_EDITED" }
      : review.amount,
    selectedAmountCurrency: expense.amount.trim() ? null : review.selectedAmountCurrency,
    currency: { value: expense.currency, owner: "USER_EDITED" },
  };
}

export function refreshReceiptReviewState(
  review: ReceiptReviewState,
  session: ReceiptScanSession,
  journeyCurrency: string,
  defaultCurrency: string,
): ReceiptReviewState {
  const suggestion = suggestions(session, journeyCurrency, defaultCurrency);
  return {
    title:
      review.title.owner === "USER_EDITED"
        ? review.title
        : { ...review.title, value: suggestion.values.title },
    amount:
      review.amount.owner === "USER_EDITED"
        ? review.amount
        : { ...review.amount, value: suggestion.values.amount },
    selectedAmountCurrency:
      review.amount.owner === "USER_EDITED"
        ? review.selectedAmountCurrency
        : suggestion.values.amount
          ? (session.combined?.amountCandidates[0]?.currency ?? null)
          : null,
    selectedTitleCandidate: review.selectedTitleCandidate,
    selectedAmountCandidate: review.selectedAmountCandidate,
    currency:
      review.currency.owner === "USER_EDITED"
        ? review.currency
        : { ...review.currency, value: suggestion.values.currency },
    suggestions: suggestion.classes,
  };
}

export function editReceiptReviewField(
  review: ReceiptReviewState,
  field: "title" | "amount" | "currency",
  value: string,
): ReceiptReviewState {
  return {
    ...review,
    [field]: { value, owner: "USER_EDITED" },
    selectedAmountCurrency: field === "amount" ? null : review.selectedAmountCurrency,
    selectedTitleCandidate: field === "title" ? null : review.selectedTitleCandidate,
    selectedAmountCandidate: field === "amount" ? null : review.selectedAmountCandidate,
  };
}

export function selectReceiptReviewTitle(
  review: ReceiptReviewState,
  title: string,
): ReceiptReviewState {
  return {
    ...review,
    title: { value: title, owner: "USER_EDITED" },
    selectedTitleCandidate: title,
  };
}

export function resetReceiptReviewField(
  review: ReceiptReviewState,
  field: "title" | "amount" | "currency",
  session: ReceiptScanSession,
  journeyCurrency: string,
  defaultCurrency: string,
): ReceiptReviewState {
  return refreshReceiptReviewState(
    {
      ...review,
      [field]: { ...review[field], owner: "SYSTEM_SUGGESTED" },
      selectedTitleCandidate: field === "title" ? null : review.selectedTitleCandidate,
      selectedAmountCandidate: field === "amount" ? null : review.selectedAmountCandidate,
    },
    session,
    journeyCurrency,
    defaultCurrency,
  );
}

export function selectReceiptReviewAmount(
  review: ReceiptReviewState,
  candidate: { decimal: string; currency: string | null },
): ReceiptReviewState {
  return {
    ...review,
    amount: { value: candidate.decimal, owner: "USER_EDITED" },
    selectedAmountCurrency: candidate.currency,
    selectedAmountCandidate: candidate,
  };
}

export function receiptAmountCurrencyMismatch(review: ReceiptReviewState): string | null {
  if (
    !review.selectedAmountCurrency ||
    review.selectedAmountCurrency === review.currency.value
  )
    return null;
  return `Amount suggestion uses ${review.selectedAmountCurrency}; Currency is ${review.currency.value}. Choose ${review.selectedAmountCurrency}, or edit Amount to use ${review.currency.value}.`;
}

export function confirmReceiptReview(
  review: ReceiptReviewState,
  session: ReceiptScanSession,
): ReceiptReviewResult {
  const title = review.title.value.trim();
  if (!title) throw new Error("Enter a Title.");
  const currency = review.currency.value.toUpperCase();
  const scale = currencyScale(currency);
  if (scale === null) throw new Error("Choose a supported Currency.");
  const mismatch = receiptAmountCurrencyMismatch({
    ...review,
    currency: { ...review.currency, value: currency },
  });
  if (mismatch) throw new Error(mismatch);
  const minor = parseCurrencyAmount(review.amount.value, scale);
  if (minor === null)
    throw new Error("Enter a positive Amount with valid decimal places.");
  return {
    title,
    amount: formatMinorInput(minor, scale),
    currency,
    sessionId: session.sessionId,
    documentIds: session.documents.map((item) => item.documentId),
    draftIds: session.documents.map((item) => item.draft.id),
  };
}

export function prepareReceiptReviewConfirmation<
  T extends { title: string; amount: string; currency: string },
>(
  review: ReceiptReviewState,
  session: ReceiptScanSession,
  submitted: ReceiptReviewResult,
  submittedRevision: number,
  expense: T,
  existingDrafts: readonly TemporaryReceiptDraft[],
  receiptId: string | null,
) {
  if (session.status !== "active" || session.revision !== submittedRevision)
    throw new Error(
      "Receipt Review changed. Check the latest suggestions and confirm again.",
    );
  const current = confirmReceiptReview(review, session);
  if (
    current.title !== submitted.title ||
    current.amount !== submitted.amount ||
    current.currency !== submitted.currency ||
    current.sessionId !== submitted.sessionId ||
    current.documentIds.join("\u0000") !== submitted.documentIds.join("\u0000") ||
    current.draftIds.join("\u0000") !== submitted.draftIds.join("\u0000")
  )
    throw new Error("Receipt Review changed. Check the fields and confirm again.");
  const scannedDrafts = session.documents.map((item) => item.draft);
  assertExpenseAttachmentDrafts([
    ...existingDrafts.map((item) => item.id),
    ...(receiptId ? [receiptId] : []),
    ...scannedDrafts.map((item) => item.id),
  ]);
  return {
    expense: {
      ...expense,
      title: current.title,
      amount: current.amount,
      currency: current.currency,
    },
    drafts: [...existingDrafts, ...scannedDrafts],
    scannedDrafts,
  };
}
