import { openDatabase } from "@/data/db/database";

import { createLedgerReviewRepository } from "./ledgerReviewRepository";

export async function getDefaultLedgerReviewRepository() {
  return createLedgerReviewRepository(await openDatabase());
}
