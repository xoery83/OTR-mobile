import { expect, it } from "vitest";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import type { OcrDocument } from "@/native/receiptOcr";
import {
  addReceiptScanDocument,
  beginReceiptScanOcr,
  completeReceiptScanOcr,
  createReceiptScanSession,
  cancelReceiptScanSession,
  removeReceiptScanDocument,
} from "./receiptScanSession";
import {
  confirmReceiptReview,
  createReceiptReviewState,
  editReceiptReviewField,
  refreshReceiptReviewState,
  selectReceiptReviewAmount,
  resetReceiptReviewField,
  selectReceiptReviewTitle,
  prepareReceiptReviewConfirmation,
  seedReceiptReviewFromExpense,
} from "./receiptReview";

const draft: TemporaryReceiptDraft = {
  id: "receipt1",
  ownerUserId: "owner",
  journeyId: "journey",
  localUri: "file:///receipt1.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 10,
  sha256: "synthetic",
};
const document = (...lines: string[]): OcrDocument => ({
  engine: "apple-vision",
  engineRevision: 3,
  imageWidth: 1200,
  imageHeight: 1800,
  durationMs: 8,
  supportedLanguages: ["en-US"],
  observations: lines.map((text, index) => ({
    text,
    confidence: 0.9,
    boundingBox: { x: 0.05, y: 0.05 + index * 0.1, width: 0.7, height: 0.03 },
  })),
});
function pending() {
  return addReceiptScanDocument(createReceiptScanSession("session", ["ordinary"]), draft);
}
function scanned(...lines: string[]) {
  const started = beginReceiptScanOcr(pending(), "d_receipt1");
  return completeReceiptScanOcr(
    started,
    "d_receipt1",
    started.documents[0].revision,
    document(...lines),
    { journeyCurrency: "AUD" },
  );
}
function addScannedPart(
  session: ReturnType<typeof pending>,
  id: string,
  ...lines: string[]
) {
  const added = addReceiptScanDocument(session, {
    ...draft,
    id,
    localUri: `file:///${id}.jpg`,
    sha256: id,
  });
  const started = beginReceiptScanOcr(added, `d_${id}`);
  return completeReceiptScanOcr(
    started,
    `d_${id}`,
    started.documents.at(-1)!.revision,
    document(...lines),
    { journeyCurrency: "AUD" },
  );
}

it("populates only structurally strong amount evidence and a useful merchant", () => {
  const review = createReceiptReviewState(
    scanned("Cafe Maple", "TOTAL NZ$86.40"),
    "AUD",
    "USD",
  );
  expect(review.title).toEqual({ value: "Cafe Maple", owner: "SYSTEM_SUGGESTED" });
  expect(review.amount.value).toBe("86.40");
  expect(review.suggestions.amount).toBe("STRONG_SUGGESTION");
  expect(review.currency.value).toBe("NZD");
  expect(review.suggestions.currencySource).toBe("receipt");
});

it("keeps ambiguous yen as selectable JPY/CNY alternatives", () => {
  const review = createReceiptReviewState(scanned("合計 ¥1,002"), "NZD", "USD");
  expect(review.currency.value).toBe("NZD");
  expect(review.suggestions.currency).toBe("CANDIDATES_AVAILABLE");
  expect(review.suggestions.currencyAlternatives).toEqual(["JPY", "CNY"]);
});

it("shows an explicit receipt currency even when a manual amount preserves the form currency", () => {
  const review = seedReceiptReviewFromExpense(
    createReceiptReviewState(scanned("合計 1,002円"), "NZD", "USD"),
    { title: "", amount: "10.00", currency: "NZD" },
  );
  expect(review.currency).toEqual({ value: "NZD", owner: "USER_EDITED" });
  expect(review.suggestions.currencyAlternatives).toEqual(["JPY"]);
});

it("offers language-based currency choices without selecting one", () => {
  const japanese = createReceiptReviewState(
    scanned("かなサンプル店", "合計 1002"),
    "NZD",
    "USD",
  );
  expect(japanese.currency.value).toBe("NZD");
  expect(japanese.suggestions.languageCurrencyAlternatives).toEqual(["JPY"]);
  const hanOnly = createReceiptReviewState(
    scanned("示例连锁商店", "合计 1002"),
    "NZD",
    "USD",
  );
  expect(hanOnly.currency.value).toBe("NZD");
  expect(hanOnly.suggestions.languageCurrencyAlternatives).toEqual([
    "JPY",
    "CNY",
    "TWD",
    "HKD",
  ]);
});

