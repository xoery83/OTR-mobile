import { openDatabase } from "@/data/db/database";

import { createLedgerReportingRepository } from "./ledgerReportingRepository";

export async function getDefaultLedgerReportingRepository() {
  return createLedgerReportingRepository(await openDatabase());
}
