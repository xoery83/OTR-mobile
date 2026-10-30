import type { PreparedSessionInstall } from "./authSessionRepository";
import type { LocalSession } from "@/domain/auth/localSession";
import { getAccountGeneration } from "./accountGeneration";
import {
  assertAccountRequestGeneration,
  withAccountApplyGate,
  beginAccountTransition,
  endAccountTransition,
  type AccountTransitionLease,
  type AccountScope,
} from "./accountRequestContext";

export type AccountSwitchDependencies = {
  pauseSync(): Promise<void>;
  assertLogoutAllowed?(): Promise<void>;
  revokeSession?(session: LocalSession, context: AccountScope): Promise<void>;
  restartSync(): Promise<unknown>;
  readSession(): Promise<LocalSession | null>;
  writeSession(session: LocalSession): Promise<void>;
  prepareSessionInstall?(session: LocalSession): Promise<PreparedSessionInstall>;
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

  async function resumeRetainedAccount() {
    const generation = getAccountGeneration();
    let resumed: Promise<unknown> | undefined;
    try {
      // Another transition owns its pause/restart; never resume through its lease.
      assertAccountRequestGeneration({ accountId: "", generation });
      await withAccountApplyGate(
        async () => {
          const accountId = await readAccountId();
          assertAccountRequestGeneration({ accountId: accountId ?? "", generation });
          return accountId !== null;
        },
        (hasAccount) => {
          // Default restart releases the pause synchronously before async read work.
          assertAccountRequestGeneration({ accountId: "", generation });
          if (hasAccount) resumed = dependencies.restartSync();
        },
      );
      await resumed;
    } catch {
      // Retain the pause on a superseding transition or failed recovery.
    }
  }

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

  async function activate(
    install: (lease: AccountTransitionLease) => Promise<LocalSession>,
    expectedGeneration = getAccountGeneration(),
    prepare?: () => Promise<void>,
    releasePrepared?: () => void,
  ) {
    if (switching) throw new Error("An account transition is already in progress.");
    switching = true;
    let lease: AccountTransitionLease | null = null;
    let previous: LocalSession | null = null;
    let failed: { accountId: string | null; generation: number } | null = null;
    let paused = false;
    let preparedReleased = false;
    const releasePreparation = () => {
      if (preparedReleased) return;
      preparedReleased = true;
      releasePrepared?.();
    };
    try {
      await prepare?.();
      // Draining existing sync may wait for network; it must not hold the gate.
      paused = true;
      await dependencies.pauseSync();
      lease = await beginAccountTransition({
        accountId: await readAccountId(),
        generation: expectedGeneration,
        getAccountId: readAccountId,
      });
      if (!lease) throw new Error("The account changed before authentication completed.");
      previous = await dependencies.readSession();
      failed = {
        accountId: previous?.identity?.userId ?? null,
        generation: lease.generation,
      };
      await dependencies.clearInMemoryState();
      const session = await install(lease);
      const userId = session.identity?.userId;
      if (!userId) throw new Error("The selected account has no stable user identity.");
      failed.accountId = userId;
      await dependencies.adoptLocalState(userId);
      endAccountTransition(lease);
      lease = null;
      releasePreparation();
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
      releasePreparation();
      if (failed) await recover(previous, failed).catch(() => undefined);
      else if (paused) await resumeRetainedAccount();
      throw error;
    } finally {
      if (lease) endAccountTransition(lease);
      try {
        releasePreparation();
      } finally {
        switching = false;
      }
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
    activateSession(
      session: LocalSession,
      expectedGeneration?: number,
      signal?: AbortSignal,
    ) {
      const candidate = JSON.parse(JSON.stringify(session)) as LocalSession;
      let prepared: PreparedSessionInstall | undefined;
      return activate(
        async (lease) => {
          if (signal?.aborted) throw new Error("AUTH_ACTIVATION_CANCELED");
          if (prepared) await prepared.install(lease, signal);
          else await dependencies.writeSession(candidate);
          if (signal?.aborted) throw Error("AUTH_ACTIVATION_CANCELED");
          const stored = await dependencies.readSession();
          if (signal?.aborted) throw Error("AUTH_ACTIVATION_CANCELED");
          if (!stored || stored.identity?.userId !== candidate.identity?.userId)
            throw new Error("The new account session could not be verified.");
          return stored;
        },
        expectedGeneration,
        async () => {
          if (signal?.aborted) throw new Error("AUTH_ACTIVATION_CANCELED");
          if (dependencies.prepareSessionInstall)
            prepared = await dependencies.prepareSessionInstall(candidate);
        },
        () => prepared?.release(),
      );
    },
    async logout() {
      if (switching) throw new Error("An account transition is already in progress.");
      switching = true;
      let lease: AccountTransitionLease | null = null;
      let paused = false;
      try {
        const generation = getAccountGeneration();
        const session = await dependencies.readSession();
        const accountId = session?.identity?.userId ?? null;
        await dependencies.assertLogoutAllowed?.();
        paused = true;
        await dependencies.pauseSync();
        await dependencies.assertLogoutAllowed?.();
        if (session && accountId && dependencies.revokeSession) {
          const context = { accountId, generation };
          assertAccountRequestGeneration(context);
          if (accountId !== (await readAccountId()))
            throw new Error("AUTH_CONTEXT_CHANGED");
          assertAccountRequestGeneration(context);
          await dependencies.revokeSession(session, context);
        }
        lease = await beginAccountTransition({
          generation,
          accountId,
          getAccountId: readAccountId,
        });
        if (!lease) throw new Error("AUTH_CONTEXT_CHANGED");
        await dependencies.clearInMemoryState();
        await dependencies.clearSession();
        endAccountTransition(lease);
        lease = null;
        await dependencies.bootstrapAccount(null);
      } catch (error) {
        if (lease) {
          endAccountTransition(lease);
          lease = null;
        }
        if (paused) await resumeRetainedAccount();
        throw error;
      } finally {
        if (lease) endAccountTransition(lease);
        switching = false;
      }
    },
  };
}
