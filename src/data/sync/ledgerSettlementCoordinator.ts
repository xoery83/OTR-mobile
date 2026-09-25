import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { createLocalId } from "@/domain/localId";
import type {
  SettlementCorrectionConfirmRequest,
  SettlementCorrectionPreviewRequest,
} from "@/data/api/ledgerSettlementContracts";
import { assertReplayFixtureWritable } from "@/data/repositories/replayFixtureGuard";

import { createLedgerSettlementTransport } from "./ledgerSettlementTransport";

export async function preflightSettlementFx(journeyId: string, forceRetry = false) {
  const unavailable = new Set<string>();
  const pendingPublication = new Set<string>();
  // Each call claims at most four demands on the shared 45-second lease.
  // ponytail: eight batches cap one foreground action at 32 pairs; paginate further if journeys exceed that.
  for (let batch = 0; batch < 8; batch++) {
    const result = await createLedgerSettlementTransport().preflight(
      journeyId,
      forceRetry && batch === 0,
    );
    result.unavailableExpenseIds.forEach((id) => unavailable.add(id));
    result.pendingPublicationExpenseIds.forEach((id) => pendingPublication.add(id));
    if (result.claimed < 4 && result.accepted < 4) break;
  }
  return { unavailable, pendingPublication };
}

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
  assertReplayFixtureWritable(journeyId);
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

export async function previewSettlementAdjustment(
  journeyId: string,
  rootSettlementId: string,
  throughTimestamp?: string,
) {
  const repository = await getDefaultLedgerSettlementRepository();
  if (await repository.hasPendingFinancialOperations(journeyId)) {
    throw new Error("Sync pending Ledger changes before preparing Adjustment.");
  }
  return createLedgerSettlementTransport().previewAdjustment(
    journeyId,
    rootSettlementId,
    throughTimestamp,
  );
}

export async function queueSettlementAdjustment(
  journeyId: string,
  rootSettlementId: string,
  expectedHeadId: string | null,
  inputDigest: string,
  throughTimestamp: string,
  reason: string,
  allowZeroTransfer: boolean,
) {
  assertReplayFixtureWritable(journeyId);
  const repository = await getDefaultLedgerSettlementRepository();
  if (await repository.hasPendingFinancialOperations(journeyId)) {
    throw new Error("Sync pending Ledger changes before finalizing Adjustment.");
  }
  await repository.queueAdjustment(journeyId, rootSettlementId, {
    expectedHeadId,
    inputDigest,
    throughTimestamp,
    reason,
    allowZeroTransfer,
  });
}

export async function previewSettlementCorrection(
  journeyId: string,
  rootSettlementId: string,
  input: SettlementCorrectionPreviewRequest,
) {
  const repository = await getDefaultLedgerSettlementRepository();
  if (await repository.hasPendingFinancialOperations(journeyId)) {
    throw new Error("Sync pending Ledger changes before preparing corrections.");
  }
  return createLedgerSettlementTransport().previewCorrection(
    journeyId,
    rootSettlementId,
    input,
  );
}

export async function confirmSettlementCorrection(
  journeyId: string,
  rootSettlementId: string,
  input: SettlementCorrectionConfirmRequest,
  idempotencyKey = createLocalId("settlement-correction"),
) {
  assertReplayFixtureWritable(journeyId);
  const repository = await getDefaultLedgerSettlementRepository();
  if (!(await repository.canFinalize(journeyId))) {
    throw new Error("Organizer settlement access is required.");
  }
  const response = await createLedgerSettlementTransport().confirmCorrection(
    journeyId,
    rootSettlementId,
    input,
    idempotencyKey,
  );
  await repository.applyFinalized(response.entity);
  return response;
}
