import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";

import { createLedgerPersonalPaymentRepository } from "./ledgerPersonalPaymentRepository";

export async function getDefaultLedgerPersonalPaymentRepository() {
  return createLedgerPersonalPaymentRepository(await openDatabase(), requireActiveUserId);
}
