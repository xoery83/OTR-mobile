import { describe, expect, it, vi } from "vitest";

import type { LocalSession } from "@/domain/auth/localSession";

import {
  captureAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
  beginAccountTransition,
  endAccountTransition,
} from "./accountRequestContext";
import { getAccountGeneration, advanceAccountGeneration } from "./accountGeneration";
import { createAuthRepository } from "./authSessionRepository";
import { createAccountSwitchCoordinator } from "./accountSwitchCoordinator";

describe("voluntary logout online boundary", () => {
  it.each(["initial", "after-pause"])(
    "retains session when offline at %s check",
    async (stage) => {
      let checks = 0;
      const clearSession = vi.fn();
      const pauseSync = vi.fn();
      const restartSync = vi.fn(async () => undefined);
      const coordinator = createAccountSwitchCoordinator({
        assertLogoutAllowed: async () => {
          checks++;
          if (stage === "initial" || checks === 2)
            throw new Error("LOGOUT_REQUIRES_ONLINE");
        },
        pauseSync,
        restartSync,
        readSession: async () => session("user-a"),
        writeSession: vi.fn(),
        clearSession,
        selectAccount: vi.fn(),
        adoptLocalState: vi.fn(),
        clearInMemoryState: vi.fn(),
        bootstrapAccount: vi.fn(),
      });
      await expect(coordinator.logout()).rejects.toThrow("LOGOUT_REQUIRES_ONLINE");
      expect(clearSession).not.toHaveBeenCalled();
      expect(pauseSync).toHaveBeenCalledTimes(stage === "initial" ? 0 : 1);
      expect(restartSync).toHaveBeenCalledTimes(stage === "initial" ? 0 : 1);
    },
  );
});

it("does not log out a different account selected during online preflight", async () => {
  let active = session("user-a");
  const clearSession = vi.fn();
  let paused = false;
  const restartSync = vi.fn(async () => {
    paused = false;
  });
  const coordinator = createAccountSwitchCoordinator({
    assertLogoutAllowed: async () => {
      active = session("user-b");
    },
    pauseSync: async () => {
      paused = true;
    },
    restartSync,
    readSession: async () => active,
    writeSession: vi.fn(),
    clearSession,
    selectAccount: vi.fn(),
    adoptLocalState: vi.fn(),
    clearInMemoryState: vi.fn(),
    bootstrapAccount: vi.fn(),
  });
  await expect(coordinator.logout()).rejects.toThrow("AUTH_CONTEXT_CHANGED");
  expect(clearSession).not.toHaveBeenCalled();
  expect(paused).toBe(false);
  expect(restartSync).toHaveBeenCalledOnce();
});

it("does not resume synchronization through another active transition", async () => {
  let checks = 0;
  let lease!: Awaited<ReturnType<typeof beginAccountTransition>>;
  const restartSync = vi.fn(async () => undefined);
  const clearSession = vi.fn();
  const coordinator = createAccountSwitchCoordinator({
    assertLogoutAllowed: async () => {
      if (++checks === 2) {
        lease = await beginAccountTransition();
        throw new Error("LOGOUT_REQUIRES_ONLINE");
      }
    },
    pauseSync: async () => undefined,
    restartSync,
    readSession: async () => session("user-a"),
    writeSession: vi.fn(),
    clearSession,
    selectAccount: vi.fn(),
    adoptLocalState: vi.fn(),
    clearInMemoryState: vi.fn(),
    bootstrapAccount: vi.fn(),
  });
  try {
    await expect(coordinator.logout()).rejects.toThrow("LOGOUT_REQUIRES_ONLINE");
    expect(restartSync).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  } finally {
    if (lease) endAccountTransition(lease);
  }
});

it("restores retained account sync after secure marker write failure", async () => {
  const entries = new Map<string, string>();
  let failMarker = false;
  const repository = createAuthRepository({
    getItem: async (key) => entries.get(key) ?? null,
    setItem: async (key, value) => {
      if (failMarker && key === "otr.mobile.launch.v1")
        throw new Error("SECURE_STORAGE_UNAVAILABLE");
      entries.set(key, value);
    },
    deleteItem: async (key) => {
      entries.delete(key);
    },
  });
  await repository.writeLocalSession(session("user-a"));
  failMarker = true;
  let paused = false;
  const restartSync = vi.fn(async () => {
    paused = false;
  });
  const coordinator = createAccountSwitchCoordinator({
    assertLogoutAllowed: async () => undefined,
    pauseSync: async () => {
      paused = true;
    },
    restartSync,
    readSession: repository.readLocalSession,
    writeSession: repository.writeLocalSession,
    clearSession: repository.clearLocalSession,
    selectAccount: repository.selectAccount,
    adoptLocalState: vi.fn(),
    clearInMemoryState: vi.fn(),
    bootstrapAccount: vi.fn(),
  });
  await expect(coordinator.logout()).rejects.toThrow("SECURE_STORAGE_UNAVAILABLE");
  expect((await repository.readLocalSession())?.identity?.userId).toBe("user-a");
  expect(paused).toBe(false);
  expect(restartSync).toHaveBeenCalledOnce();
});