it("leaves competing or weak amounts blank and exposes selectable alternatives", () => {
  const conflicting = scanned("Cafe Maple", "TOTAL 75.00", "TOTAL 86.40");
  let review = createReceiptReviewState(conflicting, "NZD", "USD");
  expect(review.amount.value).toBe("");
  expect(review.suggestions.amount).toBe("CANDIDATES_AVAILABLE");
  expect(review.suggestions.amounts.map((item) => item.decimal)).toEqual([
    "75.00",
    "86.40",
  ]);
  review = selectReceiptReviewAmount(review, review.suggestions.amounts[1]);
  expect(review.amount).toEqual({ value: "86.40", owner: "USER_EDITED" });
  const weak = createReceiptReviewState(scanned("86.40"), "NZD", "USD");
  expect(weak.amount.value).toBe("");
});

it("does not confirm an explicitly selected amount under a different currency", () => {
  const session = scanned("TOTAL NZ$86.40");
  let review = createReceiptReviewState(session, "AUD", "USD");
  review = editReceiptReviewField(review, "title", "Manual title");
  review = selectReceiptReviewAmount(review, review.suggestions.amounts[0]);
  review = editReceiptReviewField(review, "currency", "AUD");
  expect(() => confirmReceiptReview(review, session)).toThrow(/NZD/);
  review = editReceiptReviewField(review, "currency", "NZD");
  expect(confirmReceiptReview(review, session).currency).toBe("NZD");
});

it("does not prefill an amount when receipt currencies conflict", () => {
  const session = scanned("TOTAL NZ$86.40", "CURRENCY USD");
  const review = createReceiptReviewState(session, "NZD", "USD");
  expect(session.combined?.status.currency).toBe("ambiguous");
  expect(review.amount.value).toBe("");
  expect(review.suggestions.amounts.length).toBeGreaterThan(0);
});

it("uses Journey currency only for absent or ambiguous receipt evidence", () => {
  expect(
    createReceiptReviewState(scanned("TOTAL 86.40"), "AUD", "USD").currency.value,
  ).toBe("AUD");
  const ambiguous = createReceiptReviewState(scanned("TOTAL $86.40"), "AUD", "USD");
  expect(ambiguous.currency.value).toBe("AUD");
  expect(ambiguous.suggestions.currencySource).toBe("journey");
  const explicit = createReceiptReviewState(scanned("TOTAL 86.40 USD"), "AUD", "NZD");
  expect(explicit.currency.value).toBe("USD");
  const region = createReceiptReviewState(scanned("TOTAL NZ$86.40"), "AUD", "USD");
  expect(region.currency.value).toBe("NZD");
});

it("keeps ambiguous merchant editable and protects all manual choices", () => {
  const session = scanned("Cafe Maple", "Mountain Books", "TOTAL NZ$86.40");
  let review = createReceiptReviewState(session, "AUD", "USD");
  expect(review.suggestions.titles).toEqual(
    expect.arrayContaining(["Cafe Maple", "Mountain Books"]),
  );
  review = editReceiptReviewField(review, "title", "My chosen title");
  review = editReceiptReviewField(review, "amount", "95.00");
  review = editReceiptReviewField(review, "currency", "JPY");
  const refreshed = refreshReceiptReviewState(review, session, "AUD", "USD");
  expect(refreshed.title).toEqual({ value: "My chosen title", owner: "USER_EDITED" });
  expect(refreshed.amount).toEqual({ value: "95.00", owner: "USER_EDITED" });
  expect(refreshed.currency).toEqual({ value: "JPY", owner: "USER_EDITED" });
});

it("allows manual review after no text or OCR failure and validates exact money", () => {
  const started = beginReceiptScanOcr(pending(), "d_receipt1");
  for (const result of [document(), "VISION_FAILURE" as const]) {
    const session = completeReceiptScanOcr(
      started,
      "d_receipt1",
      started.documents[0].revision,
      result,
    );
    let review = createReceiptReviewState(session, "JPY", "USD");
    review = editReceiptReviewField(review, "title", "Manual purchase");
    review = editReceiptReviewField(review, "amount", "10.50");
    expect(() => confirmReceiptReview(review, session)).toThrow();
    review = editReceiptReviewField(review, "currency", "NZD");
    expect(confirmReceiptReview(review, session).amount).toBe("10.50");
  }
});

