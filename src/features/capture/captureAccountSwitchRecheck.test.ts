import { expect, it, vi } from "vitest";

import { createAuthRepository } from "@/data/auth/authSessionRepository";
import { createAccountSwitchCoordinator } from "@/data/auth/accountSwitchCoordinator";
import {
  assertAccountRequestGeneration,
  captureAccountRequestContext,
} from "@/data/auth/accountRequestContext";
import type { LocalSession } from "@/domain/auth/localSession";

const session = (userId: string): LocalSession => ({
  identity: { userId, displayName: userId, email: `${userId}@example.test` },
  accessToken: `synthetic-${userId}`,
  refreshToken: `synthetic-refresh-${userId}`,
  expiresAt: "2099-01-01T00:00:00.000Z",
});

async function fixture(restartSync = vi.fn(async () => undefined)) {
  const entries = new Map<string, string>();
  const repository = createAuthRepository({
    getItem: async (key) => entries.get(key) ?? null,
    setItem: async (key, value) => void entries.set(key, value),
    deleteItem: async (key) => void entries.delete(key),
  });
  await repository.writeLocalSession(session("A"));
  await repository.writeLocalSession(session("B"));
  await repository.selectAccount("A");
  const coordinator = createAccountSwitchCoordinator({
    readSession: repository.readLocalSession,
    writeSession: repository.writeLocalSession,
    clearSession: repository.clearLocalSession,
    selectAccount: repository.selectAccount,
    pauseSync: async () => undefined,
    restartSync,
    adoptLocalState: async () => undefined,
    bootstrapAccount: async () => undefined,
    clearInMemoryState: () => undefined,
  });
  return { entries, repository, coordinator };
}

it("real remembered-session boundary switches synthetic A→B→A offline and invalidates old A", async () => {
  const { repository, coordinator } = await fixture();
  const readId = async () => (await repository.readLocalSession())!.identity!.userId;
  const oldA = await captureAccountRequestContext("", readId);
  await coordinator.switchAccount("B");
  expect(await readId()).toBe("B");
  expect(() => assertAccountRequestGeneration(oldA)).toThrow("Account changed");
  await coordinator.switchAccount("A");
  expect(await readId()).toBe("A");
  expect(() => assertAccountRequestGeneration(oldA)).toThrow("Account changed");
  const newA = await captureAccountRequestContext("", readId);
  expect(newA.generation).toBeGreaterThan(oldA.generation);
  expect(() => assertAccountRequestGeneration(newA)).not.toThrow();
});

it("a remembered index with missing synthetic target session rejects and preserves A", async () => {
  const { entries, repository, coordinator } = await fixture();
  entries.delete("otr.mobile.session.v2.B");
  expect((await repository.listAccounts()).some(({ userId }) => userId === "B")).toBe(
    true,
  );
  await expect(coordinator.switchAccount("B")).rejects.toThrow(
    "The selected account is not available on this device.",
  );
  expect((await repository.readLocalSession())!.identity!.userId).toBe("A");
});

it("a synthetic restart failure also rejects after selecting B and recovers A", async () => {
  const restartSync = vi.fn(async () => {
    throw new Error("synthetic restart failure");
  });
  const { repository, coordinator } = await fixture(restartSync);
  await expect(coordinator.switchAccount("B")).rejects.toThrow(
    "synthetic restart failure",
  );
  expect((await repository.readLocalSession())!.identity!.userId).toBe("A");
  expect(restartSync).toHaveBeenCalledTimes(2);
});
