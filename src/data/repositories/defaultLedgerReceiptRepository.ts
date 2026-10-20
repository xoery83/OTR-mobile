import { openDatabase } from "@/data/db/database";
import { createLedgerReceiptRepository } from "./ledgerReceiptRepository";

export async function getDefaultLedgerReceiptRepository() {
  return createLedgerReceiptRepository(await openDatabase());
}
