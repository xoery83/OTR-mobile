import {
  createGuestPrincipalRepository,
  type LaunchIdentity,
} from "./guestPrincipalRepository";
import {
  identityFromAccessToken,
  type AccountIdentity,
  type LocalSession,
} from "@/domain/auth/localSession";

const legacySessionStorageKey = "otr.mobile.session.v1";
const accountIndexStorageKey = "otr.mobile.accounts.v2";
const accountSessionStorageKey = (userId: string) => `otr.mobile.session.v2.${userId}`;

type AccountIndex = {
  activeUserId: string | null;
  accounts: AccountIdentity[];
};

export type SecureSessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
};

export function createAuthRepository(
  storage: SecureSessionStorage,
  createGuestId: () => string = () => {
    throw new Error("Guest creation belongs to the launch boundary.");
  },
) {
  const launch = createGuestPrincipalRepository(storage, createGuestId);
  async function readIndex(): Promise<AccountIndex> {
    const raw = await storage.getItem(accountIndexStorageKey);
    if (!raw) return { activeUserId: null, accounts: [] };
    try {
      const parsed = JSON.parse(raw) as AccountIndex;
      return Array.isArray(parsed.accounts)
        ? parsed
        : { activeUserId: null, accounts: [] };
    } catch {
      return { activeUserId: null, accounts: [] };
    }
  }

  async function writeIndex(index: AccountIndex) {
    await storage.setItem(accountIndexStorageKey, JSON.stringify(index));
  }

  async function readPrincipalIndex(): Promise<AccountIndex | null> {
    const raw = await storage.getItem(accountIndexStorageKey);
    if (raw === null) return null;
    try {
      const index = JSON.parse(raw) as Partial<AccountIndex> | null;
      if (!index || !Array.isArray(index.accounts)) throw new Error();
      const ids = index.accounts.map((account) => account?.userId);
      if (
        ids.some((id) => typeof id !== "string" || !id) ||
        new Set(ids).size !== ids.length ||
        (index.activeUserId !== null &&
          (typeof index.activeUserId !== "string" ||
            !index.activeUserId ||
            !ids.includes(index.activeUserId)))
      )
        throw new Error();
      return index as AccountIndex;
    } catch {
      throw new Error("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
    }
  }

  async function readAccountSession(userId: string): Promise<LocalSession | null> {
    const raw = await storage.getItem(accountSessionStorageKey(userId));
    if (!raw) return null;
    const session = JSON.parse(raw) as LocalSession;
    const claims = identityFromAccessToken(session.accessToken);
    if (session.identity?.userId !== userId || (claims && claims.userId !== userId))
      throw new Error("SESSION_IDENTITY_MISMATCH");
    return session;
  }

  async function storeAccountSession(
    session: LocalSession & { identity: AccountIdentity },
  ) {
    const claims = identityFromAccessToken(session.accessToken);
    if (!session.identity.userId || (claims && claims.userId !== session.identity.userId))
      throw new Error("SESSION_IDENTITY_MISMATCH");
    await launch.assertNoGuestAdoption();
    await launch.markPreviouslySignedIn();
    const index = await readIndex();
    const accounts = index.accounts.filter(
      (account) => account.userId !== session.identity.userId,
    );
    accounts.push(session.identity);
    await storage.setItem(
      accountSessionStorageKey(session.identity.userId),
      JSON.stringify(session),
    );
    await writeIndex({ activeUserId: session.identity.userId, accounts });
    await storage.deleteItem(legacySessionStorageKey);
  }

  const repository = {
    // Diagnostics may observe only an already adopted active v2 session.
    // Startup/auth owns legacy adoption; this boundary never installs or deletes.
    async readAdoptedLocalSession(): Promise<LocalSession | null> {
      const index = await readIndex();
      if (index.activeUserId) {
        const session = await readAccountSession(index.activeUserId);
        if (!session) throw new Error("SESSION_NOT_ADOPTED");
        return session;
      }
      if (await storage.getItem(legacySessionStorageKey))
        throw new Error("SESSION_NOT_ADOPTED");
      return null;
    },

    async readLocalSession(): Promise<LocalSession | null> {
      const index = await readIndex();
      if (index.activeUserId) {
        const session = await readAccountSession(index.activeUserId);
        if (!session) throw new Error("SESSION_NOT_ADOPTED");
        return session;
      }

      const raw = await storage.getItem(legacySessionStorageKey);
      if (!raw) return null;
      const legacy = JSON.parse(raw) as LocalSession;
      const identity = legacy.identity ?? identityFromAccessToken(legacy.accessToken);
      if (identity) {
        const adopted = { ...legacy, identity };
        await storeAccountSession(adopted);
        return adopted;
      }
      return legacy;
    },

    async writeLocalSession(session: LocalSession) {
      await launch.assertNoGuestAdoption();
      if (session.identity)
        return storeAccountSession({ ...session, identity: session.identity });
      await storage.setItem(legacySessionStorageKey, JSON.stringify(session));
    },

    async clearLocalSession() {
      const index = await readIndex();
      if (index.activeUserId || (await storage.getItem(legacySessionStorageKey)))
        await launch.markPreviouslySignedIn();
      if (!index.activeUserId) {
        await storage.deleteItem(legacySessionStorageKey);
        return;
      }
      await storage.deleteItem(accountSessionStorageKey(index.activeUserId));
      await writeIndex({
        activeUserId: null,
        accounts: index.accounts.filter(
          (account) => account.userId !== index.activeUserId,
        ),
      });
    },

    async listAccounts() {
      const index = await readIndex();
      return index.accounts.map((account) => ({
        ...account,
        active: account.userId === index.activeUserId,
      }));
    },

    async selectAccount(userId: string) {
      await launch.assertNoGuestAdoption();
      const [index, session] = await Promise.all([
        readIndex(),
        readAccountSession(userId),
      ]);
      if (!session || !index.accounts.some((account) => account.userId === userId))
        return false;
      await writeIndex({ ...index, activeUserId: userId });
      return true;
    },

    async removeAccount(userId: string) {
      const index = await readIndex();
      await storage.deleteItem(accountSessionStorageKey(userId));
      await writeIndex({
        activeUserId: index.activeUserId === userId ? null : index.activeUserId,
        accounts: index.accounts.filter((account) => account.userId !== userId),
      });
    },
  };
  return {
    ...repository,
    async readCommittedLocalPrincipal(): Promise<LaunchIdentity | null> {
      const index = await readPrincipalIndex();
      const session = index?.activeUserId
        ? await readAccountSession(index.activeUserId)
        : null;
      if (index?.activeUserId && !session) throw new Error("SESSION_NOT_ADOPTED");
      if (session?.identity?.userId)
        return { kind: "ACCOUNT", accountId: session.identity.userId };
      if (session) throw new Error("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
      if ((await storage.getItem(legacySessionStorageKey)) !== null)
        throw new Error("SESSION_NOT_ADOPTED");
      const stored = await launch.readStoredIdentity();
      if (stored?.kind === "GUEST" && index)
        throw new Error("LOCAL_PRINCIPAL_RECOVERY_REQUIRED");
      return stored ?? (index ? { kind: "SIGNED_OUT" } : null);
    },
    async readLocalAuthSnapshot() {
      const session = await repository.readLocalSession();
      return { session, principal: await launch.readLaunchIdentity(session) };
    },
  };
}
