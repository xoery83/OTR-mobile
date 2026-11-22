import { requireActiveUserId } from "../auth/authRepository";
import { openDatabase } from "../db/database";
import {
  captureStorageDependencies,
  getDefaultLocalCaptureInboxRepository,
} from "../repositories/defaultLocalCaptureInboxRepository";
import {
  createImportDocumentsLocalWriter,
  createImportDocumentsRepository,
} from "../repositories/importDocumentsRepository";

export async function getDefaultImportDocumentsRepository() {
  return createImportDocumentsRepository(
    await openDatabase(),
    requireActiveUserId,
    await getDefaultLocalCaptureInboxRepository(),
  );
}

export async function getDefaultImportDocumentsLocalWriter() {
  return createImportDocumentsLocalWriter(
    await openDatabase(),
    requireActiveUserId,
    captureStorageDependencies,
  );
}
