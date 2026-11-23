import { readCommittedLocalPrincipal, requireAdoptedUserId } from "@/data/auth/authRepository";
import { createAccountProfileRepository } from "@/data/auth/accountProfileRepository";
import {
  assertAccountRequestContext,
  captureAccountScope,
} from "@/data/auth/accountRequestContext";
import { readInitializedDatabase } from "@/data/db/database";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

// Page entry reads only the committed Account and startup-owned local database.
export async function getDefaultAccountPrivateProfileEditor() {
  const generation = getAccountGeneration();
  const principal = await readCommittedLocalPrincipal();
  if (generation !== getAccountGeneration()) throw Error("Account changed during Profile entry.");
  if (principal?.kind === "GUEST") return null;
  const scope = await captureAccountScope(requireAdoptedUserId);
  if (scope.generation !== generation) throw Error("Account changed during Profile entry.");
  const database = await readInitializedDatabase();
  await assertAccountRequestContext(scope, requireAdoptedUserId);
  const { local } = createAccountProfileRepository(
    requireAdoptedUserId,
    {},
    undefined,
    database,
  );
  if (!local) throw Error("PRIVATE_PROFILE_LOCAL_UNAVAILABLE");
  return { scope, local };
}
