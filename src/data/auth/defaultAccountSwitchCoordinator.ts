import { openDatabase } from "@/data/db/database";
import type { LocalSession } from "@/domain/auth/localSession";
import {
  pauseOperationalSync,
  restartOperationalSync,
} from "@/data/bootstrap/defaultBootstrapDependencies";

import { adoptLegacyAccountState } from "./accountLocalState";
import {
  clearLocalSession,
  readLocalSession,
  selectLocalAccount,
  writeLocalSession,
} from "./authRepository";
import { createAccountSwitchCoordinator } from "./accountSwitchCoordinator";

export function createDefaultAccountSwitchCoordinator(input: {
  clearInMemoryState(): void | Promise<void>;
  bootstrapAccount(session: LocalSession | null): Promise<void>;
}) {
  return createAccountSwitchCoordinator({
    pauseSync: pauseOperationalSync,
    restartSync: restartOperationalSync,
    readSession: readLocalSession,
    writeSession: writeLocalSession,
    clearSession: clearLocalSession,
    selectAccount: selectLocalAccount,
    adoptLocalState: async (userId) => {
      await adoptLegacyAccountState(await openDatabase(), userId);
    },
    clearInMemoryState: input.clearInMemoryState,
    bootstrapAccount: input.bootstrapAccount,
  });
}
