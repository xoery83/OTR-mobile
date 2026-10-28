import { describe, expect, it } from "vitest";

import { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";

function createMemoryStorage(): SecureSessionStorage {
  const entries = new Map<string, string>();

  return {
    async getItem(key) {
      return entries.get(key) ?? null;
    },
    async setItem(key, value) {
      entries.set(key, value);
    },
    async deleteItem(key) {
      entries.delete(key);
    },
  };
}

const accountA = {
  userId: "00000000-0000-4000-8000-000000000001",
  displayName: "Account A",
  email: "a@example.test",
};

const accountB = {
  userId: "00000000-0000-4000-8000-000000000002",
  displayName: "Account B",
  email: "b@example.test",
};

function session(identity = accountA) {
  return {
    accessToken: `access-${identity.userId}`,
    refreshToken: `refresh-${identity.userId}`,
    expiresAt: "2026-09-09T00:00:00.000Z",
    identity,
  };
}

function jwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "none" })}.${encode(payload)}.`;
}

describe("auth repository", () => {
  const readonlyStorage = (storage: SecureSessionStorage): SecureSessionStorage => ({
    ...storage,
    setItem: async () => {
      throw new Error("READ_MUST_NOT_WRITE");
    },
    deleteItem: async () => {
      throw new Error("READ_MUST_NOT_DELETE");
    },
  });
  it("observes an unchosen principal without selecting Guest or blocking formal sign-in", async () => {
    const storage = createMemoryStorage();
    await expect(
      createAuthRepository(readonlyStorage(storage)).readCommittedLocalPrincipal(),
    ).resolves.toBeNull();
    await createAuthRepository(storage).writeLocalSession(session(accountA));
    await expect(
      createAuthRepository(readonlyStorage(storage)).readCommittedLocalPrincipal(),
    ).resolves.toEqual({ kind: "ACCOUNT", accountId: accountA.userId });
  });
  it("restores a previously chosen Guest without promoting it to an Account or adopting data", async () => {
    const storage = createMemoryStorage();
    const writer = createAuthRepository(storage, () => "guest-local-id");
    const chosen = await writer.readLocalAuthSnapshot();
    expect(chosen.principal).toEqual({ kind: "GUEST", localId: "guest-local-id" });
    const before = await storage.getItem("otr.mobile.launch.v1");
    const reader = createAuthRepository(readonlyStorage(storage));
    await expect(reader.readCommittedLocalPrincipal()).resolves.toEqual(chosen.principal);
    await expect(reader.readAdoptedLocalSession()).resolves.toBeNull();
    await expect(writer.writeLocalSession(session(accountB))).rejects.toThrow(
      "GUEST_ADOPTION_PREFLIGHT_REQUIRED",
    );
    expect(await storage.getItem("otr.mobile.launch.v1")).toBe(before);
    expect(await storage.getItem("otr.mobile.accounts.v2")).toBeNull();
  });
  it("does not turn explicit logout into a fresh Guest", async () => {
    const storage = createMemoryStorage();
    const writer = createAuthRepository(storage);
    await writer.writeLocalSession(session(accountA));
    await writer.clearLocalSession();
    await expect(
      createAuthRepository(readonlyStorage(storage)).readCommittedLocalPrincipal(),
    ).resolves.toEqual({ kind: "SIGNED_OUT" });
  });
  it.each([null, JSON.stringify({ version: 1, kind: "GUEST", localId: "guest" })])(
    "cannot hide a broken Account index behind an unchosen or Guest state",
    async (marker) => {
      const storage = createMemoryStorage();
      await storage.setItem("otr.mobile.accounts.v2", "broken");
      if (marker) await storage.setItem("otr.mobile.launch.v1", marker);
      await expect(
        createAuthRepository(readonlyStorage(storage)).readCommittedLocalPrincipal(),
      ).rejects.toThrow("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
      expect(await storage.getItem("otr.mobile.accounts.v2")).toBe("broken");
      expect(await storage.getItem("otr.mobile.launch.v1")).toBe(marker);
    },
  );
  it.each([
    {},
    { activeUserId: null, accounts: [null] },
    { activeUserId: accountA.userId, accounts: [] },
    { activeUserId: null, accounts: [accountA, accountA] },
  ])(
    "rejects malformed or contradictory index routing fields without changing them",
    async (value) => {
      const storage = createMemoryStorage();
      const raw = JSON.stringify(value);
      await storage.setItem("otr.mobile.accounts.v2", raw);
      await expect(
        createAuthRepository(readonlyStorage(storage)).readCommittedLocalPrincipal(),
      ).rejects.toThrow("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
      expect(await storage.getItem("otr.mobile.accounts.v2")).toBe(raw);
    },
  );
  it("keeps prior Account evidence distinct from an unchosen or Guest workspace", async () => {
    const storage = createMemoryStorage();
    await storage.setItem(
      "otr.mobile.accounts.v2",
      JSON.stringify({ activeUserId: null, accounts: [accountA] }),
    );
    const reader = createAuthRepository(readonlyStorage(storage));
    await expect(reader.readCommittedLocalPrincipal()).resolves.toEqual({
      kind: "SIGNED_OUT",
    });
    await storage.setItem(
      "otr.mobile.launch.v1",
      JSON.stringify({ version: 1, kind: "GUEST", localId: accountA.userId }),
    );
    await expect(reader.readCommittedLocalPrincipal()).rejects.toThrow(
      "LOCAL_PRINCIPAL_RECOVERY_REQUIRED",
    );
  });
  it("keeps cached Account access independent from a corrupt Guest marker", async () => {
    const storage = createMemoryStorage();
    await createAuthRepository(storage).writeLocalSession(session(accountA));
    await storage.setItem("otr.mobile.launch.v1", "broken");
    await expect(
      createAuthRepository(readonlyStorage(storage)).readCommittedLocalPrincipal(),
    ).resolves.toEqual({ kind: "ACCOUNT", accountId: accountA.userId });
    expect(await storage.getItem("otr.mobile.launch.v1")).toBe("broken");
  });
  it.each([
    "broken",
    JSON.stringify({ version: 1, kind: "ACCOUNT", accountId: accountB.userId }),
  ])(
    "rejects an unreadable or Account-shaped Guest marker without overwriting it",
    async (raw) => {
      const storage = createMemoryStorage();
      await storage.setItem("otr.mobile.launch.v1", raw);
      await expect(
        createAuthRepository(readonlyStorage(storage)).readCommittedLocalPrincipal(),
      ).rejects.toThrow("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
      expect(await storage.getItem("otr.mobile.launch.v1")).toBe(raw);
      expect(await storage.getItem("otr.mobile.accounts.v2")).toBeNull();
    },
  );
  it("leaves legacy credential adoption to startup before observing any principal", async () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify(session(accountA));
    await storage.setItem("otr.mobile.session.v1", raw);
    await expect(
      createAuthRepository(readonlyStorage(storage)).readCommittedLocalPrincipal(),
    ).rejects.toThrow("SESSION_NOT_ADOPTED");
    expect(await storage.getItem("otr.mobile.session.v1")).toBe(raw);
    expect(await storage.getItem("otr.mobile.launch.v1")).toBeNull();
  });
  it("account-only observation does not create a Guest or block fresh formal login", async () => {
    const storage = createMemoryStorage();
    const repository = createAuthRepository(storage);
    await expect(repository.readAdoptedLocalSession()).resolves.toBeNull();
    expect(await storage.getItem("otr.mobile.launch.v1")).toBeNull();
    await repository.writeLocalSession(session(accountA));
    await expect(repository.readAdoptedLocalSession()).resolves.toEqual(
      session(accountA),
    );
  });

  it("account-only observation leaves legacy adoption to startup", async () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify(session(accountA));
    await storage.setItem("otr.mobile.session.v1", raw);
    const repository = createAuthRepository(storage);
    await expect(repository.readAdoptedLocalSession()).rejects.toThrow(
      "SESSION_NOT_ADOPTED",
    );
    expect(await storage.getItem("otr.mobile.session.v1")).toBe(raw);
    expect(await storage.getItem("otr.mobile.accounts.v2")).toBeNull();
    expect(await storage.getItem("otr.mobile.launch.v1")).toBeNull();
  });

  it("rejects inconsistent legacy identity before adoption and preserves the original record", async () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify({
      ...session(accountA),
      accessToken: jwt({ sub: accountB.userId }),
    });
    await storage.setItem("otr.mobile.session.v1", raw);
    const repository = createAuthRepository(storage);
    await expect(repository.readLocalSession()).rejects.toThrow(
      "SESSION_IDENTITY_MISMATCH",
    );
    expect(await storage.getItem("otr.mobile.session.v1")).toBe(raw);
    await expect(repository.listAccounts()).resolves.toEqual([]);
  });

  it("rejects a mismatched direct session write without replacing the valid account", async () => {
    const storage = createMemoryStorage();
    const repository = createAuthRepository(storage);
    await repository.writeLocalSession(session(accountA));
    await expect(
      repository.writeLocalSession({
        ...session(accountA),
        accessToken: jwt({ sub: accountB.userId }),
      }),
    ).rejects.toThrow("SESSION_IDENTITY_MISMATCH");
    await expect(repository.readLocalSession()).resolves.toEqual(session(accountA));
  });
  it("uses stable Account ID even when names and email match, including after cold restore", async () => {
    const storage = createMemoryStorage();
    const repository = createAuthRepository(storage);
    const sameName = {
      ...accountB,
      displayName: accountA.displayName,
      email: accountA.email,
    };
    await repository.writeLocalSession(session(accountA));
    await repository.writeLocalSession(session(sameName));
    const restarted = createAuthRepository(storage);
    await restarted.selectAccount(accountA.userId);
    await expect(restarted.readLocalSession()).resolves.toMatchObject({
      refreshToken: `refresh-${accountA.userId}`,
    });
    await restarted.clearLocalSession();
    await expect(restarted.readLocalSession()).resolves.toBeNull();
    await expect(restarted.listAccounts()).resolves.toEqual([
      { ...sameName, active: false },
    ]);
  });

  it("rejects a foreign account stored under the active Account key without deleting it", async () => {
    const storage = createMemoryStorage();
    const repository = createAuthRepository(storage);
    await repository.writeLocalSession(session(accountA));
    await storage.setItem(
      `otr.mobile.session.v2.${accountA.userId}`,
      JSON.stringify(session(accountB)),
    );
    await expect(repository.readLocalSession()).rejects.toThrow(
      "SESSION_IDENTITY_MISMATCH",
    );
    await expect(repository.readAdoptedLocalSession()).rejects.toThrow(
      "SESSION_IDENTITY_MISMATCH",
    );
    await expect(repository.readCommittedLocalPrincipal()).rejects.toThrow(
      "SESSION_IDENTITY_MISMATCH",
    );
    await expect(repository.selectAccount(accountA.userId)).rejects.toThrow(
      "SESSION_IDENTITY_MISMATCH",
    );
    expect(
      await storage.getItem(`otr.mobile.session.v2.${accountA.userId}`),
    ).not.toBeNull();
  });

  it("does not fall through a missing active account session into another legacy identity", async () => {
    const storage = createMemoryStorage();
    const repository = createAuthRepository(storage);
    await repository.writeLocalSession(session(accountA));
    await storage.deleteItem(`otr.mobile.session.v2.${accountA.userId}`);
    await storage.setItem("otr.mobile.session.v1", JSON.stringify(session(accountB)));
    await expect(repository.readLocalSession()).rejects.toThrow("SESSION_NOT_ADOPTED");
    expect(await storage.getItem("otr.mobile.session.v1")).not.toBeNull();
  });

  it("persists local sessions through the secure-storage boundary", async () => {
    const storage = createMemoryStorage();
    const writer = createAuthRepository(storage);

    await writer.writeLocalSession(session());

    const restartedReader = createAuthRepository(storage);

    await expect(restartedReader.readLocalSession()).resolves.toMatchObject({
      refreshToken: `refresh-${accountA.userId}`,
      identity: accountA,
    });
  });

  it("keeps remembered account sessions separate and selects an existing account", async () => {
    const repository = createAuthRepository(createMemoryStorage());
    await repository.writeLocalSession(session(accountA));
    await repository.writeLocalSession(session(accountB));

    await expect(repository.listAccounts()).resolves.toEqual([
      { ...accountA, active: false },
      { ...accountB, active: true },
    ]);
    await expect(repository.selectAccount(accountA.userId)).resolves.toBe(true);
    await expect(repository.readLocalSession()).resolves.toMatchObject({
      identity: accountA,
    });
  });

  it("does not change the active account when selecting an unknown account", async () => {
    const repository = createAuthRepository(createMemoryStorage());
    await repository.writeLocalSession(session(accountA));

    await expect(repository.selectAccount("missing")).resolves.toBe(false);
    await expect(repository.readLocalSession()).resolves.toMatchObject({
      identity: accountA,
    });
  });

  it("removes only the requested remembered account", async () => {
    const repository = createAuthRepository(createMemoryStorage());
    await repository.writeLocalSession(session(accountA));
    await repository.writeLocalSession(session(accountB));
    await repository.removeAccount(accountA.userId);

    await expect(repository.listAccounts()).resolves.toEqual([
      { ...accountB, active: true },
    ]);
  });

  it("adopts a parseable legacy session without losing offline access", async () => {
    const storage = createMemoryStorage();
    await storage.setItem(
      "otr.mobile.session.v1",
      JSON.stringify({
        accessToken: jwt({
          sub: accountA.userId,
          email: accountA.email,
          user_metadata: { display_name: accountA.displayName },
        }),
        refreshToken: "legacy-refresh",
        expiresAt: "2026-09-09T00:00:00.000Z",
      }),
    );
    const repository = createAuthRepository(storage);

    await expect(repository.readLocalSession()).resolves.toMatchObject({
      refreshToken: "legacy-refresh",
      identity: accountA,
    });
    await expect(repository.listAccounts()).resolves.toEqual([
      { ...accountA, active: true },
    ]);
  });
});
