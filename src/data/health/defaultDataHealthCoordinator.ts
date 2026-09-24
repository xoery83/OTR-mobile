import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { resolveReceiptFile } from "@/data/files/receiptFileStore";

import { createDataHealthCoordinator } from "./dataHealthCoordinator";

export async function getDefaultDataHealthCoordinator() {
  return createDataHealthCoordinator({
    database: await openDatabase(),
    getActiveAccountId: requireActiveUserId,
    getAccountGeneration,
    fileExists: async (uri) => {
      try {
        return resolveReceiptFile(uri).exists;
      } catch {
        return null;
      }
    },
  });
}
