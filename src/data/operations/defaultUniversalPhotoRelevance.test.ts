import { beforeEach, expect, it, vi } from "vitest";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
} from "../auth/accountRequestContext";
import { createDefaultUniversalPhotoRelevanceActions } from "./defaultUniversalPhotoRelevance";

const f = vi.hoisted(() => ({
  account: "11111111-1111-4111-8111-111111111111",
  getAccountId: vi.fn(),
  open: vi.fn(),
  database: { getFirstAsync: vi.fn() },
  captures: { getForSourceHandoff: vi.fn() },
  submissions: { reopen: vi.fn() },
  captureFactory: vi.fn(),
  submissionFactory: vi.fn(),
  repository: vi.fn(),
  decisions: { read: vi.fn(), save: vi.fn() },
  actionsFactory: vi.fn(),
  actions: {},
  extract: vi.fn(),
  storage: { newId: vi.fn(), now: vi.fn(), sha256: vi.fn() },
}));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: f.getAccountId,
}));
vi.mock("../db/database", () => ({ openDatabase: f.open }));
vi.mock("../repositories/defaultLocalCaptureInboxRepository", () => ({
  getDefaultLocalCaptureInboxRepository: f.captureFactory,
  captureStorageDependencies: f.storage,
}));
vi.mock("./defaultCaptureSubmission", () => ({
  getDefaultCaptureSubmissionRepository: f.submissionFactory,
}));
vi.mock("../repositories/capturePhotoImportDecisionRepository", () => ({
  createCapturePhotoImportDecisionRepository: f.repository,
}));
vi.mock("./universalPhotoRelevanceActions", () => ({
  createUniversalPhotoRelevanceActions: f.actionsFactory,
}));
vi.mock("@/native/captureLocalExtraction", () => ({
  extractCaptureLocal: f.extract,
}));
beforeEach(() => {
  vi.resetAllMocks();
  f.account = "11111111-1111-4111-8111-111111111111";
  f.getAccountId.mockImplementation(async () => f.account);
  f.open.mockResolvedValue(f.database);
  f.database.getFirstAsync.mockResolvedValue({ present: 1 });
  f.captureFactory.mockResolvedValue(f.captures);
  f.submissionFactory.mockResolvedValue(f.submissions);
  f.repository.mockReturnValue(f.decisions);
  f.actionsFactory.mockReturnValue(f.actions);
});
const context = () => captureAccountRequestContext("", f.getAccountId);
it("constructs existing local dependencies explicitly without OCR, queue or Provider execution", async () => {
  const c = await context();
  const controller = new AbortController();
  expect(await createDefaultUniversalPhotoRelevanceActions(c, controller.signal)).toBe(
    f.actions,
  );
  expect(f.repository).toHaveBeenCalledWith(f.database, f.getAccountId, f.storage);
  expect(f.actionsFactory).toHaveBeenCalledWith(
    c,
    {
      getAccountId: f.getAccountId,
      captures: f.captures,
      submissions: f.submissions,
      decisions: f.decisions,
      hash: f.storage.sha256,
      extract: f.extract,
    },
    controller.signal,
  );
  expect(f.extract).not.toHaveBeenCalled();
  expect(f.decisions.save).not.toHaveBeenCalled();
});
it("fails closed without the installed local decision table and does not install it", async () => {
  f.database.getFirstAsync.mockResolvedValueOnce(null);
  await expect(
    createDefaultUniversalPhotoRelevanceActions(await context()),
  ).rejects.toThrow("PHOTO_IMPORT_LOCAL_STATE_UNAVAILABLE");
  expect(f.captureFactory).not.toHaveBeenCalled();
  expect(f.repository).not.toHaveBeenCalled();
});
it("rejects an unsupported local identity before opening storage, without creating adoption data", async () => {
  f.account = "local-guest:not-a-normal-Account";
  await expect(
    createDefaultUniversalPhotoRelevanceActions(await context()),
  ).rejects.toThrow("PHOTO_IMPORT_ACCOUNT_UNAVAILABLE");
  expect(f.open).not.toHaveBeenCalled();
});
it("binds Account before database initialization and rejects a switch during the await", async () => {
  const c = await context();
  f.open.mockImplementationOnce(async () => {
    f.account = "22222222-2222-4222-8222-222222222222";
    return f.database;
  });
  await expect(createDefaultUniversalPhotoRelevanceActions(c)).rejects.toThrow(
    "Account changed",
  );
  expect(f.database.getFirstAsync).not.toHaveBeenCalled();
});
it("rejects a real same-Account generation transition during initialization", async () => {
  const c = await context();
  f.open.mockImplementationOnce(async () => {
    const lease = await beginAccountTransition();
    endAccountTransition(lease);
    return f.database;
  });
  await expect(createDefaultUniversalPhotoRelevanceActions(c)).rejects.toThrow(
    "Account changed",
  );
  expect(f.repository).not.toHaveBeenCalled();
});
it("withholds canceled initialization before any factory is exposed", async () => {
  const c = await context();
  const controller = new AbortController();
  f.open.mockImplementationOnce(async () => {
    controller.abort();
    return f.database;
  });
  await expect(
    createDefaultUniversalPhotoRelevanceActions(c, controller.signal),
  ).rejects.toThrow("PHOTO_IMPORT_CANCELLED");
  expect(f.actionsFactory).not.toHaveBeenCalled();
  expect(f.captureFactory).not.toHaveBeenCalled();
});
