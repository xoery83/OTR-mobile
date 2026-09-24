import { openDatabase } from "@/data/db/database";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import { createLedgerReceiptRepository } from "@/data/repositories/ledgerReceiptRepository";
import { createLedgerReceiptTransport } from "./ledgerReceiptTransport";
import { pushReceiptOperation } from "./ledgerReceiptSyncWorker";
import { nextSyncAttemptAt, syncFailureClass, syncFailureDetails } from "./syncEngine";

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
    if (!(await receipts.claimOperation(operation.id))) continue;
    try {
      await pushReceiptOperation(operation, receipts, expenses, transport);
      await receipts.markOperation(operation.id, "COMPLETED");
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error("Receipt operation failed.");
      const kind = syncFailureClass(normalized);
      const details = syncFailureDetails(normalized);
      await receipts.markOperation(
        operation.id,
        kind === "retryable" ? "RETRYABLE" : kind === "auth" ? "PENDING" : "FAILED",
        normalized,
        kind === "retryable" ? nextSyncAttemptAt(operation.attemptCount + 1) : null,
        details.category,
      );
    }
  }
  return { processedCount: operations.length };
}
