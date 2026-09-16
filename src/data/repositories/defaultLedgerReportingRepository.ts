import { openDatabase } from "@/data/db/database";
import { requireActiveUserId } from "@/data/auth/authRepository";

import { createLedgerReportingRepository } from "./ledgerReportingRepository";

export async function getDefaultLedgerReportingRepository() {
  return createLedgerReportingRepository(await openDatabase(), requireActiveUserId);
}
