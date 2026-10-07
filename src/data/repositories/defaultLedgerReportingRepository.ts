import { openDatabase, readInitializedDatabase } from "@/data/db/database";
import { requireActiveUserId, requireAdoptedUserId } from "@/data/auth/authRepository";

import { createLedgerReportingRepository } from "./ledgerReportingRepository";

export async function getDefaultLedgerReportingRepository() {
  return createLedgerReportingRepository(await openDatabase(), requireActiveUserId);
}

// Diagnostic presentation never triggers startup or legacy session adoption.
export async function readDiagnosticsDebugMode() {
  const repository = createLedgerReportingRepository(
    await readInitializedDatabase(),
    requireAdoptedUserId,
  );
  return (await repository.getPreferences()).debugMode;
}
