import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  activeReceiptId,
  amountTagSelected,
  candidateRows,
  isReceiptCollapseSwipe,
  receiptCards,
  receiptCurrencyTags,
  reviewPaneWidths,
} from "./receiptReviewPresentation";
import {
  addReceiptScanDocument,
  beginReceiptScanOcr,
  completeReceiptScanOcr,
  createReceiptScanSession,
  removeReceiptScanDocument,
} from "./receiptScanSession";
import {
  createReceiptReviewState,
  editReceiptReviewField,
  refreshReceiptReviewState,
  selectReceiptReviewAmount,
  selectReceiptReviewTitle,
} from "./receiptReview";

const draft = (id: string, scanOrder: number) => ({
  id,
  scanOrder,
  ownerUserId: "owner",
  journeyId: "journey",
  localUri: `file:///${id}.jpg`,
  mimeType: "image/jpeg" as const,
  sizeBytes: 10,
  sha256: id,
});
const pending = () =>
  addReceiptScanDocument(createReceiptScanSession("session"), draft("one", 0));
const reviewState = () => createReceiptReviewState(pending(), "NZD", "USD");

it("packs actual widths into two rows and reserves the final 44pt overflow", () => {
  expect(candidateRows([70, 70, 70, 70, 70, 70], 240)).toEqual({
    rows: [
      [0, 1, 2],
      [3, 4, 5],
    ],
    overflow: false,
    overflowRow: 1,
  });
  expect(candidateRows([70, 70, 70, 70, 70, 70, 70], 240)).toEqual({
    rows: [
      [0, 1, 2],
      [3, 4],
    ],
    overflow: true,
    overflowRow: 1,
  });
  expect(candidateRows([196, 196, 196], 240)).toEqual({
    rows: [[0], []],
    overflow: true,
    overflowRow: 1,
  });
});

it("keeps Currency's full picker affordance even with zero or few candidates", () => {
  expect(candidateRows([], 240, true)).toEqual({
    rows: [[]],
    overflow: true,
    overflowRow: 0,
  });
  expect(candidateRows([70], 240, true)).toEqual({
    rows: [[0]],
    overflow: true,
    overflowRow: 0,
  });
  expect(candidateRows([196], 240, true)).toEqual({
    rows: [[0], []],
    overflow: true,
    overflowRow: 1,
  });
});

it("never overflows two rows across narrow/wide screens and larger chip measurements", () => {
  for (const width of [144, 240, 303, 340, 420, 600]) {
    for (const widths of [[], [44], [80, 95, 180, 44, 86, 210], Array(20).fill(150)]) {
      for (const always of [false, true]) {
        const result = candidateRows(widths, width, always);
        expect(result.rows.length).toBeLessThanOrEqual(2);
        for (const [row, indices] of result.rows.entries()) {
          const chips = indices.map((index) => Math.min(widths[index], width));
          if (result.overflow && row === result.overflowRow) chips.push(44);
          expect(
            chips.reduce((sum, value) => sum + value, 0) +
              Math.max(0, chips.length - 1) * 6,
          ).toBeLessThanOrEqual(width);
        }
        if (!result.overflow) expect(result.rows.flat().length).toBe(widths.length);
      }
    }
  }
});

it("matches Amount by exact existing money semantics, clears mismatches and keeps ownership", () => {
  let review = selectReceiptReviewAmount(reviewState(), {
    decimal: "95.85",
    currency: "NZD",
  });
  expect(amountTagSelected(review, { decimal: "95.850", currency: "NZD" })).toBe(true);
  expect(amountTagSelected(review, { decimal: "95.85", currency: "NZD" })).toBe(true);
  expect(amountTagSelected(review, { decimal: "95.85", currency: "JPY" })).toBe(false);
  review = editReceiptReviewField(review, "amount", "96");
  expect(amountTagSelected(review, { decimal: "95.85", currency: "NZD" })).toBe(false);
  expect(review.amount.owner).toBe("USER_EDITED");
  expect(amountTagSelected(review, { decimal: "96.00", currency: null })).toBe(true);
  review = editReceiptReviewField(review, "amount", "");
  expect(amountTagSelected(review, { decimal: "0", currency: null })).toBe(false);
});

it("supports zero-decimal currencies without float conversion", () => {
  let review = editReceiptReviewField(reviewState(), "currency", "JPY");
  review = editReceiptReviewField(review, "amount", "1002");
  expect(amountTagSelected(review, { decimal: "1002", currency: "JPY" })).toBe(true);
  expect(amountTagSelected(review, { decimal: "1002.01", currency: "JPY" })).toBe(false);
});

