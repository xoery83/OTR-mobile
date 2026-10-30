import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createAuthRepository } from "./authSessionRepository";
import { createAccountSwitchCoordinator } from "./accountSwitchCoordinator";
import {
  assertAccountTransitionLease,
  beginAccountTransition,
  endAccountTransition,
} from "./accountRequestContext";

async function fixture() {
  const guest = randomUUID(),
    account = randomUUID();
  const binding = {
    sourceGuestLocalId: guest,
    targetAccountId: account,
    adoptionId: randomUUID(),
  };
  const entries = new Map<string, string>([
    [
      "otr.mobile.launch.v1",
      JSON.stringify({ version: 1, kind: "GUEST", localId: guest }),
    ],
  ]);
  const setItem = vi.fn(async (key: string, value: string) => {
    entries.set(key, value);
  });
  const storage = {
    getItem: async (key: string) => entries.get(key) ?? null,
    setItem,
    deleteItem: async (key: string) => {
      entries.delete(key);
    },
  };
  const qualifyLocalCache = vi.fn(
    async (lease: Parameters<typeof assertAccountTransitionLease>[0]) => {
      assertAccountTransitionLease(lease);
    },
  );
  // This local fixture isolates promotion; it is not server publication evidence.
  const preparePublishedGuest = vi.fn(async () => ({
    binding: { ...binding },
    qualifyLocalCache,
  }));
  const repository = createAuthRepository(storage, undefined, { preparePublishedGuest });
  const session = {
    accessToken: `e30.${btoa(JSON.stringify({ sub: account }))}.fixture`,
    refreshToken: "local-unit-fixture",
    expiresAt: "2099-01-01T00:00:00Z",
    identity: { userId: account, displayName: "", email: null },
  };
  await repository.guestVerification.store(binding, session);
  setItem.mockClear();
  const clearSession = vi.fn(repository.clearLocalSession);
  const coordinator = createAccountSwitchCoordinator({
    pauseSync: async () => {},
    restartSync: async () => {},
    readSession: repository.readAdoptedLocalSession,
    writeSession: repository.writeLocalSession,
    prepareSessionInstall: repository.prepareSessionInstall,
    clearSession,
    selectAccount: repository.selectAccount,
    adoptLocalState: async () => {},
    clearInMemoryState: async () => {},
    bootstrapAccount: async () => {},
  });
  return {
    entries,
    storage,
    setItem,
    binding,
    account,
    guest,
    session,
    repository,
    preparePublishedGuest,
    qualifyLocalCache,
    coordinator,
    clearSession,
  };
}
it("promotes the existing verified slot after owning cache qualification and cold-restores the Account", async () => {
  const f = await fixture();
  const slot = `otr.mobile.session.v2.${f.account}`,
    original = f.entries.get(slot);
  await f.coordinator.activateSession(f.session);
  expect(f.qualifyLocalCache).toHaveBeenCalledOnce();
  expect(f.entries.get(slot)).toBe(original);
  expect(f.setItem.mock.calls.map(([key]) => key)).toEqual([
    "otr.mobile.accounts.v2",
    "otr.mobile.launch.v1",
  ]);
  expect(await createAuthRepository(f.storage).readCommittedLocalPrincipal()).toEqual({
    kind: "ACCOUNT",
    accountId: f.account,
  });
});
it("keeps Guest and its canonical credential when owning cache readiness fails", async () => {
  const f = await fixture();
  f.qualifyLocalCache.mockRejectedValueOnce(Error("CORE_TRANSITION_CACHE_STALE"));
  await expect(f.coordinator.activateSession(f.session)).rejects.toThrow("CACHE_STALE");
  expect(await f.repository.readCommittedLocalPrincipal()).toEqual({
    kind: "GUEST",
    localId: f.guest,
  });
  expect(f.entries.has(`otr.mobile.session.v2.${f.account}`)).toBe(true);
  expect(f.clearSession).not.toHaveBeenCalled();
});
it.each(["target", "guest"])(
  "rejects a prepared %s mismatch before index publication",
  async (field) => {
    const f = await fixture();
    f.preparePublishedGuest.mockImplementationOnce(async () => ({
      binding: {
        ...f.binding,
        ...(field === "target"
          ? { targetAccountId: randomUUID() }
          : { sourceGuestLocalId: randomUUID() }),
      },
      qualifyLocalCache: f.qualifyLocalCache,
    }));
    await expect(f.coordinator.activateSession(f.session)).rejects.toThrow(
      "TARGET_MISMATCH",
    );
    expect(f.entries.has("otr.mobile.accounts.v2")).toBe(false);
  },
);
it.each(["REVOKING", "REVOKED", "PERSISTING"])(
  "does not promote provisional credential phase %s",
  async (phase) => {
    const f = await fixture();
    const key = `otr.mobile.guest-verification.v1.${f.guest}`;
    f.entries.set(key, JSON.stringify({ ...JSON.parse(f.entries.get(key)!), phase }));
    await expect(f.coordinator.activateSession(f.session)).rejects.toThrow(
      "VERIFICATION_REQUIRED",
    );
    expect(f.entries.has("otr.mobile.accounts.v2")).toBe(false);
  },
);
it("requires the original real transition lease for provisional credential access", async () => {
  const f = await fixture(),
    lease = await beginAccountTransition();
  try {
    await expect(
      f.repository.guestVerification.readForTransition(f.binding, lease),
    ).resolves.toMatchObject({ status: "SESSION" });
    await expect(
      f.repository.guestVerification.readForTransition(
        { ...f.binding, targetAccountId: randomUUID() },
        lease,
      ),
    ).rejects.toThrow("BINDING_MISMATCH");
  } finally {
    endAccountTransition(lease);
  }
  await expect(
    f.repository.guestVerification.readForTransition(f.binding, lease),
  ).rejects.toThrow();
});
