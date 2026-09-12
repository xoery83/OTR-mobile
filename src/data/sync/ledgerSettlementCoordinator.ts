import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { createLocalId } from "@/domain/localId";

import { createLedgerSettlementTransport } from "./ledgerSettlementTransport";

export async function previewSettlement(journeyId: string, throughTimestamp: string) {
  const repository = await getDefaultLedgerSettlementRepository();
  if (await repository.hasPendingFinancialOperations(journeyId)) {
    throw new Error("Sync pending Ledger changes before preparing settlement.");
  }
  return createLedgerSettlementTransport().preview(journeyId, throughTimestamp);
}

export async function finalizeSettlement(
  journeyId: string,
  throughTimestamp: string,
  inputDigest: string,
  idempotencyKey = createLocalId("settlement-finalize"),
) {
  const repository = await getDefaultLedgerSettlementRepository();
  if (await repository.hasPendingFinancialOperations(journeyId)) {
    throw new Error("Sync pending Ledger changes before finalizing settlement.");
  }
  if (!(await repository.canFinalize(journeyId))) {
    throw new Error("Organizer settlement access is required.");
  }
  const response = await createLedgerSettlementTransport().finalize(
    journeyId,
    throughTimestamp,
    inputDigest,
    idempotencyKey,
  );
  await repository.applyFinalized(response.entity);
  return response;
}
