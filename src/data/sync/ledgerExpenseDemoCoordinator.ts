import { openDatabase } from "@/data/db/database";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import { createLedgerCollaborationRepository } from "@/data/repositories/ledgerCollaborationRepository";

import { createLedgerExpenseMutationTransport } from "./ledgerExpenseMutationTransport";
import { createLedgerExpenseSyncWorker } from "./ledgerExpenseSyncWorker";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";

type Options = {
  entityId?: string;
  simulateResponseLoss?: () => boolean;
};

function nextAttemptAt(attemptCount: number) {
  return new Date(Date.now() + attemptCount * 30_000).toISOString();
}

export async function runLedgerExpenseSync(options: Options = {}) {
  const database = await openDatabase();
  const operationRepository = createSyncOperationRepository(database);
  const collaboration = createLedgerCollaborationRepository(database);
  const worker = createLedgerExpenseSyncWorker(
    createLedgerExpenseRepository(database),
    createLedgerExpenseMutationTransport({
      simulateResponseLoss: options.simulateResponseLoss,
    }),
    collaboration,
  );
  const engine = createSyncEngine(
    operationRepository,
    worker,
    nextAttemptAt,
    (operation) =>
      ["ledger_expense", "ledger_correction", "ledger_payment_record"].includes(
        operation.entityType,
      ) &&
      (!options.entityId ||
        operation.entityId === options.entityId ||
        operation.payloadJson.includes(`"expenseId":"${options.entityId}"`)),
  );

  return engine.run("AUTHENTICATED_ONLINE");
}

export const runLedgerExpenseCreateSync = runLedgerExpenseSync;
