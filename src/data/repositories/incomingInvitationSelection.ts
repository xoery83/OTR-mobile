import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { SecureSessionStorage } from "@/data/auth/authSessionRepository";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountScope,
} from "@/data/auth/accountRequestContext";

const reference = z.strictObject({ tripId: coreUuid, inviteId: coreUuid });
const retained = reference.extend({ accountId: coreUuid, version: z.literal(1) });
export type IncomingInvitationReference = z.infer<typeof reference>;

// A selected reference restores navigation only. Auth's Reader still qualifies its recipient.
export function createIncomingInvitationSelection(
  storage: Pick<SecureSessionStorage, "getItem" | "setItem" | "deleteItem">,
  account: () => Promise<string>,
) {
  const key = (scope: AccountScope) => `otr.incoming-invitation.v1.${coreUuid.parse(scope.accountId)}`;
  async function scoped<T>(scope: AccountScope, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(scope, account);
      const value = await work();
      await assertAccountRequestContext(scope, account);
      return value;
    });
  }
  async function read(scope: AccountScope) {
    const raw = await storage.getItem(key(scope));
    if (raw === null) return null;
    const value = retained.parse(JSON.parse(raw));
    if (value.accountId !== scope.accountId) throw Error("INCOMING_REFERENCE_ACCOUNT_MISMATCH");
    return { tripId: value.tripId, inviteId: value.inviteId };
  }
  return {
    async open(scope: AccountScope, incoming: () => Promise<{ invitations: IncomingInvitationReference[] }>) {
      const selected = await scoped(scope, () => read(scope));
      if (selected) return { scope, selected, invitations: [] };
      const result = await incoming();
      await assertAccountRequestContext(scope, account);
      return { scope, selected: null, invitations: result.invitations };
    },
    read: (scope: AccountScope) => scoped(scope, () => read(scope)),
    select(scope: AccountScope, input: IncomingInvitationReference) {
      const value = reference.parse(input);
      return scoped(scope, async () => {
        const previous = await read(scope);
        if (previous && (previous.tripId !== value.tripId || previous.inviteId !== value.inviteId))
          throw Error("INCOMING_REFERENCE_PENDING");
        await storage.setItem(key(scope), JSON.stringify({ version: 1, accountId: scope.accountId, ...value }));
        return value;
      });
    },
    clear(scope: AccountScope, input: IncomingInvitationReference) {
      const value = reference.parse(input);
      return scoped(scope, async () => {
        const previous = await read(scope);
        if (!previous) return;
        if (previous.tripId !== value.tripId || previous.inviteId !== value.inviteId)
          throw Error("INCOMING_REFERENCE_CHANGED");
        await storage.deleteItem(key(scope));
      });
    },
  };
}
