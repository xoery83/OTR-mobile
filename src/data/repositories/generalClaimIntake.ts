import { z } from "zod";
import { utf8ToBytes } from "@noble/hashes/utils";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createUuid } from "@/domain/localId";
import type { SecureSessionStorage } from "@/data/auth/authSessionRepository";
import { assertAccountRequestContext, withAccountApplyGate, type AccountRequestContext } from "@/data/auth/accountRequestContext";
import { claimOriginVerificationInputSchema, claimOriginVerificationSchema } from "@/data/api/claimOriginContracts";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

const reference = z.strictObject({ tripId: coreUuid, inviteId: coreUuid, requestId: coreUuid });
const source = z.strictObject({ tripId: coreUuid, inviteId: coreUuid, purpose: z.literal("PERSON_CLAIM"), token: z.string().min(1) });
const retained = source.extend({ version: z.literal(1), requestId: coreUuid, accountId: coreUuid.nullable() });
const key = "otr.general-claim-intake.v1";
type Reference = z.infer<typeof reference>;

// shortcut: One active General intent per device; add slots when simultaneous intake is required.
// This private bearer store restores intent, never Account/Person authority or a Claim receipt.
export function createGeneralClaimIntake(
  storage: Pick<SecureSessionStorage, "getItem" | "setItem" | "deleteItem">,
  account: () => Promise<string>,
  verifyOrigin: (context: AccountRequestContext, input: z.infer<typeof claimOriginVerificationInputSchema>) => Promise<z.infer<typeof claimOriginVerificationSchema>>,
) {
  async function read() {
    try {
      const raw = await storage.getItem(key);
      return raw === null ? null : retained.parse(JSON.parse(raw));
    } catch { throw Error("GENERAL_INTAKE_UNAVAILABLE"); }
  }
  async function write(value: z.infer<typeof retained>) {
    try { await storage.setItem(key, JSON.stringify(value)); }
    catch { throw Error("GENERAL_INTAKE_UNAVAILABLE"); }
  }
  async function remove() {
    try { await storage.deleteItem(key); }
    catch { throw Error("GENERAL_INTAKE_UNAVAILABLE"); }
  }
  const ref = (value: z.infer<typeof retained>): Reference => reference.parse({ tripId: value.tripId, inviteId: value.inviteId, requestId: value.requestId });
  async function scoped<T>(input: AccountRequestContext, work: (scope: AccountRequestContext) => Promise<T>) {
    const scope = Object.freeze({ ...input });
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(scope, account);
      const value = await work(scope);
      await assertAccountRequestContext(scope, account);
      return value;
    });
  }
  async function bound(scope: AccountRequestContext) {
    const saved = await read();
    if (!saved || saved.accountId !== scope.accountId || saved.tripId !== scope.tripId)
      throw Error("GENERAL_INTAKE_EXPLICIT_ACCOUNT_REQUIRED");
    return saved;
  }
  return {
    continuationReference() {
      const generation = getAccountGeneration();
      return withAccountApplyGate(async () => {
        const saved = await read();
        if (!saved) return null;
        if (saved.accountId === null) return { reference: ref(saved), requiresAccountConfirmation: true };
        try { await assertAccountRequestContext({ accountId: saved.accountId, tripId: saved.tripId, generation }, account); }
        catch { return null; }
        return { reference: ref(saved), requiresAccountConfirmation: false };
      });
    },
    capture(input: z.infer<typeof source>) {
      return withAccountApplyGate(async () => {
        const parsed = source.safeParse(input);
        if (!parsed.success || verificationBytes(parsed.data) > 8192) throw Error("GENERAL_INTAKE_INVALID");
        const saved = await read();
        if (saved) {
          if (saved.accountId !== null || saved.tripId !== parsed.data.tripId || saved.inviteId !== parsed.data.inviteId || saved.token !== parsed.data.token)
            throw Error("GENERAL_INTAKE_PENDING");
          return ref(saved);
        }
        const value = retained.parse({ ...parsed.data, version: 1, requestId: createUuid(), accountId: null });
        await write(value);
        return ref(value);
      });
    },
    confirmAccount(context: AccountRequestContext, requestId: string) {
      coreUuid.parse(requestId);
      return scoped(context, async scope => {
        const saved = await read();
        if (!saved || saved.requestId !== requestId || saved.tripId !== scope.tripId ||
            (saved.accountId !== null && saved.accountId !== scope.accountId)) throw Error("GENERAL_INTAKE_TARGET_CHANGED");
        await assertAccountRequestContext(scope, account);
        await write({ ...saved, accountId: scope.accountId });
        return ref(saved);
      });
    },
    reference: (context: AccountRequestContext) => scoped(context, async scope => ref(await bound(scope))),
    async verify(context: AccountRequestContext) {
      const scope = Object.freeze({ ...context });
      const saved = await scoped(scope, bound);
      let result: z.infer<typeof claimOriginVerificationSchema>;
      try {
        result = claimOriginVerificationSchema.parse(await verifyOrigin(scope, { requestId: saved.requestId,
          inviteId: saved.inviteId, purpose: saved.purpose, token: saved.token }));
      } catch { throw Error("GENERAL_INTAKE_VERIFICATION_UNAVAILABLE"); }
      return scoped(scope, async current => {
        const fresh = await bound(current);
        if (fresh.requestId !== saved.requestId || fresh.token !== saved.token || result.accountId !== current.accountId ||
            result.tripId !== current.tripId || result.requestId !== saved.requestId || result.inviteId !== saved.inviteId)
          throw Error("GENERAL_INTAKE_VERIFICATION_MISMATCH");
        return result;
      });
    },
    cancel(context: AccountRequestContext, requestId: string) {
      coreUuid.parse(requestId);
      return scoped(context, async scope => {
        if ((await bound(scope)).requestId !== requestId) throw Error("GENERAL_INTAKE_TARGET_CHANGED");
        await assertAccountRequestContext(scope, account);
        await remove();
      });
    },
    discardBeforeLogin(requestId: string) {
      coreUuid.parse(requestId);
      return withAccountApplyGate(async () => {
        const saved = await read();
        if (!saved || saved.accountId !== null || saved.requestId !== requestId) throw Error("GENERAL_INTAKE_TARGET_CHANGED");
        await remove();
      });
    },
  };
}

// Same transport ceiling as the verifier, including IDs added before verification; no token format assumption.
function verificationBytes(value: z.infer<typeof source>) {
  return utf8ToBytes(JSON.stringify({ requestId: "00000000-0000-4000-8000-000000000000",
    inviteId: value.inviteId, purpose: value.purpose, token: value.token })).byteLength;
}
