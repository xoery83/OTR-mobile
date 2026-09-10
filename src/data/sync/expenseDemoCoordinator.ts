import { readLocalSession } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createExpenseRepository } from "@/data/repositories/expenseRepository";

import { createExpenseSyncWorker } from "./expenseSyncWorker";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";
import {
  fakeExpenseTransport,
  getExpenseCreateTransport,
  getSyncTransportMode,
} from "./transportSelection";

function nextAttemptAt(attemptCount: number) {
  return new Date(Date.now() + attemptCount * 30_000).toISOString();
}

export async function runExpenseDemoSync() {
  const database = await openDatabase();
  const expenseRepository = createExpenseRepository(database);
  const operationRepository = createSyncOperationRepository(database);
  const worker = createExpenseSyncWorker(expenseRepository, getExpenseCreateTransport());

  // This is a deliberate development harness, not a production auth bypass.
  const expenseEngine = createSyncEngine(
    operationRepository,
    worker,
    nextAttemptAt,
    (operation) =>
      operation.entityType === "expense" && operation.operationType === "CREATE_EXPENSE",
  );

  const session =
    getSyncTransportMode() === "dev" ? await readLocalSession() : { accessToken: "fake" };
  return expenseEngine.run(
    session?.accessToken ? "AUTHENTICATED_ONLINE" : "AUTHENTICATED_OFFLINE",
  );
}

export function failNextExpenseDemoSync() {
  if (getSyncTransportMode() === "fake") fakeExpenseTransport.failNextCreate();
}
