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

export async function bootstrapLedgerPersonalPayments(journeyId: string) {
  const database = await openDatabase();
  const repository = createLedgerPersonalPaymentRepository(database, requireActiveUserId);
  const response = await createLedgerPersonalPaymentTransport().list(journeyId, true);
  await repository.applyHistoricalList(journeyId, response.payments, response.serverTime);
  await repository.applyFxProjectionList(journeyId, response.projections ?? []);
  return response;
}

export async function pullLedgerPersonalPayments(journeyId: string) {
  const database = await openDatabase();
  const repository = createLedgerPersonalPaymentRepository(database, requireActiveUserId);
  const transport = createLedgerPersonalPaymentTransport();
  let cursor = (await repository.getCursor(journeyId))?.cursor ?? null;
  let hasMore = true;
  let changed = false;
  while (hasMore) {
    const response = await transport.changes(journeyId, cursor);
    await repository.applyChanges(journeyId, response);
    changed ||= response.changes.length > 0;
    cursor = response.cursor;
    hasMore = response.hasMore === true;
  }
  return changed;
}

export async function refreshLedgerPersonalPayments(journeyId: string) {
  const database = await openDatabase();
  const repository = createLedgerPersonalPaymentRepository(database, requireActiveUserId);
  const checkpoint = await repository.getCursor(journeyId);
  if (!checkpoint) await bootstrapLedgerPersonalPayments(journeyId);
  try {
    return await pullLedgerPersonalPayments(journeyId);
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.code !== "INVALID_CURSOR")
      throw error;
    await bootstrapLedgerPersonalPayments(journeyId);
    return pullLedgerPersonalPayments(journeyId);
  }
}
