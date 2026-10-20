import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import { assertExpenseAttachmentDrafts } from "@/domain/ledger/attachments";
import {
  parseReceiptEvidenceSet,
  type ReceiptEvidenceSetResult,
  type ReceiptParseContext,
} from "@/domain/receipt/parseReceipt";
import type { OcrDocument, ReceiptOcrErrorCode } from "@/native/receiptOcr";

export type ReceiptScanDocument = {
  documentId: string;
  draft: TemporaryReceiptDraft;
  status: "pending" | "recognizing" | "completed" | "no-text" | "failed";
  revision: number;
  ocrDocument: OcrDocument | null;
  errorCode: ReceiptOcrErrorCode | null;
};

export type ReceiptScanSession = {
  sessionId: string;
  revision: number;
  status: "active" | "cancelled";
  ownerUserId: string | null;
  journeyId: string | null;
  existingAttachmentDraftIds: readonly string[];
  usedDraftIds: readonly string[];
  documents: readonly ReceiptScanDocument[];
  combined: ReceiptEvidenceSetResult | null;
};

function documentId(draft: TemporaryReceiptDraft) {
  if (!/^[a-zA-Z0-9_-]+$/.test(draft.id)) throw new Error("Receipt draft ID is invalid.");
  return `d_${draft.id}`;
}

function reparse(
  session: ReceiptScanSession,
  context: ReceiptParseContext,
): ReceiptScanSession {
  const documents = session.documents.flatMap((item) =>
    item.ocrDocument ? [{ documentId: item.documentId, document: item.ocrDocument }] : [],
  );
  return {
    ...session,
    revision: session.revision + 1,
    combined: documents.length ? parseReceiptEvidenceSet({ documents }, context) : null,
  };
}

function assertActive(session: ReceiptScanSession) {
  if (session.status !== "active") throw new Error("Receipt scan session is cancelled.");
}

function assertCapacity(
  session: ReceiptScanSession,
  documents: readonly ReceiptScanDocument[],
) {
  assertExpenseAttachmentDrafts([
    ...session.existingAttachmentDraftIds,
    ...documents.map((item) => item.draft.id),
  ]);
}

function assertScope(session: ReceiptScanSession, draft: TemporaryReceiptDraft) {
  if (draft.mimeType === "application/pdf")
    throw new Error("Receipt scan parts must be images.");
  if (!draft.ownerUserId || !draft.journeyId)
    throw new Error("Receipt draft requires an owner and Journey.");
  if (
    (session.ownerUserId && session.ownerUserId !== draft.ownerUserId) ||
    (session.journeyId && session.journeyId !== draft.journeyId)
  )
    throw new Error("Receipt draft belongs to another account or Journey.");
}

export function createReceiptScanSession(
  sessionId: string,
  existingAttachmentDraftIds: readonly string[] = [],
): ReceiptScanSession {
  if (!sessionId) throw new Error("Receipt scan session ID is required.");
  assertExpenseAttachmentDrafts(existingAttachmentDraftIds);
  return {
    sessionId,
    revision: 0,
    status: "active",
    ownerUserId: null,
    journeyId: null,
    existingAttachmentDraftIds: [...existingAttachmentDraftIds],
    usedDraftIds: [],
    documents: [],
    combined: null,
  };
}

export function addReceiptScanDocument(
  session: ReceiptScanSession,
  draft: TemporaryReceiptDraft,
  context: ReceiptParseContext = {},
): ReceiptScanSession {
  assertActive(session);
  assertScope(session, draft);
  const existing = session.documents.find((item) => item.draft.id === draft.id);
  if (existing) {
    if (
      existing.draft.sha256 !== draft.sha256 ||
      existing.draft.localUri !== draft.localUri
    )
      throw new Error("Receipt draft identity changed.");
    return session;
  }
  if (session.usedDraftIds.includes(draft.id))
    throw new Error("Removed receipt draft cannot re-enter the same session.");
  const documents = [
    ...session.documents,
    {
      documentId: documentId(draft),
      draft,
      status: "pending" as const,
      revision: 0,
      ocrDocument: null,
      errorCode: null,
    },
  ];
  assertCapacity(session, documents);
  return reparse(
    {
      ...session,
      ownerUserId: draft.ownerUserId,
      journeyId: draft.journeyId!,
      usedDraftIds: [...session.usedDraftIds, draft.id],
      documents,
    },
    context,
  );
}

