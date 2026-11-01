import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createTripPersonEditorDraft } from "./tripPersonEditorDraft";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";

async function fixture() {
  const values = new Map<string, string>();
  const original = randomUUID();
  let accountId = original;
  const account = async () => accountId;
  const tripId = randomUUID();
  const storage = {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    deleteItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  return {
    values,
    storage,
    original,
    account,
    tripId,
    scope: await captureAccountRequestContext(tripId, account),
    store: createTripPersonEditorDraft(storage, account),
    reopen: () => createTripPersonEditorDraft(storage, account),
    switch(id = randomUUID()) {
      accountId = id;
      advanceAccountGeneration();
    },
  };
}

it("restores raw private text after data-source recreation without claiming Person creation", async () => {
  const f = await fixture();
  await f.store.saveName(f.scope, "  林 e\u0301  ");
  const restored = await f.reopen().read(f.scope);
  expect(restored).toEqual({
    version: 1,
    accountId: f.original,
    tripId: f.tripId,
    displayName: "  林 e\u0301  ",
    attempt: null,
  });
  expect(restored).not.toHaveProperty("connected");
  expect(f.storage.deleteItem).not.toHaveBeenCalled();
});

it("retains the exact Person/operation/name after UNKNOWN, never a name-derived identity", async () => {
  const f = await fixture();
  await f.store.saveName(f.scope, " 同名 ");
  const attempt = {
    operationId: randomUUID(),
    personId: randomUUID(),
    displayName: "同名",
  };
  await f.store.retainAttempt(f.scope, attempt);
  expect((await f.reopen().read(f.scope))?.attempt).toEqual(attempt);
  expect(await f.store.retainAttempt(f.scope, attempt)).toMatchObject({ attempt });
  const before = [...f.values];
  await expect(f.store.saveName(f.scope, "another name")).rejects.toThrow("FROZEN");
  await expect(
    f.store.retainAttempt(f.scope, { ...attempt, personId: randomUUID() }),
  ).rejects.toThrow("COLLISION");
  await expect(f.store.discard(f.scope)).rejects.toThrow("RECOVERY");
  await expect(f.store.complete(f.scope, randomUUID())).rejects.toThrow("MISMATCH");
  expect([...f.values]).toEqual(before);
});

it("isolates Account/Trip keys and rejects old A→B→A generations", async () => {
  const f = await fixture();
  await f.store.saveName(f.scope, "Private A");
  f.switch();
  const b = await captureAccountRequestContext(f.tripId, f.account);
  expect(await f.store.read(b)).toBeNull();
  await f.store.saveName(b, "Private B");
  expect(
    await f.store.read(await captureAccountRequestContext(randomUUID(), f.account)),
  ).toBeNull();
  await expect(f.store.read(f.scope)).rejects.toThrow("Account changed");
  f.switch(f.original);
  await expect(f.store.read(f.scope)).rejects.toThrow("Account changed");
  expect(
    (await f.store.read(await captureAccountRequestContext(f.tripId, f.account)))
      ?.displayName,
  ).toBe("Private A");
});

it("preserves corrupted/foreign records rather than deleting or returning them", async () => {
  const f = await fixture();
  await f.store.saveName(f.scope, "Private");
  const [key, raw] = [...f.values][0];
  f.values.set(key, JSON.stringify({ ...JSON.parse(raw), accountId: randomUUID() }));
  await expect(f.store.read(f.scope)).rejects.toThrow("CONTEXT_MISMATCH");
  f.values.set(key, "invalid json");
  await expect(f.store.read(f.scope)).rejects.toThrow();
  expect(f.values.get(key)).toBe("invalid json");
  expect(f.storage.deleteItem).not.toHaveBeenCalled();
});

it("does not claim durable preparation after storage failure and keeps the original bytes", async () => {
  const f = await fixture();
  await f.store.saveName(f.scope, "Kept");
  const before = [...f.values];
  f.storage.setItem.mockRejectedValueOnce(Error("LOCAL_WRITE_UNKNOWN"));
  await expect(
    f.store.retainAttempt(f.scope, {
      operationId: randomUUID(),
      personId: randomUUID(),
      displayName: "Kept",
    }),
  ).rejects.toThrow("LOCAL_WRITE_UNKNOWN");
  expect([...f.values]).toEqual(before);
});

it("clears only the exact completed intent, with idempotent cleanup", async () => {
  const f = await fixture();
  await f.store.saveName(f.scope, "Traveler");
  const attempt = {
    operationId: randomUUID(),
    personId: randomUUID(),
    displayName: "Traveler",
  };
  await f.store.retainAttempt(f.scope, attempt);
  await f.store.complete(f.scope, attempt.operationId);
  await f.store.complete(f.scope, attempt.operationId);
  expect(await f.store.read(f.scope)).toBeNull();
  expect(f.storage.deleteItem).toHaveBeenCalledOnce();
});
