import type { LocalSession } from "@/domain/auth/localSession";

const sessionStorageKey = "otr.mobile.session.v1";

export type SecureSessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
};

export function createAuthRepository(storage: SecureSessionStorage) {
  return {
    async readLocalSession(): Promise<LocalSession | null> {
      const raw = await storage.getItem(sessionStorageKey);
      return raw ? (JSON.parse(raw) as LocalSession) : null;
    },

    async writeLocalSession(session: LocalSession) {
      await storage.setItem(sessionStorageKey, JSON.stringify(session));
    },

    async clearLocalSession() {
      await storage.deleteItem(sessionStorageKey);
    },
  };
}
