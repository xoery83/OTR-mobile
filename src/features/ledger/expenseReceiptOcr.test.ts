import { describe, expect, it, vi } from "vitest";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import { ReceiptOcrError, type OcrDocument } from "@/native/receiptOcr";
import {
  createExpenseReceiptOcrSession,
  shouldRunExpenseReceiptOcr,
} from "./expenseReceiptOcr";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo", () => ({ requireNativeModule: vi.fn() }));

const draft = (id: string, mimeType: TemporaryReceiptDraft["mimeType"] = "image/png") =>
  ({
    id,
    localUri: `file:///ledger-receipt-drafts/${id}.png`,
    mimeType,
  }) as TemporaryReceiptDraft;
const document = (observations = 1): OcrDocument => ({
  engine: "apple-vision",
  engineRevision: 3,
  imageWidth: 1200,
  imageHeight: 1800,
  durationMs: 90,
  supportedLanguages: ["en-US"],
  observations: Array.from({ length: observations }, () => ({
    text: "SYNTHETIC",
    confidence: 0.9,
    boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
  })),
});
const deferred = () => {
  let resolve!: (value: OcrDocument) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<OcrDocument>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("New Expense receipt OCR session", () => {
  it("runs only for an explicit New Expense scan", () => {
    expect(shouldRunExpenseReceiptOcr(true, false)).toBe(true);
    expect(shouldRunExpenseReceiptOcr(false, false)).toBe(false);
    expect(shouldRunExpenseReceiptOcr(true, true)).toBe(false);
    expect(shouldRunExpenseReceiptOcr(false, true)).toBe(false);
  });
  it("binds only the latest scanned draft and ignores a late replaced result", async () => {
    const first = deferred();
    const second = deferred();
    const recognize = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const session = createExpenseReceiptOcrSession(recognize, vi.fn());
    session.start(draft("a"));
    const oldSignal = recognize.mock.calls[0][0].signal as AbortSignal;
    session.start(draft("b"));
    expect(oldSignal.aborted).toBe(true);
    first.resolve(document());
    await settle();
    expect(session.snapshot()).toMatchObject({ draftId: "b", status: "recognizing" });
    second.resolve(document());
    await settle();
    expect(session.snapshot()).toMatchObject({ draftId: "b", status: "completed" });
    expect(session.snapshot().document?.observations).toHaveLength(1);
  });

  it("removal, cancel, and unmount-style clear discard results", async () => {
    const pending = deferred();
    const recognize = vi.fn().mockReturnValue(pending.promise);
    const session = createExpenseReceiptOcrSession(recognize, vi.fn());
    session.start(draft("a"));
    session.clear("other");
    expect(session.snapshot().draftId).toBe("a");
    session.clear("a");
    pending.resolve(document());
    await settle();
    expect(session.snapshot()).toMatchObject({ status: "idle", document: null });
    session.start(draft("b"));
    session.cancel();
    expect(session.snapshot()).toMatchObject({
      draftId: "b",
      status: "cancelled",
      document: null,
    });
    session.clear();
    expect(session.snapshot()).toMatchObject({ status: "idle", draftId: null });
  });

  it("keeps no-text, PDF unavailability, and failures separate from attachment state", async () => {
    const recognize = vi
      .fn()
      .mockResolvedValueOnce(document(0))
      .mockRejectedValueOnce(new ReceiptOcrError("VISION_FAILURE"));
    const session = createExpenseReceiptOcrSession(recognize, vi.fn());
    session.start(draft("empty"));
    await settle();
    expect(session.snapshot()).toMatchObject({ draftId: "empty", status: "no-text" });
    expect(session.snapshot().document?.observations).toEqual([]);
    session.start(draft("pdf", "application/pdf"));
    expect(session.snapshot()).toMatchObject({
      status: "failed",
      errorCode: "UNSUPPORTED_IMAGE",
    });
    expect(recognize).toHaveBeenCalledTimes(1);
    session.start(draft("failed"));
    await settle();
    expect(session.snapshot()).toMatchObject({
      draftId: "failed",
      status: "failed",
      errorCode: "VISION_FAILURE",
    });
  });

  it("rescans the same recovered draft without a new draft or network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const recognize = vi.fn().mockResolvedValue(document());
    const session = createExpenseReceiptOcrSession(recognize, vi.fn());
    const recovered = draft("recovered");
    session.start(recovered);
    await settle();
    session.start(recovered);
    await settle();
    expect(recognize.mock.calls.map(([input]) => input.uri)).toEqual([
      recovered.localUri,
      recovered.localUri,
    ]);
    expect(session.snapshot()).toMatchObject({
      draftId: "recovered",
      status: "completed",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