const session = (userId: string): LocalSession => ({
  accessToken: `${userId}-access`,
  refreshToken: `${userId}-refresh`,
  expiresAt: "2099-01-01T00:00:00.000Z",
  identity: { userId, displayName: userId, email: `${userId}@example.com` },
});

describe("account switch boundary", () => {
  it("does not install a verified session if the login page leaves while old sync drains", async () => {
    const cancel = new AbortController();
    let release!: () => void;
    const draining = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writeSession = vi.fn();
    const restartSync = vi.fn();
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: () => draining,
      restartSync,
      readSession: async () => session("user-a"),
      writeSession,
      clearSession: vi.fn(),
      selectAccount: async () => true,
      adoptLocalState: vi.fn(),
      clearInMemoryState: vi.fn(),
      bootstrapAccount: vi.fn(),
    });
    const pending = coordinator.activateSession(
      session("user-b"),
      getAccountGeneration(),
      cancel.signal,
    );
    cancel.abort();
    release();
    await expect(pending).rejects.toThrow("AUTH_ACTIVATION_CANCELED");
    expect(writeSession).not.toHaveBeenCalled();
    expect(restartSync).toHaveBeenCalledOnce();
  });
  it("rejects late OTP activation after sync pause and resumes only the retained account", async () => {
    const writeSession = vi.fn();
    const restartSync = vi.fn();
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: async () => {
        advanceAccountGeneration();
      },
      restartSync,
      readSession: async () => session("user-a"),
      writeSession,
      clearSession: vi.fn(),
      selectAccount: vi.fn(),
      adoptLocalState: vi.fn(),
      clearInMemoryState: vi.fn(),
      bootstrapAccount: vi.fn(),
    });
    await expect(
      coordinator.activateSession(session("user-b"), getAccountGeneration()),
    ).rejects.toThrow("account changed");
    expect(writeSession).not.toHaveBeenCalled();
    expect(restartSync).toHaveBeenCalledOnce();
  });
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

it.each(["after-index-cancel", "launch-marker-failure", "before-index-failure"])(
  "retains the Guest-origin visibility commit or original Guest after %s",
  async (failure) => {
    const entries = new Map<string, string>();
    const guestId = "10000000-0000-4000-8000-000000000099";
    let injecting = true;
    entries.set(
      "otr.mobile.launch.v1",
      JSON.stringify({ version: 1, kind: "GUEST", localId: guestId }),
    );
    const cancel = new AbortController();
    const repository = createAuthRepository(
      {
        getItem: async (key) => entries.get(key) ?? null,
        setItem: async (key, value) => {
          if (
            injecting &&
            key === "otr.mobile.accounts.v2" &&
            failure === "before-index-failure"
          )
            throw Error("INDEX_WRITE_FAILED");
          if (
            injecting &&
            key === "otr.mobile.launch.v1" &&
            failure === "launch-marker-failure"
          )
            throw Error("MARKER_WRITE_FAILED");
          entries.set(key, value);
          if (key === "otr.mobile.accounts.v2" && failure === "after-index-cancel")
            cancel.abort();
        },
        deleteItem: async (key) => {
          entries.delete(key);
        },
      },
      undefined,
      {
        prepareEmptyGuest: async () => ({
          qualify: async () => ({ assertCurrent: async () => {} }),
          release() {},
        }),
      },
    );
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
    await expect(
      coordinator.activateSession(
        session("user-b"),
        getAccountGeneration(),
        cancel.signal,
      ),
    ).rejects.toThrow();
    expect(clearSession).not.toHaveBeenCalled();
    if (failure === "before-index-failure") {
      expect(await repository.readCommittedLocalPrincipal()).toEqual({
        kind: "GUEST",
        localId: guestId,
      });
      expect(entries.has("otr.mobile.session.v2.user-b")).toBe(false);
    } else {
      expect(await repository.readCommittedLocalPrincipal()).toEqual({
        kind: "ACCOUNT",
        accountId: "user-b",
      });
      expect(
        (
          await createAuthRepository({
            getItem: async (key) => entries.get(key) ?? null,
            setItem: async () => {},
            deleteItem: async () => {},
          }).readAdoptedLocalSession()
        )?.identity?.userId,
      ).toBe("user-b");
      injecting = false;
      if (failure === "launch-marker-failure") {
        await expect(repository.writeLocalSession(session("user-c"))).rejects.toThrow(
          "GUEST_ADOPTION_PREFLIGHT_REQUIRED",
        );
        await repository.writeLocalSession({
          ...session("user-b"),
          refreshToken: "renewed",
        });
        expect(JSON.parse(entries.get("otr.mobile.launch.v1")!).kind).toBe("SIGNED_OUT");
        expect((await repository.readAdoptedLocalSession())?.refreshToken).toBe(
          "renewed",
        );
      }
    }
  },
);
