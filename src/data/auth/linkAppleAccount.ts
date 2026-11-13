import { createAppleSignInAdapter } from "./appleSignIn";
import { getAccountGeneration } from "./accountGeneration";
import { withAccountApplyGate } from "./accountRequestContext";
import { readLocalSession, writeLocalSession } from "./authRepository";
import { linkSupabaseDevAppleIdentity } from "./devSupabaseAuth";

// Explicit Settings action only. Signing in never invokes identity linking.
export async function linkAppleToCurrentAccount(signal: AbortSignal) {
  const generation = getAccountGeneration();
  const current = await readLocalSession();
  if (!current?.accessToken || !current.identity?.userId)
    throw new Error("APPLE_SESSION_REQUIRED");
  const valid = () => !signal.aborted && getAccountGeneration() === generation;
  const adapter = createAppleSignInAdapter(undefined, async (credential, options) => {
    if (!valid() || credential.provider !== "apple")
      throw new Error("APPLE_ACCOUNT_CHANGED");
    return linkSupabaseDevAppleIdentity(
      { ...credential, provider: "apple" },
      current,
      options,
    );
  });
  const linked = await adapter.verify({ provider: "apple" }, signal);
  await withAccountApplyGate(async () => {
    const active = await readLocalSession();
    if (
      !valid() ||
      active?.identity?.userId !== current.identity?.userId ||
      active?.refreshToken !== current.refreshToken
    )
      throw new Error("APPLE_ACCOUNT_CHANGED");
    await writeLocalSession(linked);
  });
}
