import { describe, expect, it, vi } from "vitest";

import type { LocalSession } from "@/domain/auth/localSession";

import {
  captureAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
} from "./accountRequestContext";
import { getAccountGeneration } from "./accountGeneration";
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
    await vi.waitFor(() => expect(events).toEqual(["pause"]));
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

describe("Account recovery transition", () => {
  it.each(["switchAccount", "activateSession"] as const)(
    "%s recovery failure keeps both previous contexts invalid",
    async (method) => {
      let active = session("user-a");
      const oldA = await captureAccountRequestContext(
        "trip",
        async () => active.identity!.userId,
      );
      let oldB!: typeof oldA;
      const coordinator = createAccountSwitchCoordinator({
        pauseSync: async () => {},
        restartSync: async () => {},
        readSession: async () => active,
        writeSession: async (next) => {
          active = next;
        },
        clearSession: async () => {},
        selectAccount: async (id) => {
          if (id === "user-a") throw new Error("restore failed");
          active = session(id);
          return true;
        },
        adoptLocalState: async () => {},
        clearInMemoryState: async () => {},
        bootstrapAccount: async () => {
          oldB = await captureAccountRequestContext(
            "trip",
            async () => active.identity!.userId,
          );
          throw new Error("bootstrap failed");
        },
      });
      await expect(
        method === "switchAccount"
          ? coordinator.switchAccount("user-b")
          : coordinator.activateSession(session("user-b")),
      ).rejects.toThrow("bootstrap failed");
      expect(getAccountGeneration()).toBeGreaterThan(oldB.generation);
      expect(() => assertAccountRequestGeneration(oldA)).toThrow("Account changed");
      expect(() => assertAccountRequestGeneration(oldB)).toThrow("Account changed");
      expect(
        (await captureAccountRequestContext("trip", async () => active.identity!.userId))
          .generation,
      ).toBe(getAccountGeneration());
      await withAccountApplyGate(async () => {});
    },
  );
  it("runs successful switch bootstrap and restart outside the shared gate", async () => {
    let active = session("user-a");
    const events: string[] = [];
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: async () => {},
      readSession: async () => active,
      writeSession: async (next) => {
        active = next;
      },
      clearSession: async () => {},
      selectAccount: async (id) => {
        active = session(id);
        return true;
      },
      adoptLocalState: async () => {},
      clearInMemoryState: async () => {},
      bootstrapAccount: async () => {
        await withAccountApplyGate(async () => {
          events.push("bootstrap");
        });
      },
      restartSync: async () => {
        await withAccountApplyGate(async () => {
          events.push("restart");
        });
      },
    });
    await coordinator.switchAccount("user-b");
    expect(active.identity!.userId).toBe("user-b");
    expect(events).toEqual(["bootstrap", "restart"]);
  });
  it("activation recovery restores an originally signed-out session", async () => {
    let active: LocalSession | null = null;
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: async () => {},
      restartSync: async () => {},
      readSession: async () => active,
      writeSession: async (next) => {
        active = next;
      },
      clearSession: async () => {
        active = null;
      },
      selectAccount: async () => false,
      adoptLocalState: async () => {},
      clearInMemoryState: async () => {},
      bootstrapAccount: async (next) => {
        if (next) throw new Error("bootstrap failed");
        await withAccountApplyGate(async () => {});
      },
    });
    await expect(coordinator.activateSession(session("user-b"))).rejects.toThrow(
      "bootstrap failed",
    );
    expect(active).toBeNull();
  });
});
