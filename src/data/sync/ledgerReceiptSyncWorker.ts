import type { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import type {
  AssetOperation,
  createLedgerReceiptRepository,
} from "@/data/repositories/ledgerReceiptRepository";
import type { createLedgerReceiptTransport } from "./ledgerReceiptTransport";
import { verifyReceiptFile } from "@/data/files/receiptFileStore";

export async function pushReceiptOperation(
  operation: AssetOperation,
  receipts: ReturnType<typeof createLedgerReceiptRepository>,
  expenses: ReturnType<typeof createLedgerExpenseRepository>,
  transport: ReturnType<typeof createLedgerReceiptTransport>,
) {
  const asset = await receipts.getReceipt(operation.assetId);
  if (!asset) throw new Error("Receipt is missing from local storage.");
  if (operation.operationType === "DELETE_RECEIPT") {
    if (!asset.serverId && (await receipts.isUploadProcessing(asset.id)))
      throw new Error("Receipt upload is still in progress.");
    if (asset.serverId) {
      const response = await transport.deleteExpenseReceipt(
        asset.journeyId,
        asset.serverId,
        operation.idempotencyKey,
      );
      await receipts.reconcileDeletion(asset.id, response.entity.deletedAt ?? null);
    }
    return;
  }
  if (asset.deletedAt) return;

  if (operation.operationType === "UPLOAD_RECEIPT") {
    if (asset.expenseId && (await receipts.hasPendingExpenseDeletion(asset.expenseId)))
      throw new Error("Expense attachment deletion must sync before replacement upload.");
    await receipts.markUploading(asset.id);
    try {
      const expense = asset.expenseId ? await expenses.getExpense(asset.expenseId) : null;
      if (asset.expenseId && !expense?.serverId)
        throw new Error("Expense must sync before receipt upload.");
      if (!asset.localUri) throw new Error("Local receipt file is unavailable.");
      await verifyReceiptFile({
        localUri: asset.localUri,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        sha256: asset.sha256,
      });
      const created = asset.serverId
        ? null
        : await transport.create(asset.journeyId, operation.idempotencyKey, {
            localId: asset.id,
            ...(expense?.serverId ? { expenseId: expense.serverId } : {}),
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            sha256: asset.sha256,
          });
      if (created) await receipts.reconcile(asset.id, created.entity);
      const current = (await receipts.getReceipt(asset.id))!;
      if (!current.localUri) throw new Error("Local receipt file is unavailable.");
      const uploadedUri = await transport.upload(
        current.journeyId,
        current.serverId!,
        current.localUri,
        current.mimeType,
      );
      if (uploadedUri !== current.localUri)
        await receipts.updateLocalUri(current.id, uploadedUri);
      const complete = await transport.complete(
        current.journeyId,
        current.serverId!,
        `${operation.idempotencyKey}:complete`,
        {
          objectPath: current.objectPath!,
          sizeBytes: current.sizeBytes,
          sha256: current.sha256,
        },
      );
      await receipts.reconcile(asset.id, complete.entity);
    } catch (error) {
      await receipts.markUploadFailed(asset.id);
      throw error;
    }
    return;
  }

  if (!asset.serverId || asset.uploadStatus !== "UPLOADED")
    throw new Error("Receipt upload must complete first.");
  if (operation.operationType === "OCR_RECEIPT") {
    await receipts.markOcrStatus(asset.id, "RUNNING");
    try {
      const response = await transport.ocr(
        asset.journeyId,
        asset.serverId,
        operation.idempotencyKey,
      );
      await receipts.reconcile(asset.id, response.entity);
    } catch (error) {
      await receipts.markOcrStatus(asset.id, "FAILED");
      throw error;
    }
    return;
  }
  if (asset.personalPaymentId) {
    if (asset.personalPaymentLinkStatus === "DELETE_PENDING") {
      await transport.unlinkPersonalPayment(
        asset.journeyId,
        asset.personalPaymentId,
        asset.serverId,
        operation.idempotencyKey,
      );
      await receipts.markPersonalPaymentUnlinked(asset.id);
      return;
    }
    await transport.linkPersonalPayment(
      asset.journeyId,
      asset.serverId,
      asset.personalPaymentId,
      operation.idempotencyKey,
    );
    return;
  }
  if (!asset.expenseId) throw new Error("Receipt has no link target.");
  const expense = await expenses.getExpense(asset.expenseId);
  if (!expense?.serverId) throw new Error("Expense must sync before receipt linking.");
  const response = await transport.link(
    asset.journeyId,
    asset.serverId,
    expense.serverId,
    operation.idempotencyKey,
  );
  await receipts.reconcile(asset.id, response.entity);
}
