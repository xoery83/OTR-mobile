import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { getAccountGeneration, advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createIncomingInvitationSelection } from "./incomingInvitationSelection";

it("restores the original selected reference after reconstruction and isolates Account B", async () => {
  let active = randomUUID();
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    deleteItem: async (key: string) => { values.delete(key); } };
  const account = async () => active;
  const scope = { accountId: active, generation: getAccountGeneration() };
  const original = { tripId: randomUUID(), inviteId: randomUUID() };
  const first = createIncomingInvitationSelection(storage, account);
  await first.select(scope, original);
  const cold = createIncomingInvitationSelection(storage, account);
  expect(await cold.read(scope)).toEqual(original);
  await expect(cold.select(scope, { ...original, inviteId: randomUUID() })).rejects.toThrow("INCOMING_REFERENCE_PENDING");
  await expect(cold.clear(scope, { ...original, inviteId: randomUUID() })).rejects.toThrow("INCOMING_REFERENCE_CHANGED");
  active = randomUUID(); advanceAccountGeneration();
  await expect(cold.read(scope)).rejects.toThrow();
  expect(await cold.read({ accountId: active, generation: getAccountGeneration() })).toBeNull();
});

it("restores a retained original without requiring the inbox, then permits another after exact clear", async () => {
  const accountId = randomUUID();
  const scope = { accountId, generation: getAccountGeneration() };
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    deleteItem: async (key: string) => { values.delete(key); } };
  const selection = createIncomingInvitationSelection(storage, async () => accountId);
  const first = { tripId: randomUUID(), inviteId: randomUUID() };
  await selection.select(scope, first);
  let calls = 0;
  const unavailable = async () => { calls++; throw Error("INBOX_503"); };
  expect((await selection.open(scope, unavailable)).selected).toEqual(first);
  expect(calls).toBe(0);
  await selection.clear(scope, first);
  const second = { tripId: randomUUID(), inviteId: randomUUID() };
  expect(await selection.open(scope, async () => ({ invitations: [second] }))).toEqual({ scope, selected: null, invitations: [second] });
});
