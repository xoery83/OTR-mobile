import { requireActiveUserId } from "../auth/authRepository";
import { openDatabase } from "../db/database";
import { getDefaultLocalCaptureInboxRepository } from "../repositories/defaultLocalCaptureInboxRepository";
import { createImportDocumentsRepository } from "../repositories/importDocumentsRepository";

export async function getDefaultImportDocumentsRepository() {
  return createImportDocumentsRepository(
    await openDatabase(),
    requireActiveUserId,
    await getDefaultLocalCaptureInboxRepository(),
  );
}
