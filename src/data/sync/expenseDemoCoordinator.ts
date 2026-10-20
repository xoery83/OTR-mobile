import { openDatabase } from "@/data/db/database";
import { createExpenseRepository } from "@/data/repositories/expenseRepository";

import { createExpenseSyncWorker } from "./expenseSyncWorker";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { fakeExpenseTransport } from "./transportSelection";

function nextAttemptAt(attemptCount: number) {
  return new Date(Date.now() + attemptCount * 30_000).toISOString();
}

export async function runExpenseDemoSync() {
  const database = await openDatabase();
  const expenseRepository = createExpenseRepository(database, requireActiveUserId);
  const operationRepository = createSyncOperationRepository(
    database,
    requireActiveUserId,
  );
  const worker = createExpenseSyncWorker(expenseRepository, fakeExpenseTransport);

  // This is a deliberate Stage 2 validation harness, not a production auth bypass.
  const expenseEngine = createSyncEngine(
    operationRepository,
    worker,
    nextAttemptAt,
    (operation) =>
      operation.entityType === "expense" && operation.operationType === "CREATE_EXPENSE",
  );

  return expenseEngine.run("AUTHENTICATED_ONLINE");
}

export function failNextExpenseDemoSync() {
  fakeExpenseTransport.failNextCreate();
}
