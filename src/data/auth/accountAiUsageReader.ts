import { assertAccountRequestContext, type AccountScope } from "./accountRequestContext";
import {
  accountAiUsageSnapshotSchema,
  type AccountAiUsageSnapshot,
} from "@/domain/auth/accountAiUsage";
export type AccountAiUsageRead =
  | Readonly<{ status: "UNAVAILABLE" }>
  | Readonly<{ status: "READY"; snapshot: AccountAiUsageSnapshot }>;
// Inject only the existing Meter's authorized Account reader; no guessed route or actor-name mapping.
export function createAccountAiUsageReader(
  account: () => Promise<string>,
  meter?: (scope: AccountScope) => Promise<unknown>,
) {
  return async (input: AccountScope): Promise<AccountAiUsageRead> => {
    const scope = Object.freeze({ ...input });
    await assertAccountRequestContext(scope, account);
    if (!meter) return { status: "UNAVAILABLE" };
    const snapshot = accountAiUsageSnapshotSchema.parse(await meter(scope));
    await assertAccountRequestContext(scope, account);
    if (snapshot.accountId !== scope.accountId) throw Error("AI_USAGE_ACCOUNT_MISMATCH");
    return { status: "READY", snapshot };
  };
}
