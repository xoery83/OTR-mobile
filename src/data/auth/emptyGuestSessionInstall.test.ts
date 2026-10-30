import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";
import { createAccountSwitchCoordinator } from "./accountSwitchCoordinator";
import {
  assertAccountTransitionLease,
  beginAccountTransition,
  endAccountTransition,
  withAccountApplyGate,
} from "./accountRequestContext";
import { getAccountGeneration } from "./accountGeneration";

async function setup() {
  const values = new Map<string, string>(),
    guest = randomUUID(),
    account = randomUUID();
  const storage: SecureSessionStorage = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
    },
    deleteItem: async (k) => {
      values.delete(k);
    },
  };
  const assertCurrent = vi.fn(async () => {}),
    release = vi.fn(),
    qualify = vi.fn(async (lease: Parameters<typeof assertAccountTransitionLease>[0]) => {
      assertAccountTransitionLease(lease);
      return { assertCurrent };
    });
  const prepare = vi.fn(async (localId: string) => {
    expect(localId).toBe(guest);
    await withAccountApplyGate(async () => {});
    return { qualify, release };
  });
  const repo = createAuthRepository(storage, () => guest, { prepareEmptyGuest: prepare });
  await repo.readLocalAuthSnapshot();
  const session = {
    accessToken: "unit-not-a-network-token",
    refreshToken: "unit-no-network",
    expiresAt: "2026-11-01T00:00:00.000Z",
    identity: { userId: account, displayName: "", email: "qa@example.test" },
  };
  const clear = vi.fn(),
    adopt = vi.fn();
  const bootstrap = vi.fn(async () => {}),
    restart = vi.fn(async () => {});
  const coordinator = createAccountSwitchCoordinator({
    pauseSync: async () => {},
    restartSync: restart,
    readSession: repo.readLocalSession,
    writeSession: repo.writeLocalSession,
    prepareSessionInstall: repo.prepareSessionInstall,
    clearSession: repo.clearLocalSession,
    selectAccount: repo.selectAccount,
    adoptLocalState: adopt,
    clearInMemoryState: clear,
    bootstrapAccount: bootstrap,
  });
  return {
    values,
    storage,
    guest,
    account,
    repo,
    session,
    coordinator,
    prepare,
    qualify,
    assertCurrent,
    release,
    clear,
    adopt,
    bootstrap,
    restart,
  };
}
it("qualifies empty Guest through owning callback under real lease, then cold-restores Account", async () => {
  const f = await setup();
  await expect(f.repo.writeLocalSession(f.session)).rejects.toThrow(
    "GUEST_ADOPTION_PREFLIGHT_REQUIRED",
  );
  await f.coordinator.activateSession(f.session);
  expect(f.prepare.mock.invocationCallOrder[0]).toBeLessThan(
    f.clear.mock.invocationCallOrder[0],
  );
  expect(f.qualify).toHaveBeenCalledOnce();
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.assertCurrent).toHaveBeenCalledTimes(2);
  const cold = createAuthRepository(f.storage);
  expect((await cold.readLocalAuthSnapshot()).principal).toEqual({
    kind: "ACCOUNT",
    accountId: f.account,
  });
  expect((await cold.readAdoptedLocalSession())?.refreshToken).toBe(
    f.session.refreshToken,
  );
  expect(f.adopt).toHaveBeenCalledWith(f.account);
});
it("refuses absent owning qualifier and preserves Guest without Session write", async () => {
  const f = await setup(),
    repo = createAuthRepository(f.storage);
  await expect(repo.prepareSessionInstall(f.session)).rejects.toThrow(
    "PREFLIGHT_REQUIRED",
  );
  expect(f.values.has("otr.mobile.accounts.v2")).toBe(false);
  expect(await repo.readCommittedLocalPrincipal()).toEqual({
    kind: "GUEST",
    localId: f.guest,
  });
});
it("rejects nonempty or unknown data before clearing memory", async () => {
  const f = await setup();
  f.prepare.mockRejectedValueOnce(Error("GUEST_ADOPTION_PREFLIGHT_REQUIRED"));
  await expect(f.coordinator.activateSession(f.session)).rejects.toThrow(
    "PREFLIGHT_REQUIRED",
  );
  expect(f.clear).not.toHaveBeenCalled();
  expect(f.values.has("otr.mobile.accounts.v2")).toBe(false);
});
it("disposes outside-gate qualification even if Account generation supersedes activation", async () => {
  const f = await setup(),
    old = getAccountGeneration() - 1;
  await expect(f.coordinator.activateSession(f.session, old)).rejects.toThrow(
    "changed before authentication",
  );
  expect(f.qualify).not.toHaveBeenCalled();
  expect(f.release).toHaveBeenCalledOnce();
});
it("rejects fake or released transition without installing credentials", async () => {
  const f = await setup(),
    prepared = await f.repo.prepareSessionInstall(f.session);
  const lease = await beginAccountTransition();
  endAccountTransition(lease);
  await expect(prepared.install(lease)).rejects.toThrow("not active");
  await expect(prepared.install({ ...lease })).rejects.toThrow("not active");
  prepared.release();
  expect(f.values.has(`otr.mobile.session.v2.${f.account}`)).toBe(false);
});
it.each(["legacy", "index", "verification", "principal", "slot"])(
  "rejects %s appearing after preparation",
  async (kind) => {
    const f = await setup(),
      prepared = await f.repo.prepareSessionInstall(f.session);
    if (kind === "legacy") f.values.set("otr.mobile.session.v1", "retained");
    if (kind === "index") f.values.set("otr.mobile.accounts.v2", "retained");
    if (kind === "verification")
      f.values.set(`otr.mobile.guest-verification.v1.${f.guest}`, "retained");
    if (kind === "principal")
      f.values.set(
        "otr.mobile.launch.v1",
        JSON.stringify({ version: 1, kind: "GUEST", localId: randomUUID() }),
      );
    if (kind === "slot") f.values.set(`otr.mobile.session.v2.${f.account}`, "retained");
    const before = new Map(f.values),
      lease = await beginAccountTransition();
    try {
      await expect(prepared.install(lease)).rejects.toThrow();
    } finally {
      endAccountTransition(lease);
      prepared.release();
    }
    expect(f.values).toEqual(before);
  },
);
it("retains Guest and cleans only newly staged credentials when final empty proof changes", async () => {
  const f = await setup();
  f.assertCurrent
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(Error("GUEST_DATA_CHANGED"));
  await expect(f.coordinator.activateSession(f.session)).rejects.toThrow(
    "GUEST_DATA_CHANGED",
  );
  expect(f.values.has("otr.mobile.accounts.v2")).toBe(false);
  expect(f.values.has(`otr.mobile.session.v2.${f.account}`)).toBe(false);
  expect(await f.repo.readCommittedLocalPrincipal()).toEqual({
    kind: "GUEST",
    localId: f.guest,
  });
  expect(f.release).toHaveBeenCalledOnce();
});
it("pins verified candidate before asynchronous preparation", async () => {
  const f = await setup(),
    original = f.account,
    prepared = await f.repo.prepareSessionInstall(f.session);
  f.session.identity.userId = randomUUID();
  const lease = await beginAccountTransition();
  try {
    await prepared.install(lease);
  } finally {
    endAccountTransition(lease);
    prepared.release();
  }
  expect((await f.repo.readAdoptedLocalSession())?.identity?.userId).toBe(original);
});
it.each(["before", "after"])(
  "recovers accounts-index write %s-error and permits same-account normal retry",
  async (mode) => {
    const f = await setup(),
      set = f.storage.setItem;
    let fail = true;
    f.storage.setItem = async (k, v) => {
      if (k === "otr.mobile.accounts.v2" && fail) {
        fail = false;
        if (mode === "after") await set(k, v);
        throw Error("INDEX_WRITE_FAILED");
      }
      await set(k, v);
    };
    await expect(f.coordinator.activateSession(f.session)).rejects.toThrow(
      "INDEX_WRITE_FAILED",
    );
    expect(f.values.has(`otr.mobile.session.v2.${f.account}`)).toBe(mode === "after");
    await expect(f.coordinator.activateSession(f.session)).resolves.toMatchObject({
      identity: { userId: f.account },
    });
  },
);
it.each(["qualify", "slot"])(
  "cancels during %s before visibility commit and preserves Guest",
  async (stage) => {
    const f = await setup(),
      controller = new AbortController();
    if (stage === "qualify")
      f.assertCurrent.mockImplementationOnce(async () => {
        controller.abort();
      });
    else {
      const set = f.storage.setItem;
      f.storage.setItem = async (k, v) => {
        await set(k, v);
        if (k === `otr.mobile.session.v2.${f.account}`) controller.abort();
      };
    }
    await expect(
      f.coordinator.activateSession(f.session, undefined, controller.signal),
    ).rejects.toThrow("AUTH_ACTIVATION_CANCELED");
    expect(f.values.has("otr.mobile.accounts.v2")).toBe(false);
    expect(f.values.has(`otr.mobile.session.v2.${f.account}`)).toBe(false);
    expect(await f.repo.readCommittedLocalPrincipal()).toEqual({
      kind: "GUEST",
      localId: f.guest,
    });
    expect(f.release).toHaveBeenCalledOnce();
  },
);

it.each(["bootstrap", "restart"] as const)(
  "releases empty freeze before slow %s mounts Account UI",
  async (stage) => {
    const f = await setup();
    let resume!: () => void, entered!: () => void;
    const begun = new Promise<void>((r) => {
      entered = r;
    });
    f[stage].mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((r) => {
        resume = r;
      });
    });
    const activating = f.coordinator.activateSession(f.session);
    await begun;
    try {
      expect(f.release).toHaveBeenCalledOnce();
      expect((await f.repo.readCommittedLocalPrincipal())?.kind).toBe("ACCOUNT");
    } finally {
      resume();
      await activating;
    }
  },
);
