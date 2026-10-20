import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";

import { createLedgerFxSnapshotRepository } from "./ledgerFxSnapshotRepository";

export async function getDefaultLedgerFxSnapshotRepository(ownerUserId?: string) {
  const accountId = ownerUserId ?? (await requireActiveUserId());
  return createLedgerFxSnapshotRepository(await openDatabase(), async () => accountId);
}
