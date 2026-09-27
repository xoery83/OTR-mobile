import { requireActiveUserId } from "@/data/auth/authRepository";
import {
  createTemporaryReceiptDraft,
  deleteTemporaryReceiptDraft,
  listRecoverableReceiptDrafts,
  prepareReceiptDraft,
  recordTemporaryReceiptDraft,
  type TemporaryReceiptDraft,
} from "@/data/files/receiptFileStore";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import type { LedgerExpenseCommand } from "@/data/repositories/ledgerExpenseRepository";
import { createLocalId } from "@/domain/localId";
import { assertExpenseAttachmentDrafts } from "@/domain/ledger/attachments";
import type { PreparedExpenseReceipt } from "@/data/repositories/ledgerReceiptRepository";

export async function selectExpenseReceiptDraft(
  sourceUri: string,
  mimeType: string,
  existingExpenseId?: string,
  existingCount = 0,
  originalFilename?: string | null,
  journeyId?: string,
) {
  if (existingExpenseId) throw new Error("Receipt drafts are only for New Expense.");
  assertExpenseAttachmentDrafts(
    Array.from({ length: existingCount + 1 }, (_, i) => String(i)),
  );
  const draft = await createTemporaryReceiptDraft({
    id: createLocalId("receipt-draft"),
    ownerUserId: await requireActiveUserId(),
    sourceUri,
    mimeType,
    originalFilename,
  });
  if (journeyId) recordTemporaryReceiptDraft({ ...draft, journeyId });
  return { ...draft, journeyId };
}

export async function restoreExpenseReceiptDrafts(journeyId: string) {
  const drafts = await listRecoverableReceiptDrafts(
    await requireActiveUserId(),
    journeyId,
  );
  const receipts = await getDefaultLedgerReceiptRepository();
  const pending: TemporaryReceiptDraft[] = [];
  for (const draft of drafts) {
    if (!(await receipts.getReceipt(draft.id))) pending.push(draft);
  }
  return pending.slice(0, 3);
}

export function discardExpenseReceiptDraft(draft: TemporaryReceiptDraft) {
  deleteTemporaryReceiptDraft(draft);
}

export async function saveExpenseWithReceiptDraft(
  command: LedgerExpenseCommand,
  drafts: readonly TemporaryReceiptDraft[],
  expenseDraftId?: string,
) {
  assertExpenseAttachmentDrafts(drafts.map((draft) => draft.id));
  const activeUserId = drafts.length ? await requireActiveUserId() : null;
  if (drafts.length && drafts.some((draft) => draft.ownerUserId !== activeUserId))
    throw new Error("Receipt draft belongs to another account.");
  const prepared: PreparedExpenseReceipt[] = [];
  for (const draft of drafts) prepared.push(await prepareReceiptDraft(draft));
  const saved = await (
    await getDefaultLedgerExpenseRepository()
  ).createExpense(command, prepared, expenseDraftId);
  for (const draft of drafts) {
    try {
      deleteTemporaryReceiptDraft(draft);
    } catch {
      // The durable copy and SQLite intent are committed; retain this duplicate candidate.
    }
  }
  return saved;
}
