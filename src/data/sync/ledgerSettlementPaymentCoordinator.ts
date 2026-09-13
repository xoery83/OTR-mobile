import { openDatabase } from "@/data/db/database";
import { createLedgerSettlementRepository } from "@/data/repositories/ledgerSettlementRepository";

import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";
import { createLedgerSettlementTransport } from "./ledgerSettlementTransport";
import { createLedgerSettlementPaymentSyncWorker } from "./ledgerSettlementPaymentSyncWorker";
import type { AuthState } from "@/domain/auth/authState";

function nextAttemptAt(attempt: number) {
  return new Date(Date.now() + attempt * 30_000).toISOString();
}

export async function runLedgerSettlementPaymentSync(
  authState: AuthState = "AUTHENTICATED_ONLINE",
  journeyId?: string,
) {
  const database = await openDatabase();
  return createSyncEngine(
    createSyncOperationRepository(database),
    createLedgerSettlementPaymentSyncWorker(
      createLedgerSettlementRepository(database),
      createLedgerSettlementTransport(),
    ),
    nextAttemptAt,
    (operation) =>
      ["ledger_settlement_payment", "ledger_settlement_adjustment"].includes(
        operation.entityType,
      ) &&
      (!journeyId || operation.tripId === journeyId),
  ).run(authState);
}
