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

export function createAuthRepository(storage: SecureSessionStorage) {
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

  async function storeAccountSession(
    session: LocalSession & { identity: AccountIdentity },
  ) {
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

  return {
    async readLocalSession(): Promise<LocalSession | null> {
      const index = await readIndex();
      if (index.activeUserId) {
        const raw = await storage.getItem(accountSessionStorageKey(index.activeUserId));
        if (raw) return JSON.parse(raw) as LocalSession;
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
      if (session.identity)
        return storeAccountSession({ ...session, identity: session.identity });
      await storage.setItem(legacySessionStorageKey, JSON.stringify(session));
    },

    async clearLocalSession() {
      const index = await readIndex();
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
      const [index, session] = await Promise.all([
        readIndex(),
        storage.getItem(accountSessionStorageKey(userId)),
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
}
