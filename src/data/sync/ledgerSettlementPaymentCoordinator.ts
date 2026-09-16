import { openDatabase } from "@/data/db/database";
import { createLedgerSettlementRepository } from "@/data/repositories/ledgerSettlementRepository";

import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { createLedgerSettlementTransport } from "./ledgerSettlementTransport";
import { createLedgerSettlementPaymentSyncWorker } from "./ledgerSettlementPaymentSyncWorker";
import type { AuthState } from "@/domain/auth/authState";

export async function runLedgerSettlementPaymentSync(
  authState: AuthState = "AUTHENTICATED_ONLINE",
  journeyId?: string,
) {
  const database = await openDatabase();
  return createSyncEngine(
    createSyncOperationRepository(database, requireActiveUserId),
    createLedgerSettlementPaymentSyncWorker(
      createLedgerSettlementRepository(database),
      createLedgerSettlementTransport(),
    ),
    undefined,
    (operation) =>
      ["ledger_settlement_payment", "ledger_settlement_adjustment"].includes(
        operation.entityType,
      ) &&
      (!journeyId || operation.tripId === journeyId),
  ).run(authState);
}
