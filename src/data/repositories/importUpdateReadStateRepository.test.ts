import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import {
  readImportUpdateVersions,
  markImportUpdateVersionRead,
} from "./importUpdateReadStateRepository";
const state = vi.hoisted(() => ({
  account: "",
  values: new Map<string, string>(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: state.get,
  setItemAsync: state.set,
}));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: async () => state.account,
}));
beforeEach(() => {
  state.account = randomUUID();
  state.values.clear();
  state.get
    .mockReset()
    .mockImplementation(async (key: string) => state.values.get(key) ?? null);
  state.set.mockReset().mockImplementation(async (key: string, value: string) => {
    state.values.set(key, value);
  });
});
it("read versions survive repository reentry and isolate Accounts and Batch identities", async () => {
  const first = randomUUID(),
    other = randomUUID();
  const context = await captureAccountRequestContext("", async () => state.account);
  await markImportUpdateVersionRead(context, first, "review:version1");
  expect(await readImportUpdateVersions(context, [first, other])).toEqual({
    [first]: "review:version1",
    [other]: null,
  });
  state.account = randomUUID();
  const next = await captureAccountRequestContext("", async () => state.account);
  expect(await readImportUpdateVersions(next, [first])).toEqual({ [first]: null });
  await expect(markImportUpdateVersionRead(context, first, "resolved")).rejects.toThrow();
  expect(state.values.size).toBe(1);
});
it("late generation change cannot expose a previous Account read preference", async () => {
  const id = randomUUID(),
    context = await captureAccountRequestContext("", async () => state.account);
  state.get.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return "old";
  });
  await expect(readImportUpdateVersions(context, [id])).rejects.toThrow();
});
