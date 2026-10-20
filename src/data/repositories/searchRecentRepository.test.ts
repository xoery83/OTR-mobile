import { beforeEach, expect, it, vi } from "vitest";
import { createSearchRecentRepository } from "./searchRecentRepository";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let user = a;
const values = new Map<string, string>();
const storage = {
  getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    values.set(key, value);
  }),
};
const repo = createSearchRecentRepository(storage, async () => user);
beforeEach(() => {
  user = a;
  values.clear();
  vi.clearAllMocks();
});
it("persists newest eight query+scope only, deduplicates and survives a new repository instance", async () => {
  for (let n = 0; n < 10; n++) await repo.record({ query: `Trip ${n}`, tripId: null });
  await repo.record({ query: " trip 9 ", tripId: null });
  const rows = await createSearchRecentRepository(storage, async () => user).list();
  expect(rows).toHaveLength(8);
  expect(rows[0]).toEqual({ query: "trip 9", tripId: null });
  expect(rows.at(-1)?.query).toBe("Trip 2");
  expect(Object.keys(rows[0]).sort()).toEqual(["query", "tripId"]);
});
it("partitions accounts and keeps fixed entry scope; remove and clear stay local", async () => {
  await repo.record({ query: "Tokyo", tripId: a });
  await repo.record({ query: "Tokyo", tripId: null });
  user = b;
  expect(await repo.list()).toEqual([]);
  await repo.record({ query: "Private", tripId: b });
  user = a;
  expect(await repo.list()).toHaveLength(2);
  await repo.remove({ query: "Tokyo", tripId: a });
  expect(await repo.list()).toEqual([{ query: "Tokyo", tripId: null }]);
  await repo.clear();
  expect(await repo.list()).toEqual([]);
  user = b;
  expect((await repo.list())[0].query).toBe("Private");
});
it("rejects account-generation changes during preference read without writing", async () => {
  storage.getItemAsync.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return "[]";
  });
  await expect(repo.record({ query: "old", tripId: null })).rejects.toThrow();
  expect(storage.setItemAsync).not.toHaveBeenCalled();
});
it("rejects malformed scopes, corrupt preferences and oversized searches; bounds native preference bytes", async () => {
  await repo.record({ query: "x".repeat(121), tripId: null });
  expect(await repo.list()).toEqual([]);
  await repo.record({ query: "Trip", tripId: "invalid" });
  expect(await repo.list()).toEqual([]);
  values.set(`otr-search-recents-v1-${a}`, "broken");
  expect(await repo.list()).toEqual([]);
  for (let n = 0; n < 8; n++)
    await repo.record({ query: "旅".repeat(110) + n, tripId: a });
  for (const value of values.values())
    expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(1800);
});
