import { openDatabase } from "@/data/db/database";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import { createLedgerReceiptRepository } from "@/data/repositories/ledgerReceiptRepository";
import { createLedgerReceiptTransport } from "./ledgerReceiptTransport";
import { pushReceiptOperation } from "./ledgerReceiptSyncWorker";

export async function runLedgerReceiptSync(
  options: { transport?: ReturnType<typeof createLedgerReceiptTransport> } = {},
) {
  const database = await openDatabase();
  const receipts = createLedgerReceiptRepository(database);
  const expenses = createLedgerExpenseRepository(database);
  const transport = options.transport ?? createLedgerReceiptTransport();
  await receipts.recoverInterruptedOperations();
  const operations = await receipts.listPendingOperations();
  for (const operation of operations) {
    await receipts.markOperation(operation.id, "PROCESSING");
    try {
      await pushReceiptOperation(operation, receipts, expenses, transport);
      await receipts.markOperation(operation.id, "COMPLETED");
    } catch (error) {
      await receipts.markOperation(
        operation.id,
        "RETRYABLE",
        error instanceof Error ? error.message : "Receipt operation failed.",
      );
    }
  }
  return { processedCount: operations.length };
}