it("returns only confirmed review/session data; cancellation clears session without changing form", () => {
  const session = scanned("Cafe Maple", "TOTAL NZ$86.40");
  const review = createReceiptReviewState(session, "AUD", "USD");
  const expenseBefore = {
    title: "Before",
    amount: "12.00",
    currency: "AUD",
    date: "2026-09-28",
  };
  expect(confirmReceiptReview(review, session)).toEqual({
    title: "Cafe Maple",
    amount: "86.40",
    currency: "NZD",
    sessionId: "session",
    documentIds: ["d_receipt1"],
    draftIds: ["receipt1"],
  });
  const cancelled = cancelReceiptScanSession(session);
  expect(cancelled.session.combined).toBeNull();
  expect(cancelled.draftsToDiscard).toEqual([draft]);
  expect(expenseBefore).toEqual({
    title: "Before",
    amount: "12.00",
    currency: "AUD",
    date: "2026-09-28",
  });
  expect("date" in review).toBe(false);
});

it("reparses merchant and total across parts while preserving user-owned fields", () => {
  let session = addScannedPart(
    createReceiptScanSession("multi"),
    "receipt1",
    "Cafe Maple",
    "Subtotal 80.00",
  );
  let review = createReceiptReviewState(session, "AUD", "USD");
  expect(review.title.value).toBe("Cafe Maple");
  expect(review.amount.value).toBe("");
  review = editReceiptReviewField(review, "title", "Cafe maple (edited)");
  session = addScannedPart(session, "receipt2", "TOTAL NZ$86.40");
  expect(session.sessionId).toBe("multi");
  review = refreshReceiptReviewState(review, session, "AUD", "USD");
  expect(session.documents).toHaveLength(2);
  expect(review.title.value).toBe("Cafe maple (edited)");
  expect(review.amount.value).toBe("86.40");
  expect(review.currency.value).toBe("NZD");
  review = editReceiptReviewField(review, "amount", "90.00");
  review = editReceiptReviewField(review, "currency", "AUD");
  session = addScannedPart(session, "receipt3", "TOTAL NZ$75.00");
  review = refreshReceiptReviewState(review, session, "AUD", "USD");
  expect(review.amount).toEqual({ value: "90.00", owner: "USER_EDITED" });
  expect(review.currency).toEqual({ value: "AUD", owner: "USER_EDITED" });
  expect(review.suggestions.amounts.map((item) => item.decimal)).toEqual(
    expect.arrayContaining(["86.40", "75.00"]),
  );
  expect(() => addReceiptScanDocument(session, { ...draft, id: "receipt4" })).toThrow();
  const removed = removeReceiptScanDocument(session, "d_receipt2", {
    journeyCurrency: "AUD",
  });
  expect(removed.removedDraft?.id).toBe("receipt2");
  review = refreshReceiptReviewState(review, removed.session, "AUD", "USD");
  expect(review.amount.value).toBe("90.00");
  expect(review.suggestions.amounts.some((item) => item.decimal === "86.40")).toBe(false);
  expect(
    cancelReceiptScanSession(removed.session).draftsToDiscard.map((item) => item.id),
  ).toEqual(["receipt1", "receipt3"]);
});

it("clears an unsafe system amount on conflict and resets explicit choices to latest evidence", () => {
  let session = addScannedPart(
    createReceiptScanSession("multi"),
    "receipt1",
    "Cafe Maple",
    "TOTAL NZ$86.40",
  );
  let review = createReceiptReviewState(session, "AUD", "USD");
  session = addScannedPart(session, "receipt2", "TOTAL NZ$75.00");
  review = refreshReceiptReviewState(review, session, "AUD", "USD");
  expect(review.amount.value).toBe("");
  review = selectReceiptReviewTitle(review, review.suggestions.titles[0]);
  review = selectReceiptReviewAmount(review, review.suggestions.amounts[1]);
  const chosen = review.amount.value;
  session = addScannedPart(session, "receipt3", "EFTPOS NZ$75.00");
  review = refreshReceiptReviewState(review, session, "AUD", "USD");
  expect(review.amount).toEqual({ value: chosen, owner: "USER_EDITED" });
  expect(review.title.owner).toBe("USER_EDITED");
  expect(review.selectedTitleCandidate).toBe("Cafe Maple");
  review = resetReceiptReviewField(review, "amount", session, "AUD", "USD");
  expect(review.amount.owner).toBe("SYSTEM_SUGGESTED");
  expect(review.amount.value).toBe("");
  expect(review.selectedAmountCandidate).toBeNull();
});

