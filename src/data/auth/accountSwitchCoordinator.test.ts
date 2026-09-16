import { describe, expect, it, vi } from "vitest";

import type { LocalSession } from "@/domain/auth/localSession";

import { createAccountSwitchCoordinator } from "./accountSwitchCoordinator";

const session = (userId: string): LocalSession => ({
  accessToken: `${userId}-access`,
  refreshToken: `${userId}-refresh`,
  expiresAt: "2099-01-01T00:00:00.000Z",
  identity: { userId, displayName: userId, email: `${userId}@example.com` },
});

describe("account switch boundary", () => {
  it("waits for old sync before changing identity, then bootstraps before restart", async () => {
    const events: string[] = [];
    let active = session("user-a");
    let releaseSync!: () => void;
    const oldSync = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: async () => {
        events.push("pause");
        await oldSync;
        events.push("old-sync-finished");
      },
      restartSync: async () => void events.push("restart"),
      readSession: async () => active,
      writeSession: async (next) => {
        active = next;
      },
      clearSession: vi.fn(),
      selectAccount: async (userId) => {
        events.push(`select:${userId}`);
        active = session(userId);
        return true;
      },
      adoptLocalState: async (userId) => void events.push(`adopt:${userId}`),
      clearInMemoryState: async () => void events.push("clear-memory"),
      bootstrapAccount: async (next) =>
        void events.push(`bootstrap:${next?.identity?.userId ?? "signed-out"}`),
    });

    const switched = coordinator.switchAccount("user-b");
    await Promise.resolve();
    expect(events).toEqual(["pause"]);
    releaseSync();
    await switched;

    expect(events).toEqual([
      "pause",
      "old-sync-finished",
      "clear-memory",
      "select:user-b",
      "adopt:user-b",
      "bootstrap:user-b",
      "restart",
    ]);
  });

  it("logs out without restarting synchronization", async () => {
    const restartSync = vi.fn();
    const clearSession = vi.fn();
    const bootstrapAccount = vi.fn();
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: vi.fn(),
      restartSync,
      readSession: async () => session("user-a"),
      writeSession: vi.fn(),
      clearSession,
      selectAccount: vi.fn(),
      adoptLocalState: vi.fn(),
      clearInMemoryState: vi.fn(),
      bootstrapAccount,
    });

    await coordinator.logout();

    expect(clearSession).toHaveBeenCalledOnce();
    expect(bootstrapAccount).toHaveBeenCalledWith(null);
    expect(restartSync).not.toHaveBeenCalled();
  });

  it("restores the previous account when target selection fails", async () => {
    const selected: string[] = [];
    const bootstrapAccount = vi.fn();
    const restartSync = vi.fn();
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: vi.fn(),
      restartSync,
      readSession: async () => session("user-a"),
      writeSession: vi.fn(),
      clearSession: vi.fn(),
      selectAccount: async (userId) => {
        selected.push(userId);
        return userId === "user-a";
      },
      adoptLocalState: vi.fn(),
      clearInMemoryState: vi.fn(),
      bootstrapAccount,
    });

    await expect(coordinator.switchAccount("user-b")).rejects.toThrow("not available");

    expect(selected).toEqual(["user-b", "user-a"]);
    expect(bootstrapAccount).toHaveBeenCalledWith(session("user-a"));
    expect(restartSync).toHaveBeenCalledOnce();
  });

  it("switches from owner to member and back using remembered sessions", async () => {
    const sessions = new Map([
      ["owner", session("owner")],
      ["member", session("member")],
    ]);
    let active = sessions.get("owner")!;
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: vi.fn(),
      restartSync: vi.fn(),
      readSession: async () => active,
      writeSession: async (next) => {
        active = next;
      },
      clearSession: vi.fn(),
      selectAccount: async (userId) => {
        const next = sessions.get(userId);
        if (!next) return false;
        active = next;
        return true;
      },
      adoptLocalState: vi.fn(),
      clearInMemoryState: vi.fn(),
      bootstrapAccount: vi.fn(),
    });

    await coordinator.switchAccount("member");
    expect(active.identity?.userId).toBe("member");
    await coordinator.switchAccount("owner");
    expect(active.identity?.userId).toBe("owner");
  });
});
