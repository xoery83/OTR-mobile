import { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";
import { withAccountApplyGate } from "./accountRequestContext";
import { createUuid } from "@/domain/localId";

export type { AccountIdentity, LocalSession } from "@/domain/auth/localSession";
export { createAuthRepository, type SecureSessionStorage } from "./authSessionRepository";
export type { LaunchIdentity, GuestPrincipal } from "./guestPrincipalRepository";

// Metro must bundle this dependency; defer evaluation for the headless host.
const secureStore = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("expo-secure-store") as typeof import("expo-secure-store");

const secureStoreAdapter: SecureSessionStorage = {
  getItem: async (key) => (await secureStore()).getItemAsync(key),
  setItem: async (key, value) => (await secureStore()).setItemAsync(key, value),
  deleteItem: async (key) => (await secureStore()).deleteItemAsync(key),
};

const authRepository = createAuthRepository(secureStoreAdapter, createUuid, {
  async prepareEmptyGuest(localId) {
    // Lazy evaluation preserves the existing Auth/workspace dependency boundary.
    const { openGuestLocalWorkspace } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./guestLocalWorkspace") as typeof import("./guestLocalWorkspace");
    const workspace = await openGuestLocalWorkspace();
    if (workspace.scope.localId !== localId) throw Error("GUEST_LOCAL_SCOPE_CHANGED");
    return workspace.prepareEmptySessionInstall();
  },
});

// UI account readers must not choose Guest identity or adopt legacy credentials.
export function readCommittedLocalSession() {
  return withAccountApplyGate(authRepository.readAdoptedLocalSession);
}

export function readCommittedLocalPrincipal() {
  return withAccountApplyGate(authRepository.readCommittedLocalPrincipal);
}

// Internal local-repository identity getter; callers already use the apply gate.
// Do not acquire it again: existing repository transactions hold the same gate.
export async function requireCommittedGuestPrincipal() {
  const principal = await authRepository.readCommittedLocalPrincipal();
  if (principal?.kind !== "GUEST") throw new Error("GUEST_LOCAL_SCOPE_REQUIRED");
  return principal;
}

export function readLocalAuthSnapshot() {
  return withAccountApplyGate(authRepository.readLocalAuthSnapshot);
}

export async function readLaunchIdentity() {
  return (await readLocalAuthSnapshot()).principal;
}

export const readAdoptedLocalSession = authRepository.readAdoptedLocalSession;
export const readLocalSession = authRepository.readLocalSession;
export const writeLocalSession = authRepository.writeLocalSession;
export const prepareSessionInstall = authRepository.prepareSessionInstall;
export const clearLocalSession = authRepository.clearLocalSession;
export const listLocalAccounts = authRepository.listAccounts;
export const selectLocalAccount = authRepository.selectAccount;
export const removeLocalAccount = authRepository.removeAccount;
// Internal adoption token provider; its methods retain Guest/binding/apply-gate checks.
export const guestVerificationSession = authRepository.guestVerification;

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
