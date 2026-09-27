import { requireActiveUserId } from "@/data/auth/authRepository";
import {
  createTemporaryReceiptDraft,
  deleteTemporaryReceiptDraft,
  prepareReceiptDraft,
} from "@/data/files/receiptFileStore";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import { createLocalId } from "@/domain/localId";

export async function importReceiptAsset(input: {
  journeyId: string;
  expenseId?: string | null;
  personalPaymentId?: string | null;
  sourceUri: string;
  mimeType: string;
  originalFilename?: string | null;
  requestOcr: boolean;
}) {
  const id = createLocalId("ledger-receipt");
  const draft = await createTemporaryReceiptDraft({
    id,
    ownerUserId: await requireActiveUserId(),
    sourceUri: input.sourceUri,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename,
  });
  const prepared = await prepareReceiptDraft(draft);
  const saved = await (
    await getDefaultLedgerReceiptRepository()
  ).importReceipt({
    journeyId: input.journeyId,
    expenseId: input.expenseId,
    personalPaymentId: input.personalPaymentId,
    requestOcr: input.requestOcr,
    ...prepared,
  });
  try {
    deleteTemporaryReceiptDraft(draft);
  } catch {
    /* retain a safe orphan candidate */
  }
  return saved;
}
