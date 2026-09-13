import { openDatabase } from "@/data/db/database";
import { createLedgerExportRepository } from "./ledgerExportRepository";

export async function getDefaultLedgerExportRepository() {
  return createLedgerExportRepository(await openDatabase());
}