export function removeReceiptScanDocument(
  session: ReceiptScanSession,
  id: string,
  context: ReceiptParseContext = {},
) {
  assertActive(session);
  const removedDraft = session.documents.find((item) => item.documentId === id)?.draft;
  if (!removedDraft) return { session, removedDraft: null };
  const documents = session.documents.filter((item) => item.documentId !== id);
  return { session: reparse({ ...session, documents }, context), removedDraft };
}

export function replaceReceiptScanDocument(
  session: ReceiptScanSession,
  id: string,
  draft: TemporaryReceiptDraft,
  context: ReceiptParseContext = {},
) {
  assertActive(session);
  assertScope(session, draft);
  const index = session.documents.findIndex((item) => item.documentId === id);
  if (index < 0) throw new Error("Receipt scan document was not found.");
  const removedDraft = session.documents[index].draft;
  if (removedDraft.id === draft.id)
    throw new Error("Rescan the existing receipt draft instead of replacing it.");
  if (session.documents.some((item, at) => at !== index && item.draft.id === draft.id))
    throw new Error("Receipt draft is already in this session.");
  if (session.usedDraftIds.includes(draft.id))
    throw new Error("Removed receipt draft cannot re-enter the same session.");
  const documents = [...session.documents];
  documents[index] = {
    documentId: documentId(draft),
    draft,
    status: "pending",
    revision: 0,
    ocrDocument: null,
    errorCode: null,
  };
  assertCapacity(session, documents);
  return {
    session: reparse(
      { ...session, usedDraftIds: [...session.usedDraftIds, draft.id], documents },
      context,
    ),
    removedDraft,
  };
}

export function beginReceiptScanOcr(
  session: ReceiptScanSession,
  id: string,
  context: ReceiptParseContext = {},
): ReceiptScanSession {
  assertActive(session);
  if (!session.documents.some((item) => item.documentId === id))
    throw new Error("Receipt scan document was not found.");
  const documents = session.documents.map((item) =>
    item.documentId === id
      ? {
          ...item,
          status: "recognizing" as const,
          revision: item.revision + 1,
          ocrDocument: null,
          errorCode: null,
        }
      : item,
  );
  return reparse({ ...session, documents }, context);
}

export function completeReceiptScanOcr(
  session: ReceiptScanSession,
  id: string,
  revision: number,
  result: OcrDocument | ReceiptOcrErrorCode,
  context: ReceiptParseContext = {},
): ReceiptScanSession {
  if (session.status !== "active") return session;
  const current = session.documents.find((item) => item.documentId === id);
  if (!current || current.status !== "recognizing" || current.revision !== revision)
    return session;
  const failed = typeof result === "string";
  const documents = session.documents.map((item) =>
    item.documentId === id
      ? {
          ...item,
          status: failed
            ? ("failed" as const)
            : result.observations.length
              ? ("completed" as const)
              : ("no-text" as const),
          ocrDocument: failed ? null : result,
          errorCode: failed ? result : null,
        }
      : item,
  );
  return reparse({ ...session, documents }, context);
}

export function suspendReceiptScanSession(
  session: ReceiptScanSession,
): ReceiptScanSession {
  if (session.status !== "active") return session;
  return {
    ...session,
    revision: session.revision + 1,
    documents: session.documents.map((item) =>
      item.status === "recognizing"
        ? {
            ...item,
            status: "pending",
            revision: item.revision + 1,
            ocrDocument: null,
            errorCode: null,
          }
        : item,
    ),
  };
}

export function cancelReceiptScanSession(session: ReceiptScanSession) {
  return {
    session: {
      ...session,
      revision: session.revision + 1,
      status: "cancelled" as const,
      documents: [],
      combined: null,
    },
    draftsToDiscard: session.documents.map((item) => item.draft),
  };
}
