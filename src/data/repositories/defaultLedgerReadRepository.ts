import { openDatabase } from "@/data/db/database";

import { createLedgerReadRepository } from "./ledgerReadRepository";

export async function getDefaultLedgerReadRepository() {
  return createLedgerReadRepository(await openDatabase());
}
