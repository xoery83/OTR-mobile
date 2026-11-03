import type { MemberClaimAuthorityPort, MemberClaimTransaction } from "./tripMemberClaimAuthority";
import { parseMemberClaimQaCase, type MemberClaimQaCase } from "./tripMemberClaimQa";

// Narrows the existing finite QA port; the underlying PG transaction still owns its locks.
export function createMemberClaimQaRecoveryOnly(
  underlying: MemberClaimAuthorityPort,
  input: MemberClaimQaCase,
): MemberClaimAuthorityPort {
  const qa = Object.freeze(parseMemberClaimQaCase(input));
  return {
    async atomic(scope, work) {
      if (scope.tripId !== qa.tripId || scope.actorAccountId !== qa.ownerAccountId)
        throw Error("MEMBER_CLAIM_RECOVERY_ONLY");
      return underlying.atomic(scope, async (tx) => {
        let failed = false, active = true, pending = 0;
        const guarded = Object.fromEntries(Object.entries(tx).map(([name, method]) => [
          name,
          (...args: unknown[]) => {
            const task = (async () => {
              pending++;
              try {
                if (!active || failed || args.length !== 1 || !(
                  (name === "currentEffectiveAccess" && args[0] === qa.ownerAccountId) ||
                  (name === "receipt" && args[0] === qa.issueOperationId)
                )) throw Error("MEMBER_CLAIM_RECOVERY_ONLY");
                return await (method as (...values: unknown[]) => Promise<unknown>)(...args);
              } catch (error) {
                failed = true;
                throw error;
              } finally { pending--; }
            })();
            void task.catch(() => {});
            return task;
          },
        ])) as MemberClaimTransaction;
        try {
          const result = await work(guarded);
          if (failed || pending !== 0) throw Error("MEMBER_CLAIM_RECOVERY_ONLY");
          return result;
        } finally { active = false; }
      });
    },
  };
}
