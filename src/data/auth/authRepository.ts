import * as SecureStore from "expo-secure-store";

import { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";

export type { LocalSession } from "@/domain/auth/localSession";
export { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";

const secureStoreAdapter: SecureSessionStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  deleteItem: SecureStore.deleteItemAsync,
};

const authRepository = createAuthRepository(secureStoreAdapter);

export const readLocalSession = authRepository.readLocalSession;
export const writeLocalSession = authRepository.writeLocalSession;
export const clearLocalSession = authRepository.clearLocalSession;
