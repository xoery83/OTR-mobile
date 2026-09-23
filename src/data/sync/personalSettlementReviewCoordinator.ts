import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createPersonalSettlementReviewRepository } from "@/data/repositories/personalSettlementReviewRepository";
import { ApiClientError } from "@/data/api/client";

import { createPersonalSettlementReviewTransport } from "./personalSettlementReviewTransport";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";

export async function refreshPersonalSettlementReview(journeyId: string) {
  const database = await openDatabase();
  const repository = createPersonalSettlementReviewRepository(
    database,
    requireActiveUserId,
  );
  await repository.applyRemote(
    journeyId,
    await createPersonalSettlementReviewTransport().read(journeyId),
  );
}

export async function runPersonalSettlementReviewSync(journeyId?: string) {
  const database = await openDatabase();
  const repository = createPersonalSettlementReviewRepository(
    database,
    requireActiveUserId,
  );
  const transport = createPersonalSettlementReviewTransport();
  return createSyncEngine(
    createSyncOperationRepository(database, requireActiveUserId),
    {
      async push(operation) {
        try {
          const response = await transport.checkpoint(
            operation.tripId!,
            operation.idempotencyKey,
            JSON.parse(operation.payloadJson),
          );
          await repository.markSynced(operation.tripId!, operation.id, response);
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 409)
            await repository.markRejected(
              operation.tripId!,
              error.code ?? "STALE_REVIEW_CHECKPOINT",
            );
          throw error;
        }
      },
    },
    undefined,
    (operation) =>
      operation.entityType === "settlement_review" &&
      operation.operationType === "CREATE_SETTLEMENT_REVIEW_CHECKPOINT" &&
      (!journeyId || operation.tripId === journeyId),
  ).run("AUTHENTICATED_ONLINE");
}
