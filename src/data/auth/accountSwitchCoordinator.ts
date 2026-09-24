import type { LocalSession } from "@/domain/auth/localSession";
import { advanceAccountGeneration } from "./accountGeneration";

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

  async function begin() {
    if (switching) throw new Error("An account transition is already in progress.");
    switching = true;
    advanceAccountGeneration();
    try {
      const previous = await dependencies.readSession();
      await dependencies.pauseSync();
      await dependencies.clearInMemoryState();
      return previous;
    } catch (error) {
      switching = false;
      throw error;
    }
  }

  async function finish(session: LocalSession) {
    const userId = session.identity?.userId;
    if (!userId) throw new Error("The selected account has no stable user identity.");
    await dependencies.adoptLocalState(userId);
    await dependencies.bootstrapAccount(session);
    await dependencies.restartSync();
    return session;
  }

  async function recover(previous: LocalSession | null) {
    const previousUserId = previous?.identity?.userId;
    if (previousUserId) await dependencies.selectAccount(previousUserId);
    await dependencies.clearInMemoryState();
    await dependencies.bootstrapAccount(previous);
    if (previousUserId) await dependencies.restartSync();
  }

  return {
    async switchAccount(userId: string) {
      const previous = await begin();
      try {
        if (!(await dependencies.selectAccount(userId)))
          throw new Error("The selected account is not available on this device.");
        const session = await dependencies.readSession();
        if (session?.identity?.userId !== userId)
          throw new Error("The selected account session could not be verified.");
        return await finish(session);
      } catch (error) {
        await recover(previous).catch(() => undefined);
        throw error;
      } finally {
        switching = false;
      }
    },

    async activateSession(session: LocalSession) {
      const previous = await begin();
      try {
        await dependencies.writeSession(session);
        const stored = await dependencies.readSession();
        if (!stored || stored.identity?.userId !== session.identity?.userId)
          throw new Error("The new account session could not be verified.");
        return await finish(stored);
      } catch (error) {
        await recover(previous).catch(() => undefined);
        throw error;
      } finally {
        switching = false;
      }
    },

    async logout() {
      await begin();
      try {
        await dependencies.clearSession();
        await dependencies.bootstrapAccount(null);
      } finally {
        switching = false;
      }
    },
  };
}
