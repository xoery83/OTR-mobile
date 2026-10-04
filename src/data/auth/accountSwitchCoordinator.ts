import type { LocalSession } from "@/domain/auth/localSession";
import {
  beginAccountTransition,
  endAccountTransition,
  type AccountTransitionLease,
} from "./accountRequestContext";

export type AccountSwitchDependencies = {
  pauseSync(): Promise<void>;
  restartSync(): Promise<unknown>;
  readSession(): Promise<LocalSession | null>;
  writeSession(session: LocalSession): Promise<void>;
  clearSession(): Promise<void>;
  selectAccount(userId: string): Promise<boolean>;
  adoptLocalState(userId: string): Promise<void>;
  clearInMemoryState(): void | Promise<void>;
  bootstrapAccount(session: LocalSession | null): Promise<void>;
};

export function createAccountSwitchCoordinator(dependencies: AccountSwitchDependencies) {
  let switching = false;
  const readAccountId = async () =>
    (await dependencies.readSession())?.identity?.userId ?? null;

  async function recover(
    previous: LocalSession | null,
    failed: { accountId: string | null; generation: number },
  ) {
    const lease = await beginAccountTransition({
      ...failed,
      getAccountId: readAccountId,
    });
    if (!lease) return "superseded";
    const previousUserId = previous?.identity?.userId;
    try {
      if (previousUserId) {
        if (!(await dependencies.selectAccount(previousUserId)))
          throw new Error("The previous account could not be restored.");
      } else {
        await dependencies.clearSession();
      }
      await dependencies.clearInMemoryState();
    } finally {
      endAccountTransition(lease);
    }
    await dependencies.bootstrapAccount(previous);
    if (previousUserId) await dependencies.restartSync();
    return "recovered";
  }

  async function activate(install: () => Promise<LocalSession>) {
    if (switching) throw new Error("An account transition is already in progress.");
    switching = true;
    let lease: AccountTransitionLease | null = null;
    let previous: LocalSession | null = null;
    let failed: { accountId: string | null; generation: number } | null = null;
    try {
      // Draining existing sync may wait for network; it must not hold the gate.
      await dependencies.pauseSync();
      lease = await beginAccountTransition();
      previous = await dependencies.readSession();
      failed = {
        accountId: previous?.identity?.userId ?? null,
        generation: lease.generation,
      };
      await dependencies.clearInMemoryState();
      const session = await install();
      const userId = session.identity?.userId;
      if (!userId) throw new Error("The selected account has no stable user identity.");
      failed.accountId = userId;
      await dependencies.adoptLocalState(userId);
      endAccountTransition(lease);
      lease = null;
      await dependencies.bootstrapAccount(session);
      await dependencies.restartSync();
      return session;
    } catch (error) {
      if (lease) {
        // Local installation failed while we still own the serialization point.
        if (failed)
          failed.accountId = await readAccountId().catch(() => failed!.accountId);
        endAccountTransition(lease);
        lease = null;
      }
      if (failed) await recover(previous, failed).catch(() => undefined);
      throw error;
    } finally {
      if (lease) endAccountTransition(lease);
      switching = false;
    }
  }

  return {
    switchAccount(userId: string) {
      return activate(async () => {
        if (!(await dependencies.selectAccount(userId)))
          throw new Error("The selected account is not available on this device.");
        const session = await dependencies.readSession();
        if (session?.identity?.userId !== userId)
          throw new Error("The selected account session could not be verified.");
        return session;
      });
    },
    activateSession(session: LocalSession) {
      return activate(async () => {
        await dependencies.writeSession(session);
        const stored = await dependencies.readSession();
        if (!stored || stored.identity?.userId !== session.identity?.userId)
          throw new Error("The new account session could not be verified.");
        return stored;
      });
    },
    async logout() {
      if (switching) throw new Error("An account transition is already in progress.");
      switching = true;
      let lease: AccountTransitionLease | null = null;
      try {
        await dependencies.pauseSync();
        lease = await beginAccountTransition();
        await dependencies.clearInMemoryState();
        await dependencies.clearSession();
        endAccountTransition(lease);
        lease = null;
        await dependencies.bootstrapAccount(null);
      } finally {
        if (lease) endAccountTransition(lease);
        switching = false;
      }
    },
  };
}