it("shows receipt/language/Journey Currency candidates without auto-selecting or exposing source distinctions", () => {
  const review = reviewState();
  review.suggestions.currencyAlternatives = ["JPY", "CNY", "BAD"];
  review.suggestions.languageCurrencyAlternatives = ["JPY", "CNY", "TWD", "HKD"];
  expect(receiptCurrencyTags(review, "NZD")).toEqual(["JPY", "CNY", "TWD", "HKD", "NZD"]);
  expect(review.currency.value).toBe("NZD");
});

it("keeps no-suggestion fields empty and manual entry valid", () => {
  const review = reviewState();
  expect(review.title.value).toBe("");
  expect(review.amount.value).toBe("");
  expect(review.suggestions.titles).toEqual([]);
  expect(review.suggestions.amounts).toEqual([]);
});

it("numbers 1–3 cards stably and opens/switches/falls back by document identity", () => {
  let session = pending();
  expect(receiptCards(session).map((part) => part.number)).toEqual([1]);
  session = addReceiptScanDocument(session, draft("two", 1));
  expect(receiptCards(session).map((part) => part.number)).toEqual([1, 2]);
  session = addReceiptScanDocument(session, draft("three", 2));
  expect(receiptCards(session).map((part) => part.number)).toEqual([1, 2, 3]);
  expect(activeReceiptId(session, null)).toBe("d_three");
  expect(activeReceiptId(session, "d_one")).toBe("d_one");
  session = removeReceiptScanDocument(session, "d_two").session;
  expect(receiptCards(session).map((part) => [part.documentId, part.number])).toEqual([
    ["d_one", 1],
    ["d_three", 3],
  ]);
  expect(activeReceiptId(session, "d_two")).toBe("d_three");
  session = removeReceiptScanDocument(session, "d_three").session;
  session = removeReceiptScanDocument(session, "d_one").session;
  expect(activeReceiptId(session, "d_one")).toBeNull();
});

it("retains successful evidence when another image fails, and preserves edits after removal", () => {
  let session = beginReceiptScanOcr(pending(), "d_one");
  session = completeReceiptScanOcr(session, "d_one", session.documents[0].revision, {
    engine: "apple-vision",
    engineRevision: 3,
    imageWidth: 1200,
    imageHeight: 1800,
    durationMs: 8,
    supportedLanguages: ["en-US"],
    observations: [
      {
        text: "TOTAL NZ$95.85",
        confidence: 0.9,
        boundingBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.05 },
      },
    ],
  });
  let review = selectReceiptReviewTitle(
    createReceiptReviewState(session, "NZD", "USD"),
    "My title",
  );
  review = selectReceiptReviewAmount(review, { decimal: "95.85", currency: "NZD" });
  review = editReceiptReviewField(review, "currency", "NZD");
  session = addReceiptScanDocument(session, draft("two", 1));
  session = beginReceiptScanOcr(session, "d_two");
  session = completeReceiptScanOcr(
    session,
    "d_two",
    session.documents[1].revision,
    "VISION_FAILURE",
  );
  expect(session.documents).toHaveLength(2);
  expect(
    session.combined?.amountCandidates.some((item) => item.decimal === "95.85"),
  ).toBe(true);
  session = removeReceiptScanDocument(session, "d_one").session;
  review = refreshReceiptReviewState(review, session, "AUD", "USD");
  expect(session.combined).toBeNull();
  expect(review.title).toEqual({ value: "My title", owner: "USER_EDITED" });
  expect(review.amount).toEqual({ value: "95.85", owner: "USER_EDITED" });
  expect(review.currency).toEqual({ value: "NZD", owner: "USER_EDITED" });
});

it("keeps readable left panes in portrait comparison and intentional landscape comparison", () => {
  for (const width of [320, 375, 393, 430]) {
    expect(reviewPaneWidths(width, false, false)).toEqual({
      form: width - 36,
      receipt: 36,
    });
    const panes = reviewPaneWidths(width, false, true);
    expect(panes.form / width).toBeGreaterThanOrEqual(0.35);
    expect(panes.form / width).toBeLessThanOrEqual(0.45);
    expect(panes.form + panes.receipt).toBe(width);
  }
  for (const width of [667, 852, 932, 1194]) {
    const panes = reviewPaneWidths(width, true, true);
    expect(panes.form / width).toBeCloseTo(0.46, 2);
    expect(panes.receipt / width).toBeCloseTo(0.54, 2);
  }
});

it("right swipe collapses; left swipe/vertical pan never switches or removes a receipt", () => {
  expect(isReceiptCollapseSwipe(90, 10)).toBe(true);
  expect(isReceiptCollapseSwipe(-90, 10)).toBe(false);
  expect(isReceiptCollapseSwipe(70, 90)).toBe(false);
  expect(isReceiptCollapseSwipe(10, -150)).toBe(false);
});

