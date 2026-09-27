import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import type { OcrDocument, ReceiptOcrErrorCode } from "@/native/receiptOcr";
import { ReceiptOcrError } from "@/native/receiptOcr";

export type ExpenseReceiptOcrState = {
  draftId: string | null;
  status: "idle" | "recognizing" | "completed" | "no-text" | "failed" | "cancelled";
  document: OcrDocument | null;
  errorCode: ReceiptOcrErrorCode | null;
};

export const idleExpenseReceiptOcr: ExpenseReceiptOcrState = {
  draftId: null,
  status: "idle",
  document: null,
  errorCode: null,
};

export const shouldRunExpenseReceiptOcr = (scan: boolean, existingExpense: boolean) =>
  scan && !existingExpense;

export function createExpenseReceiptOcrSession(
  recognize: (input: { uri: string; signal: AbortSignal }) => Promise<OcrDocument>,
  onChange: (state: ExpenseReceiptOcrState) => void,
) {
  let generation = 0;
  let controller: AbortController | null = null;
  let state = idleExpenseReceiptOcr;
  const update = (next: ExpenseReceiptOcrState) => {
    state = next;
    onChange(next);
  };
  const invalidate = (status: ExpenseReceiptOcrState["status"] = "idle") => {
    generation++;
    controller?.abort();
    controller = null;
    update(
      status === "idle" ? idleExpenseReceiptOcr : { ...state, status, document: null },
    );
  };

  return {
    snapshot: () => state,
    clear: (draftId?: string) => {
      if (!draftId || state.draftId === draftId) invalidate();
    },
    cancel: () => {
      if (state.draftId) invalidate("cancelled");
    },
    start: (draft: TemporaryReceiptDraft) => {
      invalidate();
      const token = generation;
      if (draft.mimeType === "application/pdf") {
        update({
          draftId: draft.id,
          status: "failed",
          document: null,
          errorCode: "UNSUPPORTED_IMAGE",
        });
        return;
      }
      const request = new AbortController();
      controller = request;
      update({
        draftId: draft.id,
        status: "recognizing",
        document: null,
        errorCode: null,
      });
      void recognize({ uri: draft.localUri, signal: request.signal })
        .then((document) => {
          if (token !== generation || request.signal.aborted) return;
          update({
            draftId: draft.id,
            status: document.observations.length ? "completed" : "no-text",
            document,
            errorCode: null,
          });
        })
        .catch((error: unknown) => {
          if (token !== generation || request.signal.aborted) return;
          update({
            draftId: draft.id,
            status: "failed",
            document: null,
            errorCode: error instanceof ReceiptOcrError ? error.code : "VISION_FAILURE",
          });
        })
        .finally(() => {
          if (token === generation) controller = null;
        });
    },
  };
}
