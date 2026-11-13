import { requireAdoptedUserId } from "@/data/auth/authRepository";
import { createAccountProfileRepository } from "@/data/auth/accountProfileRepository";
import {
  assertAccountRequestContext,
  captureAccountScope,
} from "@/data/auth/accountRequestContext";
import { readInitializedDatabase } from "@/data/db/database";

// Page entry reads only the committed Account and startup-owned local database.
export async function getDefaultAccountPrivateProfileEditor() {
  const scope = await captureAccountScope(requireAdoptedUserId);
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
