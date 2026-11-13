import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { loadTripPersonEditorDraft } from "./tripPersonEditorDraft";
import { requireAdoptedUserId } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";

const values = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    values.delete(key);
  },
}));
vi.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: {}, digestStringAsync: vi.fn() }));
vi.mock("@/data/auth/authRepository", () => ({ requireAdoptedUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
const database = {
  getFirstAsync: vi.fn(),
  getAllAsync: vi.fn(),
  runAsync: vi.fn(),
  withTransactionAsync: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  values.clear();
  vi.mocked(readInitializedDatabase).mockResolvedValue(database as never);
});

it("binds the existing repository's private editor to the exact Account/Trip without SQL or Cloud create", async () => {
  const id = randomUUID();
  vi.mocked(requireAdoptedUserId).mockResolvedValue(id);
  const scope = await captureAccountRequestContext(randomUUID(), requireAdoptedUserId);
  const port = await loadTripPersonEditorDraft(scope);
  expect(Object.isFrozen(port.context)).toBe(true);
  await port.saveName("Native draft 林 e\u0301");
  const reopened = await loadTripPersonEditorDraft(scope);
  expect((await reopened.read())?.displayName).toBe("Native draft 林 e\u0301");
  expect(database.runAsync).not.toHaveBeenCalled();
  expect(database.getFirstAsync).not.toHaveBeenCalled();
});

it("rejects old scope before initialization and isolates a new Account", async () => {
  const id = randomUUID();
  vi.mocked(requireAdoptedUserId).mockResolvedValue(id);
  const scope = await captureAccountRequestContext(randomUUID(), requireAdoptedUserId);
  const old = await loadTripPersonEditorDraft(scope);
  await old.saveName("Private A");
  vi.mocked(readInitializedDatabase).mockClear();
  advanceAccountGeneration();
  vi.mocked(requireAdoptedUserId).mockResolvedValue(randomUUID());
  await expect(loadTripPersonEditorDraft(scope)).rejects.toThrow("Account changed");
  expect(readInitializedDatabase).not.toHaveBeenCalled();
  const b = await loadTripPersonEditorDraft(
    await captureAccountRequestContext(scope.tripId, requireAdoptedUserId),
  );
  expect(await b.read()).toBeNull();
  await expect(old.read()).rejects.toThrow("Account changed");
});
