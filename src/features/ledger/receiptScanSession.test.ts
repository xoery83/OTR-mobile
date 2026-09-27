import { expect, it } from "vitest";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import type { OcrDocument } from "@/native/receiptOcr";
import {
  addReceiptScanDocument,
  beginReceiptScanOcr,
  cancelReceiptScanSession,
  completeReceiptScanOcr,
  createReceiptScanSession,
  removeReceiptScanDocument,
  replaceReceiptScanDocument,
  suspendReceiptScanSession,
} from "./receiptScanSession";

const draft = (id: string): TemporaryReceiptDraft => ({
  id,
  ownerUserId: "owner",
  journeyId: "journey",
  localUri: `file:///receipts/${id}.jpg`,
  mimeType: "image/jpeg",
  sizeBytes: 10,
  sha256: id,
});
const ocr = (text: string): OcrDocument => ({
  engine: "apple-vision",
  engineRevision: 3,
  imageWidth: 1200,
  imageHeight: 1800,
  durationMs: 8,
  supportedLanguages: ["en-US"],
  observations: [
    {
      text,
      confidence: 0.9,
      boundingBox: { x: 0.05, y: 0.05, width: 0.7, height: 0.03 },
    },
  ],
});
function scanned(
  session: ReturnType<typeof createReceiptScanSession>,
  id: string,
  text: string,
) {
  const added = addReceiptScanDocument(session, draft(id));
  const started = beginReceiptScanOcr(added, `d_${id}`);
  return completeReceiptScanOcr(
    started,
    `d_${id}`,
    started.documents.at(-1)!.revision,
    ocr(text),
  );
}

it("holds three documents and reparses after removal and replacement", () => {
  let session = createReceiptScanSession("session");
  session = scanned(session, "a", "Cafe Maple");
  session = scanned(session, "b", "TOTAL 75.00");
  session = scanned(session, "c", "TOTAL 86.40");
  expect(session.documents).toHaveLength(3);
  expect(session.combined?.status.amount).toBe("ambiguous");
  expect(() => addReceiptScanDocument(session, draft("d"))).toThrow();
  const removed = removeReceiptScanDocument(session, "d_b");
  expect(removed.removedDraft?.id).toBe("b");
  expect(removed.session.combined?.amountCandidates.map((item) => item.decimal)).toEqual([
    "86.40",
  ]);
  expect(removed.session.combined?.merchantCandidates[0].name).toBe("Cafe Maple");
  expect(() => addReceiptScanDocument(removed.session, draft("b"))).toThrow();
  const replaced = replaceReceiptScanDocument(removed.session, "d_c", draft("new"));
  expect(replaced.removedDraft.id).toBe("c");
  expect(replaced.session.combined?.amountCandidates).toEqual([]);
  expect(replaced.session.documents.map((item) => item.documentId)).toEqual([
    "d_a",
    "d_new",
  ]);
});

it("uses the accepted attachment capacity and does not duplicate a recovered draft", () => {
  let session = createReceiptScanSession("session", ["ordinary"]);
  session = addReceiptScanDocument(session, draft("a"));
  expect(addReceiptScanDocument(session, draft("a"))).toBe(session);
  expect(() =>
    addReceiptScanDocument(session, { ...draft("other"), journeyId: "another" }),
  ).toThrow();
  session = addReceiptScanDocument(session, draft("b"));
  expect(() => addReceiptScanDocument(session, draft("c"))).toThrow();
  expect(() =>
    addReceiptScanDocument(createReceiptScanSession("pdf"), {
      ...draft("pdf"),
      mimeType: "application/pdf",
    }),
  ).toThrow();
  const recovered = addReceiptScanDocument(
    createReceiptScanSession("after-restart"),
    draft("a"),
  );
  expect(recovered.documents[0].documentId).toBe(session.documents[0].documentId);
  expect(recovered.documents[0].ocrDocument).toBeNull();
});

it("reduces scan capacity for two or three ordinary attachments", () => {
  const onePart = addReceiptScanDocument(
    createReceiptScanSession("two-ordinary", ["ordinary-a", "ordinary-b"]),
    draft("a"),
  );
  expect(() => addReceiptScanDocument(onePart, draft("b"))).toThrow(/Maximum 3/);
  expect(() =>
    addReceiptScanDocument(
      createReceiptScanSession("three-ordinary", [
        "ordinary-a",
        "ordinary-b",
        "ordinary-c",
      ]),
      draft("a"),
    ),
  ).toThrow(/Maximum 3/);
});

it("invalidates stale OCR after rescan, removal, suspension and cancellation", () => {
  let session = addReceiptScanDocument(createReceiptScanSession("session"), draft("a"));
  const first = beginReceiptScanOcr(session, "d_a");
  const second = beginReceiptScanOcr(first, "d_a");
  expect(
    completeReceiptScanOcr(
      second,
      "d_a",
      first.documents[0].revision,
      ocr("TOTAL 75.00"),
    ),
  ).toBe(second);
  session = completeReceiptScanOcr(
    second,
    "d_a",
    second.documents[0].revision,
    ocr("TOTAL 86.40"),
  );
  expect(session.combined?.amountCandidates[0].decimal).toBe("86.40");
  const suspended = suspendReceiptScanSession(session);
  expect(suspended.combined).toBe(session.combined);
  expect(suspended.documents[0].ocrDocument).toBe(session.documents[0].ocrDocument);
  const resumed = beginReceiptScanOcr(suspended, "d_a");
  expect(resumed.combined).toBeNull();
  const backgrounded = suspendReceiptScanSession(resumed);
  expect(backgrounded.documents[0].status).toBe("pending");
  expect(
    completeReceiptScanOcr(
      backgrounded,
      "d_a",
      resumed.documents[0].revision,
      ocr("TOTAL 75.00"),
    ),
  ).toBe(backgrounded);
  const removed = removeReceiptScanDocument(resumed, "d_a");
  expect(
    completeReceiptScanOcr(
      removed.session,
      "d_a",
      resumed.documents[0].revision,
      ocr("TOTAL 75.00"),
    ),
  ).toBe(removed.session);
  const cancelled = cancelReceiptScanSession(session);
  expect(cancelled.draftsToDiscard.map((item) => item.id)).toEqual(["a"]);
  expect(cancelled.session.documents).toEqual([]);
  expect(cancelled.session.combined).toBeNull();
  expect(
    completeReceiptScanOcr(
      cancelled.session,
      "d_a",
      session.documents[0].revision,
      ocr("TOTAL 75.00"),
    ),
  ).toBe(cancelled.session);
});

it("retains no-text and failed image drafts for retry without persisting OCR", () => {
  const added = addReceiptScanDocument(createReceiptScanSession("session"), draft("a"));
  const started = beginReceiptScanOcr(added, "d_a");
  const noText = completeReceiptScanOcr(started, "d_a", started.documents[0].revision, {
    ...ocr("TOTAL 1.00"),
    observations: [],
  });
  expect(noText.documents[0].status).toBe("no-text");
  expect(noText.documents[0].draft).toBe(added.documents[0].draft);
  const retried = beginReceiptScanOcr(noText, "d_a");
  const failed = completeReceiptScanOcr(
    retried,
    "d_a",
    retried.documents[0].revision,
    "VISION_FAILURE",
  );
  expect(failed.documents[0]).toMatchObject({
    status: "failed",
    ocrDocument: null,
    errorCode: "VISION_FAILURE",
  });
  expect(failed.combined).toBeNull();
});
