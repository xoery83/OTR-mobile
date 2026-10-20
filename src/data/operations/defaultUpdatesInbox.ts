import { requireActiveUserId } from "@/data/auth/authRepository";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { openDatabase } from "@/data/db/database";
import { captureStorageDependencies } from "@/data/repositories/defaultLocalCaptureInboxRepository";
import { createCaptureSubmissionTransactionStore } from "@/data/repositories/captureSubmissionRepository";
import { createUpdatesInboxRepository } from "@/data/repositories/updatesInboxRepository";

// Capture before database initialization; callers retain this same scope for open/read.
export async function openDefaultUpdatesInbox() {
  const context = await captureAccountRequestContext("", requireActiveUserId);
  const database = await openDatabase();
  const source = createCaptureSubmissionTransactionStore(
    database,
    captureStorageDependencies,
  );
  return {
    context,
    repository: createUpdatesInboxRepository(database, requireActiveUserId, source),
  };
}
