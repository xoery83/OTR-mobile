import { openDatabase } from "@/data/db/database";

import { createLedgerExpenseRepository } from "./ledgerExpenseRepository";

export async function getDefaultLedgerExpenseRepository() {
  return createLedgerExpenseRepository(await openDatabase());
}
