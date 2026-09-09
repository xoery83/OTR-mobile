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

describe("auth repository", () => {
  it("persists local sessions through the secure-storage boundary", async () => {
    const storage = createMemoryStorage();
    const writer = createAuthRepository(storage);

    await writer.writeLocalSession({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: "2026-09-09T00:00:00.000Z",
    });

    const restartedReader = createAuthRepository(storage);

    await expect(restartedReader.readLocalSession()).resolves.toMatchObject({
      refreshToken: "refresh",
    });
  });
});
