import { beforeEach, expect, it, vi } from "vitest";
import { createDayNavigationBookmarkRepository } from "./dayNavigationBookmarkRepository";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let user = a,
  clock = 1000000000000;
const values = new Map<string, string>();
const storage = {
  getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    values.set(key, value);
  }),
};
const hint = {
  tripId: a,
  date: "2027-02-12",
  zone: "",
  anchor: { key: "day:2027-02-12", date: "2027-02-12", within: 12 },
};
const key = `otr-day-bookmarks-v1-${a}`;
const make = () =>
  createDayNavigationBookmarkRepository(
    storage,
    async () => user,
    () => clock,
  );
beforeEach(() => {
  user = a;
  clock = 1000000000000;
  values.clear();
  vi.clearAllMocks();
});
it("round-trips a date-only hint across repository recreation without persisting auth/generation/content", async () => {
  await make().record({
    ...hint,
    generation: 99,
    token: "never",
    title: "never",
    focus: "never",
  } as typeof hint);
  expect(await make().list()).toEqual([hint]);
  expect(JSON.parse(values.get(key)!)).toEqual([{ ...hint, updatedAt: clock }]);
  expect(values.get(key)).not.toMatch(/token|generation|title|focus/);
});
it("partitions accounts, replaces same-Trip hints and removes only the selected Trip", async () => {
  await make().record(hint);
  user = b;
  expect(await make().list()).toEqual([]);
  await make().record({ ...hint, tripId: b });
  user = a;
  await make().record({ ...hint, zone: "Pacific/Auckland" });
  expect(await make().list()).toEqual([{ ...hint, zone: "Pacific/Auckland" }]);
  await make().remove(a);
  expect(await make().list()).toEqual([]);
  user = b;
  expect(await make().list()).toEqual([{ ...hint, tripId: b }]);
});
it("expires old/future hints and rejects malformed data without accessing business storage", async () => {
  await make().record(hint);
  clock += 31 * 86400000;
  expect(await make().list()).toEqual([]);
  values.set(key, JSON.stringify([{ ...hint, updatedAt: clock + 1 }]));
  expect(await make().list()).toEqual([]);
  values.set(key, "bad-json");
  expect(await make().list()).toEqual([]);
});
it.each([
  { tripId: "not-a-trip" },
  { date: "2027-02-30" },
  { zone: "not/a-zone" },
  { anchor: { ...hint.anchor, date: "2027-02-11" } },
  { anchor: { ...hint.anchor, key: "bad\u0000key" } },
  { anchor: { ...hint.anchor, within: Infinity } },
  { anchor: { ...hint.anchor, within: -1 } },
])("does not persist invalid navigation hint %j", async (change) => {
  await make().record({ ...hint, ...change });
  expect(storage.setItemAsync).not.toHaveBeenCalled();
  expect(await make().list()).toEqual([]);
});
it("bounds count and native preference byte size, retaining most recent Trip", async () => {
  for (let n = 1; n <= 12; n++) {
    const tripId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
    await make().record({ ...hint, tripId });
  }
  const rows = await make().list();
  expect(rows.length).toBeLessThanOrEqual(8);
  expect(rows[0].tripId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-000000000012");
  for (const raw of values.values())
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(1800);
});
it("rejects generation changes during reads before applying or writing anything", async () => {
  storage.getItemAsync.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return "[]";
  });
  await expect(make().record(hint)).rejects.toThrow();
  expect(storage.setItemAsync).not.toHaveBeenCalled();
});
it("rejects identity switches during a read, without leaking prior account hints", async () => {
  storage.getItemAsync.mockImplementationOnce(async () => {
    user = b;
    return JSON.stringify([{ ...hint, updatedAt: clock }]);
  });
  await expect(make().list()).rejects.toThrow();
  expect(storage.setItemAsync).not.toHaveBeenCalled();
});
it("tolerates SecureStore failures, never overwriting unread data", async () => {
  await make().record(hint);
  const before = values.get(key);
  storage.getItemAsync.mockRejectedValueOnce(new Error("locked"));
  expect(await make().record({ ...hint, zone: "Pacific/Auckland" })).toEqual([]);
  expect(values.get(key)).toBe(before);
  storage.setItemAsync.mockRejectedValueOnce(new Error("unavailable"));
  expect(await make().record({ ...hint, zone: "Pacific/Auckland" })).toEqual([]);
  expect(values.get(key)).toBe(before);
});