it("wires only three fields, unified candidate groups, capacity and accepted C4 callbacks", () => {
  const sheet = readFileSync(
    new URL("./ReceiptReviewSheet.tsx", import.meta.url),
    "utf8",
  );
  const entry = readFileSync(
    new URL("./LedgerExpenseEntryScreen.tsx", import.meta.url),
    "utf8",
  );
  for (const label of ["Title", "Amount", "Currency"])
    expect(sheet).toContain(`Receipt Review ${label}`);
  expect(sheet).not.toContain("Receipt Review Date");
  for (const old of [
    "Check the detected details",
    "receipt image",
    "Part ",
    "Use suggestion",
    "More titles",
    "More amounts",
    "No text found",
    "Journey currency default",
    "USER_EDITED",
    "confidence",
    "currencySource",
    "Text may suggest",
  ])
    expect(sheet).not.toContain(old);
  expect(sheet.match(/<ReceiptCandidateTags/g)).toHaveLength(3);
  expect(sheet).toContain('label="Currency"');
  expect(sheet).toContain("alwaysOverflow");
  expect(sheet).toContain("onOverflow={openCurrency}");
  expect(sheet).toContain("setOverflow(null)");
  expect(sheet).toContain('setOverflow("Title")');
  expect(sheet).toContain('setOverflow("Amount")');
  expect(sheet.indexOf("+ Scan another part")).toBeLessThan(
    sheet.indexOf("Receipt Review Title"),
  );
  expect(sheet).toContain("disabled={!canScanAnother}");
  expect(sheet).toContain(
    "onConfirm(confirmReceiptReview(review, session), session.revision)",
  );
  expect(sheet).toContain("onCancel()");
  expect(entry).toContain("selectionLimit: remaining");
  expect(entry).toContain("scanOcrQueue.current.push(next.id)");
  expect(entry).toContain("prepareReceiptReviewConfirmation(");
  expect(entry).toContain("transferConfirmedReceiptDrafts(prepared.scannedDrafts)");
});

it("keeps drawer accessible, native zoom separate from collapse, and explicit retry/removal", () => {
  const sheet = readFileSync(
    new URL("./ReceiptReviewSheet.tsx", import.meta.url),
    "utf8",
  );
  expect(sheet).toContain('accessibilityLabel="Close receipt drawer"');
  expect(sheet).toContain("Open receipt ${part.number}");
  expect(sheet).toContain("Receipt {active.number}");
  expect(sheet).not.toContain("cards.findIndex");
  expect(sheet).toContain("Remove receipt ${active.number}");
  expect(sheet).toContain("onRetry(active.documentId)");
  expect(sheet).toContain("Hide image");
  expect(sheet).toContain('setOverflow("Currency")');
  expect(sheet).toContain('backgroundColor: "rgba(246,247,249,0.45)"');
  expect(sheet).toContain('backgroundColor: "transparent"');
  expect(sheet).toContain("compare && styles.compareOverflowSheet");
  expect(sheet).toContain("compare && styles.compareOverflowOption");
  expect(sheet).toContain("linear-gradient(90deg");
  expect(sheet).toContain("label={`Close ${overflow} options`}");
  expect(sheet).toContain("<OverlayDismissAction");
  expect(sheet).not.toContain("styles.overflowClose");
  expect(sheet).not.toContain("{overflow}\n");
  expect(sheet).toContain("Re-read");
  expect(sheet).not.toContain("•••");
  expect(sheet).not.toContain("debugMode");
  expect(sheet).toContain("currencyOverlay");
  expect(sheet).not.toContain("currencyPicker ? (\n          <>");
  expect(sheet.match(/<CandidateDropdown/g)).toHaveLength(3);
  expect(sheet).toContain("onRemove(active.documentId)");
  expect(sheet).toContain('resizeMode="contain"');
  expect(sheet).toContain("maximumZoomScale={5}");
  expect(sheet).toContain("useNativeDriver: true");
  expect(sheet).toContain('textAlign: "left"');
  expect(sheet.slice(sheet.indexOf("function ReceiptImage"))).not.toContain("onTouchEnd");
  expect(sheet).toContain(
    'supportedOrientations={["portrait", "landscape-left", "landscape-right"]}',
  );
  const config = JSON.parse(
    readFileSync(new URL("../../../app.json", import.meta.url), "utf8"),
  );
  expect(config.expo.ios.infoPlist.UISupportedInterfaceOrientations).toContain(
    "UIInterfaceOrientationLandscapeRight",
  );
});
