import { openDatabase } from "@/data/db/database";
import { requireActiveUserId } from "@/data/auth/authRepository";

import { createLedgerReadRepository } from "./ledgerReadRepository";

export async function getDefaultLedgerReadRepository() {
  return createLedgerReadRepository(await openDatabase(), requireActiveUserId);
}