it("confirms reviewed fields and two scanned drafts as one prepared form transition", () => {
  const original = {
    title: "Earlier manual title",
    amount: "12.00",
    currency: "AUD",
    date: "2026-09-28",
    notes: "Keep this note",
  };
  let session = addScannedPart(
    createReceiptScanSession("confirm", ["ordinary"]),
    "receipt1",
    "Cafe Maple",
  );
  session = addScannedPart(session, "receipt2", "TOTAL NZ$86.40");
  let review = createReceiptReviewState(session, "AUD", "USD");
  review = seedReceiptReviewFromExpense(review, original);
  expect(review.title).toEqual({ value: original.title, owner: "USER_EDITED" });
  expect(review.amount).toEqual({ value: original.amount, owner: "USER_EDITED" });
  review = editReceiptReviewField(review, "title", "Confirmed title");
  review = editReceiptReviewField(review, "amount", "91.25");
  review = editReceiptReviewField(review, "currency", "NZD");
  const submitted = confirmReceiptReview(review, session);
  const prepared = prepareReceiptReviewConfirmation(
    review,
    session,
    submitted,
    session.revision,
    original,
    [{ ...draft, id: "ordinary" }],
    null,
  );
  expect(prepared.expense).toEqual({
    ...original,
    title: "Confirmed title",
    amount: "91.25",
    currency: "NZD",
  });
  expect(original).toEqual({
    title: "Earlier manual title",
    amount: "12.00",
    currency: "AUD",
    date: "2026-09-28",
    notes: "Keep this note",
  });
  expect(prepared.drafts.map((item) => item.id)).toEqual([
    "ordinary",
    "receipt1",
    "receipt2",
  ]);
  expect(prepared.scannedDrafts).toEqual(session.documents.map((item) => item.draft));
});

it("supports three scans, blocks stale or over-capacity confirmation without mutation", () => {
  let session = addScannedPart(
    createReceiptScanSession("three"),
    "receipt1",
    "Cafe Maple",
  );
  session = addScannedPart(session, "receipt2", "TOTAL NZ$86.40");
  session = addScannedPart(session, "receipt3", "EFTPOS NZ$86.40");
  const review = createReceiptReviewState(session, "AUD", "USD");
  const submitted = confirmReceiptReview(review, session);
  const expense = {
    title: "Before",
    amount: "10.00",
    currency: "AUD",
    date: "2026-09-28",
  };
  const prepare = (revision: number, ordinary: TemporaryReceiptDraft[] = []) =>
    prepareReceiptReviewConfirmation(
      review,
      session,
      submitted,
      revision,
      expense,
      ordinary,
      null,
    );
  expect(prepare(session.revision).drafts).toHaveLength(3);
  expect(() => prepare(session.revision - 1)).toThrow(/changed/);
  expect(() => prepare(session.revision, [draft])).toThrow(/Maximum 3/);
  expect(() =>
    prepareReceiptReviewConfirmation(
      review,
      session,
      { ...submitted, draftIds: ["wrong"] },
      session.revision,
      expense,
      [],
      null,
    ),
  ).toThrow(/changed/);
  expect(expense).toEqual({
    title: "Before",
    amount: "10.00",
    currency: "AUD",
    date: "2026-09-28",
  });
});

it("keeps confirmed drafts available for a later separate scan without duplicate IDs", () => {
  const first = scanned("Cafe Maple", "TOTAL NZ$86.40");
  const review = createReceiptReviewState(first, "AUD", "USD");
  const expense = { title: "", amount: "", currency: "AUD", date: "2026-09-28" };
  const confirmed = prepareReceiptReviewConfirmation(
    review,
    first,
    confirmReceiptReview(review, first),
    first.revision,
    expense,
    [],
    null,
  );
  const later = addScannedPart(
    createReceiptScanSession(
      "later",
      confirmed.drafts.map((item) => item.id),
    ),
    "receipt2",
    "TOTAL NZ$90.00",
  );
  const laterReview = editReceiptReviewField(
    createReceiptReviewState(later, "AUD", "USD"),
    "title",
    "Later scan",
  );
  expect(
    prepareReceiptReviewConfirmation(
      laterReview,
      later,
      confirmReceiptReview(laterReview, later),
      later.revision,
      confirmed.expense,
      confirmed.drafts,
      null,
    ).drafts.map((item) => item.id),
  ).toEqual(["receipt1", "receipt2"]);
});
