import { openDatabase } from "@/data/db/database";
import * as Network from "expo-network";
import type { LocalSession } from "@/domain/auth/localSession";
import {
  pauseOperationalSync,
  bootstrapActivatedAccount,
  restartOperationalSync,
} from "@/data/bootstrap/defaultBootstrapDependencies";

import { adoptLegacyAccountState } from "./accountLocalState";
import {
  clearLocalSession,
  readLocalSession,
  selectLocalAccount,
  writeLocalSession,
  prepareSessionInstall,
} from "./authRepository";
import { createAccountSwitchCoordinator } from "./accountSwitchCoordinator";
import { assertAccountRequestGeneration } from "./accountRequestContext";
import { sessionAccessToken } from "./sessionAccessToken";
import { revokeSupabaseDevSession, SupabaseDevAuthError } from "./devSupabaseAuth";
import { ApiClientError } from "@/data/api/client";

export function createDefaultAccountSwitchCoordinator(input: {
  clearInMemoryState(): void | Promise<void>;
  bootstrapAccount?(session: LocalSession | null): Promise<void>;
}) {
  return createAccountSwitchCoordinator({
    pauseSync: pauseOperationalSync,
    assertLogoutAllowed: async () => {
      const network = await Network.getNetworkStateAsync();
      if (network.isConnected !== true || network.isInternetReachable !== true)
        throw new Error("LOGOUT_REQUIRES_ONLINE");
    },
    restartSync: restartOperationalSync,
    revokeSession: async (_session, context) => {
      try {
        const { token } = await sessionAccessToken({ expectedUserId: context.accountId });
        assertAccountRequestGeneration(context);
        await revokeSupabaseDevSession(token);
      } catch (error) {
        // An explicitly invalid session is already unusable; transient failures retain local access.
        if (
          !(error instanceof SupabaseDevAuthError && error.kind === "invalid_session") &&
          !(
            error instanceof ApiClientError &&
            error.code === "AUTH_REQUIRED" &&
            error.status === 401
          )
        )
          throw error;
      }
    },
    readSession: readLocalSession,
    writeSession: writeLocalSession,
    prepareSessionInstall,
    clearSession: clearLocalSession,
    selectAccount: selectLocalAccount,
    adoptLocalState: async (userId) => {
      await adoptLegacyAccountState(await openDatabase(), userId);
    },
    clearInMemoryState: input.clearInMemoryState,
    bootstrapAccount: input.bootstrapAccount ?? bootstrapActivatedAccount,
  });
}
