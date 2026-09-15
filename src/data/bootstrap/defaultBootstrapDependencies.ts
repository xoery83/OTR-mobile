import { readLocalSession } from "@/data/auth/authRepository";
import { revalidateStoredSupabaseDevSession } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import { getSyncTransportMode } from "@/data/sync/transportSelection";
import { AppState } from "react-native";

import type { FoundationBootstrapDependencies } from "./bootstrapApplication";

export const defaultBootstrapDependencies: FoundationBootstrapDependencies = {
  openDatabase,
  readLocalSession,
  resumeSync: resumeOperationalSync,
};

export function subscribeOperationalSyncLifecycle() {
  return AppState.addEventListener("change", (state) => {
    if (state === "active") void resumeOperationalSync().catch(() => undefined);
  });
}

async function resumeOperationalSync() {
  const session = await readLocalSession();
  const expired =
    !session?.accessToken ||
    !session.expiresAt ||
    Date.parse(session.expiresAt) <= Date.now();
  if (getSyncTransportMode() === "dev" && session?.refreshToken && expired)
    await revalidateStoredSupabaseDevSession();
  await runLedgerOperationalSync();
}
