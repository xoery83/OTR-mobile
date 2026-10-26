import { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";

export type { AccountIdentity, LocalSession } from "@/domain/auth/localSession";
export { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";

// Metro must bundle this dependency; defer evaluation for the headless host.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const secureStore = () =>
  require("expo-secure-store") as typeof import("expo-secure-store");

const secureStoreAdapter: SecureSessionStorage = {
  getItem: async (key) => (await secureStore()).getItemAsync(key),
  setItem: async (key, value) => (await secureStore()).setItemAsync(key, value),
  deleteItem: async (key) => (await secureStore()).deleteItemAsync(key),
};

const authRepository = createAuthRepository(secureStoreAdapter);

export const readAdoptedLocalSession = authRepository.readAdoptedLocalSession;
export const readLocalSession = authRepository.readLocalSession;
export const writeLocalSession = authRepository.writeLocalSession;
export const clearLocalSession = authRepository.clearLocalSession;
export const listLocalAccounts = authRepository.listAccounts;
export const selectLocalAccount = authRepository.selectAccount;
export const removeLocalAccount = authRepository.removeAccount;

export async function requireActiveUserId() {
  const userId = (await readLocalSession())?.identity?.userId;
  if (!userId) throw new Error("An authenticated account identity is required.");
  return userId;
}

export async function requireAdoptedUserId() {
  const userId = (await readAdoptedLocalSession())?.identity?.userId;
  if (!userId) throw new Error("An adopted account identity is required.");
  return userId;
}
