import { describe, expect, it, vi } from "vitest";

import { SupabaseDevAuthError } from "./devSupabaseAuth";
import {
  accessTokenRefreshWindowMs,
  createSessionAccessTokenProvider,
} from "./sessionAccessToken";
import type { LocalSession } from "@/domain/auth/localSession";

vi.mock("./authRepository", () => ({
  readLocalSession: vi.fn(),
  writeLocalSession: vi.fn(),
  clearLocalSession: vi.fn(),
}));

const now = Date.parse("2026-09-24T00:00:00.000Z");
const identity = {
  userId: "account-a",
  displayName: "A",
  email: "a@example.test",
};

function session(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
    identity,
    ...overrides,
  };
}

function harness(initial = session()) {
  let stored = initial;
  const refreshSession = vi.fn(
    async (_refreshToken: string, persist: (value: LocalSession) => Promise<void>) => {
      const refreshed = session({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: new Date(now + 60 * 60_000).toISOString(),
      });
      await persist(refreshed);
      return refreshed;
    },
  );
  const provider = createSessionAccessTokenProvider({
    readSession: async () => stored,
    writeSession: async (value) => {
      stored = value;
    },
    refreshSession,
    now: () => now,
  });
  return {
    provider,
    refreshSession,
    read: () => stored,
    write: (value: LocalSession) => (stored = value),
  };
}

describe("session access token", () => {
  it("uses a comfortably valid token without refreshing", async () => {
    const value = harness();
    await expect(value.provider()).resolves.toEqual({
      token: "old-access",
      userId: "account-a",
    });
    expect(value.refreshSession).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", -1],
    ["near expiry", accessTokenRefreshWindowMs - 1],
  ])("refreshes a token that is %s", async (_label, offset) => {
    const value = harness(session({ expiresAt: new Date(now + offset).toISOString() }));
    await expect(value.provider()).resolves.toMatchObject({ token: "new-access" });
    expect(value.refreshSession).toHaveBeenCalledOnce();
    expect(value.read().accessToken).toBe("new-access");
  });

  it("shares one refresh across concurrent requests", async () => {
    const value = harness(session({ expiresAt: new Date(now - 1).toISOString() }));
    const results = await Promise.all(Array.from({ length: 10 }, () => value.provider()));
    expect(value.refreshSession).toHaveBeenCalledOnce();
    expect(results.every((result) => result.token === "new-access")).toBe(true);
  });

  it("does not refresh again when another request already replaced the rejected token", async () => {
    const value = harness(session({ accessToken: "fresh-access" }));
    await expect(
      value.provider({ forceRefresh: true, rejectedToken: "old-access" }),
    ).resolves.toMatchObject({ token: "fresh-access" });
    expect(value.refreshSession).not.toHaveBeenCalled();
  });

  it.each([
    new SupabaseDevAuthError("offline", "network"),
    new SupabaseDevAuthError("temporary", "temporary", 503),
  ])("preserves the local session for transient refresh failure", async (failure) => {
    const value = harness(session({ expiresAt: new Date(now - 1).toISOString() }));
    value.refreshSession.mockRejectedValueOnce(failure);
    await expect(value.provider()).rejects.toMatchObject({
      kind: "network",
      code: "AUTH_REFRESH_UNAVAILABLE",
    });
    expect(value.read().refreshToken).toBe("old-refresh");
  });

  it("returns auth-required without clearing a genuinely invalid refresh session", async () => {
    const value = harness(session({ expiresAt: new Date(now - 1).toISOString() }));
    value.refreshSession.mockRejectedValueOnce(
      new SupabaseDevAuthError("invalid", "invalid_session", 400),
    );
    await expect(value.provider()).rejects.toMatchObject({
      status: 401,
      code: "AUTH_REQUIRED",
    });
    expect(value.read().refreshToken).toBe("old-refresh");
  });

  it("cannot overwrite or return another account after an account switch", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const value = harness(session({ expiresAt: new Date(now - 1).toISOString() }));
    value.refreshSession.mockImplementationOnce(async (_token, persist) => {
      await waiting;
      const refreshed = session({ accessToken: "late-account-a-token" });
      await persist(refreshed);
      return refreshed;
    });
    const pending = value.provider();
    value.write(
      session({
        accessToken: "account-b-token",
        refreshToken: "account-b-refresh",
        identity: { ...identity, userId: "account-b" },
      }),
    );
    release();

    await expect(pending).rejects.toMatchObject({ code: "AUTH_CONTEXT_CHANGED" });
    expect(value.read().accessToken).toBe("account-b-token");
  });
});
