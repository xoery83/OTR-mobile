import { openDatabase } from "@/data/db/database";
import { createLedgerReviewRepository } from "@/data/repositories/ledgerReviewRepository";

import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { createLedgerReviewTransport } from "./ledgerReviewTransport";
import type { SyncOperation } from "./syncOperationRepository";

export async function runLedgerReviewSync(journeyId?: string) {
  const database = await openDatabase();
  const repository = createLedgerReviewRepository(database);
  const transport = createLedgerReviewTransport();
  return createSyncEngine(
    createSyncOperationRepository(database, requireActiveUserId),
    {
      async push(operation: SyncOperation) {
        const input = JSON.parse(operation.payloadJson);
        const response = await transport.act(
          operation.tripId!,
          operation.entityId,
          operation.idempotencyKey,
          input,
        );
        await repository.markActionSynced(
          operation.idempotencyKey,
          response.finding,
          response.action,
        );
      },
    },
    undefined,
    (operation) =>
      operation.entityType === "ledger_review" &&
      (!journeyId || operation.tripId === journeyId),
  ).run("AUTHENTICATED_ONLINE");
}
