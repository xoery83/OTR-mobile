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
