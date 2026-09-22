import { copyReceiptIntoAppStorage } from "@/data/files/receiptFileStore";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { createLocalId } from "@/domain/localId";

export async function importReceiptAsset(input: {
  journeyId: string;
  expenseId?: string | null;
  personalPaymentId?: string | null;
  sourceUri: string;
  mimeType: ReceiptAsset["mimeType"];
  requestOcr: boolean;
}) {
  const id = createLocalId("ledger-receipt");
  const copied = await copyReceiptIntoAppStorage({
    id,
    sourceUri: input.sourceUri,
    mimeType: input.mimeType,
  });
  return (await getDefaultLedgerReceiptRepository()).importReceipt({
    id,
    journeyId: input.journeyId,
    expenseId: input.expenseId,
    personalPaymentId: input.personalPaymentId,
    mimeType: input.mimeType,
    requestOcr: input.requestOcr,
    ...copied,
  });
}
