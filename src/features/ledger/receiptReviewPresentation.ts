import { currencyScale } from "@/domain/ledger/currency";
import { parseCurrencyAmount } from "./expenseDraft";
import type { ReceiptReviewState } from "./receiptReview";
import type { ReceiptScanSession } from "./receiptScanSession";

// Native chip measurements include padding and a stable checkmark slot.
export function candidateRows(
  widths: readonly number[],
  width: number,
  alwaysOverflow = false,
) {
  const rows: number[][] = [[], []];
  let row = 0;
  let used = 0;
  for (let i = 0; i < widths.length; i++) {
    const next = Math.min(widths[i], width);
    if (used && used + 6 + next > width) {
      row++;
      used = 0;
    }
    if (row > 1) break;
    rows[row].push(i);
    used += (used ? 6 : 0) + next;
  }
  const overflow = alwaysOverflow || rows.flat().length < widths.length;
  let overflowRow = Math.max(0, rows[1].length ? 1 : 0);
  if (overflow) {
    const occupied = (items: number[]) =>
      items.reduce((sum, index) => sum + Math.min(widths[index], width), 0) +
      Math.max(0, items.length - 1) * 6;
    if (overflowRow === 0 && occupied(rows[0]) + (rows[0].length ? 6 : 0) + 44 > width)
      overflowRow = 1;
    const last = rows[overflowRow];
    while (last.length && occupied(last) + 6 + 44 > width) last.pop();
  }
  return {
    rows: rows.slice(0, overflow ? overflowRow + 1 : rows[1].length ? 2 : 1),
    overflow,
    overflowRow,
  };
}

export function receiptCurrencyTags(review: ReceiptReviewState, journeyCurrency: string) {
  return [
    ...new Set([
      ...review.suggestions.currencyAlternatives,
      ...review.suggestions.languageCurrencyAlternatives,
      journeyCurrency,
    ]),
  ].filter((code) => currencyScale(code) !== null);
}

export function amountTagSelected(
  review: ReceiptReviewState,
  candidate: { decimal: string; currency: string | null },
) {
  if (candidate.currency && candidate.currency !== review.currency.value) return false;
  const scale = currencyScale(review.currency.value);
  if (scale === null) return false;
  const current = parseCurrencyAmount(review.amount.value, scale);
  return current !== null && current === parseCurrencyAmount(candidate.decimal, scale);
}

export function receiptCards(session: ReceiptScanSession) {
  return session.documents.map((part) => ({
    ...part,
    number: (part.draft.scanOrder ?? session.usedDraftIds.indexOf(part.draft.id)) + 1,
  }));
}

export function activeReceiptId(session: ReceiptScanSession, selected: string | null) {
  return (
    session.documents.find((part) => part.documentId === selected)?.documentId ??
    session.documents.at(-1)?.documentId ??
    null
  );
}

export function reviewPaneWidths(width: number, landscape: boolean, expanded: boolean) {
  const form = expanded
    ? Math.round(width * (landscape ? 0.46 : 0.42))
    : Math.max(0, width - 36);
  return { form, receipt: width - form };
}

export function isReceiptCollapseSwipe(dx: number, dy: number) {
  return dx > 60 && dx > Math.abs(dy) * 1.5;
}
