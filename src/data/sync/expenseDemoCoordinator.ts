import { openDatabase } from "@/data/db/database";
import { createExpenseRepository } from "@/data/repositories/expenseRepository";

import { createFakeExpenseTransport } from "./fakeExpenseTransport";
import { createExpenseSyncWorker } from "./expenseSyncWorker";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";

const fakeTransport = createFakeExpenseTransport();

function nextAttemptAt(attemptCount: number) {
  return new Date(Date.now() + attemptCount * 30_000).toISOString();
}

export async function runExpenseDemoSync() {
  const database = await openDatabase();
  const expenseRepository = createExpenseRepository(database);
  const operationRepository = createSyncOperationRepository(database);
  const worker = createExpenseSyncWorker(expenseRepository, fakeTransport);

  // This is a deliberate development harness, not a production auth bypass.
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
  fakeTransport.failNextCreate();
}
