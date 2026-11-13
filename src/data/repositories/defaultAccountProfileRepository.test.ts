import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDefaultAccountPrivateProfileEditor } from "./defaultAccountProfileRepository";
import { requireAdoptedUserId } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { privateProfileDraft } from "@/domain/auth/privateAccountProfile";

vi.mock("@/data/auth/authRepository", () => ({ requireAdoptedUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const database = {
  getFirstAsync: vi.fn(async () => null),
  runAsync: vi.fn(async () => ({})),
  withTransactionAsync: vi.fn(async (work: () => Promise<void>) => work()),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdoptedUserId).mockResolvedValue(a);
  vi.mocked(readInitializedDatabase).mockResolvedValue(database as never);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("UNEXPECTED_NETWORK");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("opens the existing Account-scoped local editor without network or migration", async () => {
  const editor = await getDefaultAccountPrivateProfileEditor();
  expect(editor.scope.accountId).toBe(a);
  expect(Object.isFrozen(editor.scope)).toBe(true);
  await editor.local.saveDraft(editor.scope, privateProfileDraft());
  expect(database.runAsync).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not open a database for a Guest or uncommitted Account", async () => {
  vi.mocked(requireAdoptedUserId).mockRejectedValueOnce(Error("NO_COMMITTED_ACCOUNT"));
  await expect(getDefaultAccountPrivateProfileEditor()).rejects.toThrow();
  expect(readInitializedDatabase).not.toHaveBeenCalled();
});

it("rejects an Account switch while the startup database resolves", async () => {
  vi.mocked(readInitializedDatabase).mockImplementationOnce(async () => {
    advanceAccountGeneration();
    vi.mocked(requireAdoptedUserId).mockResolvedValue(b);
    return database as never;
  });
  await expect(getDefaultAccountPrivateProfileEditor()).rejects.toThrow(
    "Account changed",
  );
  expect(database.getFirstAsync).not.toHaveBeenCalled();
  expect(database.runAsync).not.toHaveBeenCalled();
});

it("creates a fresh B editor and fences retained A callbacks", async () => {
  const old = await getDefaultAccountPrivateProfileEditor();
  advanceAccountGeneration();
  vi.mocked(requireAdoptedUserId).mockResolvedValue(b);
  const current = await getDefaultAccountPrivateProfileEditor();
  expect(current.scope.accountId).toBe(b);
  await expect(old.local.saveDraft(old.scope, privateProfileDraft())).rejects.toThrow();
  await current.local.read(current.scope);
  expect(database.runAsync).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
