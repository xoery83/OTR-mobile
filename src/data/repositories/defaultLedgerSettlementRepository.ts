import { openDatabase } from "@/data/db/database";

import { createLedgerSettlementRepository } from "./ledgerSettlementRepository";

export async function getDefaultLedgerSettlementRepository() {
  return createLedgerSettlementRepository(await openDatabase());
}
