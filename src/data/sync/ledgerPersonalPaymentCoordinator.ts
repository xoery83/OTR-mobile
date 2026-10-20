import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { ApiClientError } from "@/data/api/client";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createLedgerPersonalPaymentRepository } from "@/data/repositories/ledgerPersonalPaymentRepository";

import type { AuthState } from "@/domain/auth/authState";
import { createLedgerPersonalPaymentSyncWorker } from "./ledgerPersonalPaymentSyncWorker";
import { createLedgerPersonalPaymentTransport } from "./ledgerPersonalPaymentTransport";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";

export async function runLedgerPersonalPaymentSync(
  authState: AuthState = "AUTHENTICATED_ONLINE",
  journeyId?: string,
) {
  const database = await openDatabase();
  return createSyncEngine(
    createSyncOperationRepository(database, requireActiveUserId),
    createLedgerPersonalPaymentSyncWorker(
      createLedgerPersonalPaymentRepository(database, requireActiveUserId),
      createLedgerPersonalPaymentTransport(),
    ),
    undefined,
    (operation) =>
      operation.entityType === "ledger_personal_payment" &&
      (!journeyId || operation.tripId === journeyId),
  ).run(authState);
}

export async function bootstrapLedgerPersonalPayments(
  journeyId: string,
  onRequest?: () => void,
  requestContext?: AccountRequestContext,
) {
  const context =
    requestContext ??
    (await captureAccountRequestContext(journeyId, requireActiveUserId));
  await assertAccountRequestContext(context, requireActiveUserId);
  const database = await openDatabase();
  const repository = createLedgerPersonalPaymentRepository(
    database,
    async () => context.accountId,
  );
  onRequest?.();
  const response = await createLedgerPersonalPaymentTransport({}, context).list(
    journeyId,
    true,
  );
  await withAccountApplyGate(async () => {
    await assertAccountRequestContext(context, requireActiveUserId);
    await repository.applyHistoricalList(
      journeyId,
      response.payments,
      response.serverTime,
    );
    await repository.applyFxProjectionList(journeyId, response.projections ?? []);
    await assertAccountRequestContext(context, requireActiveUserId);
  });
  return response;
}

export async function pullLedgerPersonalPayments(
  journeyId: string,
  onRequest?: () => void,
  requestContext?: AccountRequestContext,
) {
  const context =
    requestContext ??
    (await captureAccountRequestContext(journeyId, requireActiveUserId));
  await assertAccountRequestContext(context, requireActiveUserId);
  const database = await openDatabase();
  const repository = createLedgerPersonalPaymentRepository(
    database,
    async () => context.accountId,
  );
  const transport = createLedgerPersonalPaymentTransport({}, context);
  let cursor = (await repository.getCursor(journeyId))?.cursor ?? null;
  let hasMore = true;
  let changed = false;
  while (hasMore) {
    onRequest?.();
    const response = await transport.changes(journeyId, cursor);
    await withAccountApplyGate(async () => {
      await assertAccountRequestContext(context, requireActiveUserId);
      await repository.applyChanges(journeyId, response);
      await assertAccountRequestContext(context, requireActiveUserId);
    });
    changed ||= response.changes.length > 0;
    cursor = response.cursor;
    hasMore = response.hasMore === true;
  }
  return changed;
}

export async function refreshLedgerPersonalPayments(
  journeyId: string,
  onRequest?: () => void,
  requestContext?: AccountRequestContext,
) {
  const context =
    requestContext ??
    (await captureAccountRequestContext(journeyId, requireActiveUserId));
  await assertAccountRequestContext(context, requireActiveUserId);
  const database = await openDatabase();
  const repository = createLedgerPersonalPaymentRepository(
    database,
    async () => context.accountId,
  );
  const checkpoint = await repository.getCursor(journeyId);
  if (!checkpoint) await bootstrapLedgerPersonalPayments(journeyId, onRequest, context);
  try {
    return await pullLedgerPersonalPayments(journeyId, onRequest, context);
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.code !== "INVALID_CURSOR")
      throw error;
    await bootstrapLedgerPersonalPayments(journeyId, onRequest, context);
    return pullLedgerPersonalPayments(journeyId, onRequest, context);
  }
}
