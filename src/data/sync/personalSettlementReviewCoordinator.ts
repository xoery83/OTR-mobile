import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createPersonalSettlementReviewRepository } from "@/data/repositories/personalSettlementReviewRepository";
import { ApiClientError } from "@/data/api/client";

import { createPersonalSettlementReviewTransport } from "./personalSettlementReviewTransport";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";

export async function refreshPersonalSettlementReview(
  journeyId: string,
  requestContext?: AccountRequestContext,
) {
  const context =
    requestContext ??
    (await captureAccountRequestContext(journeyId, requireActiveUserId));
  await assertAccountRequestContext(context, requireActiveUserId);
  const database = await openDatabase();
  const repository = createPersonalSettlementReviewRepository(
    database,
    async () => context.accountId,
  );
  const response = await createPersonalSettlementReviewTransport().read(
    journeyId,
    context,
  );
  await withAccountApplyGate(async () => {
    await assertAccountRequestContext(context, requireActiveUserId);
    await database.withTransactionAsync(async () => {
      await repository.applyRemote(journeyId, response);
      await assertAccountRequestContext(context, requireActiveUserId);
    });
  });
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
              operation.id,
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
