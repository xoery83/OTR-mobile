import { z } from "zod";
import type { SecureSessionStorage } from "@/data/auth/authSessionRepository";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  memberClaimCommandSchema,
  memberClaimOutcomeSchema,
  type MemberClaimCommand,
} from "@/data/api/memberClaimContracts";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  createMemberClaimRepository,
  MemberClaimNoCommitError,
} from "./memberClaimRepository";
import {
  claimResolutionCommandSchema, claimResolutionReceiptSchema,
  type ClaimResolutionCommand,
} from "@/data/api/claimResolutionContracts";
import { createClaimResolutionRepository, resolutionIntentDigest, resolutionReceiptForCommand } from "./claimResolutionRepository";
import { generalInviteIssueSchema, generalInviteReceiptSchema, generalInviteReceiptForOriginal, type GeneralInviteIssue } from "@/data/api/generalInviteContracts";
import { createGeneralInviteRepository } from "./generalInviteRepository";

const retainedSchema = z.strictObject({
  version: z.literal(1),
  accountId: coreUuid,
  tripId: coreUuid,
  original: memberClaimCommandSchema,
  outcome: memberClaimOutcomeSchema.nullable(),
  rejection: z
    .enum(["CLOSED_BEFORE_AUTHORITY", "DENIED_WITHOUT_MUTATION"])
    .nullable()
    .default(null),
});
type Retained = z.infer<typeof retainedSchema>;
const resolutionRetainedSchema = z.strictObject({
  version: z.literal(2), accountId: coreUuid, tripId: coreUuid,
  original: claimResolutionCommandSchema,
  intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  receipt: claimResolutionReceiptSchema.nullable(),
  rejectionSource: z.literal("INITIAL_EXECUTION").optional(),
  rejection: z.strictObject({
    kind: z.enum(["CONFLICT_WITHOUT_MUTATION", "DENIED_WITHOUT_MUTATION"]),
    currentRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  }).nullable().default(null),
});
const generalRetainedSchema = z.strictObject({
  version: z.literal(3), accountId: coreUuid, tripId: coreUuid, original: generalInviteIssueSchema,
  receipt: generalInviteReceiptSchema.nullable(),
  rejection: z.enum(["CONFLICT_WITHOUT_MUTATION", "DENIED_WITHOUT_MUTATION", "CLOSED_BEFORE_AUTHORITY"]).nullable(),
  rejectionSource: z.literal("INITIAL_EXECUTION").optional(),
});
const anyRetainedSchema = z.discriminatedUnion("version", [retainedSchema, resolutionRetainedSchema, generalRetainedSchema]);

// A private recovery checkpoint for the existing online authority, never a sync queue or access grant.
export function createMemberClaimAttemptRepository(
  storage: Pick<SecureSessionStorage, "getItem" | "setItem" | "deleteItem">,
  account: () => Promise<string>,
  authority: Pick<
    ReturnType<typeof createMemberClaimRepository>,
    "execute" | "recover"
  > = createMemberClaimRepository(account),
  resolution: Pick<ReturnType<typeof createClaimResolutionRepository>, "execute" | "recover"> = createClaimResolutionRepository(account),
  general: Pick<ReturnType<typeof createGeneralInviteRepository>, "issue" | "recover"> = createGeneralInviteRepository(account),
) {
  const key = (scope: AccountRequestContext, resolvedOperation?: string) =>
    `otr.member-claim-attempt.v1.${scope.accountId}.${scope.tripId}${resolvedOperation ? `.resolved.${resolvedOperation}` : ""}`;
  async function scoped<T>(
    input: AccountRequestContext,
    work: (scope: AccountRequestContext) => Promise<T>,
  ) {
    const scope = Object.freeze({ ...input });
    coreUuid.parse(scope.accountId);
    coreUuid.parse(scope.tripId);
    const result = await withAccountApplyGate(async () => {
      await assertAccountRequestContext(scope, account);
      const result = await work(scope);
      await assertAccountRequestContext(scope, account);
      return result;
    });
    await assertAccountRequestContext(scope, account);
    return result;
  }
  async function readAny(
    scope: AccountRequestContext,
    resolvedOperation?: string,
  ) {
    const raw = await storage.getItem(key(scope, resolvedOperation));
    if (raw === null) return null;
    const value = anyRetainedSchema.parse(JSON.parse(raw));
    if (
      value.accountId !== scope.accountId ||
      value.tripId !== scope.tripId ||
      (value.version === 1 && value.original.tripId !== scope.tripId) ||
      (resolvedOperation !== undefined &&
        value.original.operationId !== resolvedOperation)
    )
      throw Error("MEMBER_CLAIM_CHECKPOINT_SCOPE_MISMATCH");
    if (value.version === 2) {
      if (value.receipt && value.rejection) throw Error("CLAIM_RESOLUTION_CHECKPOINT_DISPOSITION_MISMATCH");
      if (value.intentDigest !== resolutionIntentDigest(scope, value.original))
        throw Error("CLAIM_RESOLUTION_CHECKPOINT_DIGEST_MISMATCH");
      if (value.receipt) resolutionReceiptForCommand(scope, value.original, value.receipt);
    }
    if (value.version === 3) {
      if (value.receipt && value.rejection) throw Error("GENERAL_INVITE_CHECKPOINT_DISPOSITION_MISMATCH");
      if (value.receipt) generalInviteReceiptForOriginal({ actorAccountId: scope.accountId, tripId: scope.tripId }, value.original, value.receipt);
    }
    return value;
  }
  async function readGeneral(scope: AccountRequestContext, operationId?: string) {
    const value = await readAny(scope, operationId);
    if (value && value.version !== 3) throw Error("MEMBER_CLAIM_RECOVER_ORIGINAL_REQUIRED");
    return value;
  }
  async function retainGeneral(context: AccountRequestContext, original: GeneralInviteIssue, disposition: {
    receipt: z.infer<typeof generalInviteReceiptSchema> | null;
    rejection: z.infer<typeof generalRetainedSchema>["rejection"];
  }) {
    return scoped(context, async scope => {
      const prior = await readGeneral(scope);
      if (!prior || JSON.stringify(prior.original) !== JSON.stringify(original)) throw Error("MEMBER_CLAIM_ORIGINAL_CHANGED");
      const value = generalRetainedSchema.parse({ ...prior, ...disposition,
        rejectionSource: disposition.rejection ? "INITIAL_EXECUTION" : undefined });
      if (value.receipt) generalInviteReceiptForOriginal({ actorAccountId: scope.accountId, tripId: scope.tripId }, original, value.receipt);
      await storage.setItem(key(scope), JSON.stringify(value));
    });
  }
  async function read(scope: AccountRequestContext, operationId?: string) {
    const value = await readAny(scope, operationId);
    if (value && value.version !== 1) throw Error("CLAIM_RESOLUTION_RECOVER_ORIGINAL_REQUIRED");
    return value;
  }
  async function readResolution(scope: AccountRequestContext, operationId?: string) {
    const value = await readAny(scope, operationId);
    if (value && value.version !== 2) throw Error("MEMBER_CLAIM_RECOVER_ORIGINAL_REQUIRED");
    return value;
  }
  async function retainResolutionReceipt(context: AccountRequestContext, command: ClaimResolutionCommand, input: unknown) {
    const receipt = resolutionReceiptForCommand(context, command, input);
    await scoped(context, async scope => {
      const prior = await readResolution(scope);
      if (!prior || (prior.rejection && prior.rejectionSource === "INITIAL_EXECUTION") || JSON.stringify(prior.original) !== JSON.stringify(command))
        throw Error("MEMBER_CLAIM_ORIGINAL_CHANGED");
      await storage.setItem(key(scope), JSON.stringify({ ...prior, receipt, rejection: null, rejectionSource: undefined }));
    });
    return receipt;
  }
  async function retainResolutionRejection(context: AccountRequestContext, original: ClaimResolutionCommand,
    rejection: NonNullable<z.infer<typeof resolutionRetainedSchema>["rejection"]>) {
    await scoped(context, async scope => {
      const prior = await readResolution(scope);
      if (!prior || prior.receipt || JSON.stringify(prior.original) !== JSON.stringify(original))
        throw Error("MEMBER_CLAIM_ORIGINAL_CHANGED");
      // Only the owning typed response proves this exact intent did not commit; never an arbitrary HTTP409.
      await storage.setItem(key(scope), JSON.stringify({ ...prior,
        rejection, rejectionSource: "INITIAL_EXECUTION" }));
    });
  }
  async function write(scope: AccountRequestContext, value: Retained) {
    await storage.setItem(key(scope), JSON.stringify(retainedSchema.parse(value)));
  }
  async function retainOutcome(
    context: AccountRequestContext,
    original: MemberClaimCommand,
    outcome: z.infer<typeof memberClaimOutcomeSchema>,
  ) {
    await scoped(context, async (scope) => {
      const prior = await read(scope);
      if (!prior || JSON.stringify(prior.original) !== JSON.stringify(original))
        throw Error("MEMBER_CLAIM_ORIGINAL_CHANGED");
      await write(scope, { ...prior, outcome });
    });
    return outcome;
  }
  return {
    readGeneralInvite: (context: AccountRequestContext, operationId?: string) => scoped(context, async scope => {
      if (operationId) { coreUuid.parse(operationId); return readGeneral(scope, operationId); }
      const active = await readAny(scope);
      if (active?.version === 3) return active;
      const last = await storage.getItem(`${key(scope)}.general-last`);
      return last === null ? null : readGeneral(scope, coreUuid.parse(last));
    }),
    async issueGeneralInviteOnce(context: AccountRequestContext, input: GeneralInviteIssue) {
      context = Object.freeze({ ...context }); const original = generalInviteIssueSchema.parse(input);
      await scoped(context, async scope => {
        if (await readAny(scope, original.operationId)) throw Error("MEMBER_CLAIM_OPERATION_ALREADY_RESOLVED");
        if (await readAny(scope)) throw Error("MEMBER_CLAIM_RECOVER_ORIGINAL_REQUIRED");
        await storage.setItem(key(scope), JSON.stringify(generalRetainedSchema.parse({ version: 3, accountId: scope.accountId,
          tripId: scope.tripId, original, receipt: null, rejection: null })));
      });
      const value = await general.issue(context, original);
      await assertAccountRequestContext(context, account);
      if (value.status === "RECORDED") await retainGeneral(context, original, { receipt: value.receipt, rejection: null });
      if (["CONFLICT", "DENIED", "CLOSED"].includes(value.status)) await retainGeneral(context, original, { receipt: null,
        rejection: value.status === "CONFLICT" ? "CONFLICT_WITHOUT_MUTATION" : value.status === "DENIED" ? "DENIED_WITHOUT_MUTATION" : "CLOSED_BEFORE_AUTHORITY" });
      return value;
    },
    async recoverGeneralInvite(context: AccountRequestContext) {
      context = Object.freeze({ ...context }); const saved = await scoped(context, readGeneral);
      if (!saved) throw Error("MEMBER_CLAIM_ORIGINAL_REQUIRED");
      if (saved.receipt) return { status: "FOUND" as const, receipt: saved.receipt };
      if (saved.rejection && saved.rejectionSource === "INITIAL_EXECUTION") return { status: "CONFLICT" as const };
      const value = await general.recover(context, saved.original);
      await assertAccountRequestContext(context, account);
      if (value.status === "FOUND") await retainGeneral(context, saved.original, { receipt: value.receipt, rejection: null });
      return value;
    },
    async clearResolvedGeneralInvite(context: AccountRequestContext, operationId: string) {
      coreUuid.parse(operationId);
      return scoped(context, async scope => {
        const active = await readAny(scope);
        if (!active || active.version !== 3 || active.original.operationId !== operationId) {
          const archived = await readGeneral(scope, operationId);
          if (!archived?.receipt && !(archived?.rejection && archived.rejectionSource === "INITIAL_EXECUTION")) throw Error("MEMBER_CLAIM_UNRESOLVED_OR_OPERATION_MISMATCH");
          return;
        }
        const saved = active;
        if (!saved || saved.original.operationId !== operationId || (!saved.receipt && !(saved.rejection && saved.rejectionSource === "INITIAL_EXECUTION"))) throw Error("MEMBER_CLAIM_UNRESOLVED_OR_OPERATION_MISMATCH");
        const archived = await readAny(scope, operationId);
        if (archived && JSON.stringify(archived) !== JSON.stringify(saved)) throw Error("MEMBER_CLAIM_RESOLVED_HISTORY_MISMATCH");
        if (!archived) await storage.setItem(key(scope, operationId), JSON.stringify(saved));
        // A private navigation pointer only; current share permission still requires server delivery.
        if (saved.receipt) await storage.setItem(`${key(scope)}.general-last`, operationId);
        await storage.deleteItem(key(scope));
      });
    },
    readResolutionRecoveryTarget: (context: AccountRequestContext) => scoped(context, async scope => {
      const saved = await readAny(scope);
      return saved?.version === 2 ? { requestId: saved.original.requestId, operationId: saved.original.operationId } : null;
    }),
    readResolution: (context: AccountRequestContext) => scoped(context, readResolution),
    async executeResolutionOnce(context: AccountRequestContext, input: ClaimResolutionCommand) {
      context = Object.freeze({ ...context });
      const original = claimResolutionCommandSchema.parse(input);
      await scoped(context, async scope => {
        if (await readAny(scope, original.operationId)) throw Error("MEMBER_CLAIM_OPERATION_ALREADY_RESOLVED");
        if (await readAny(scope)) throw Error("MEMBER_CLAIM_RECOVER_ORIGINAL_REQUIRED");
        // Share the existing slot/key with v1: either protocol blocks a second dispatch after process loss.
        await storage.setItem(key(scope), JSON.stringify(resolutionRetainedSchema.parse({
          version: 2, accountId: scope.accountId, tripId: scope.tripId, original,
          intentDigest: resolutionIntentDigest(scope, original), receipt: null,
        })));
      });
      const result = await resolution.execute(context, original);
      await assertAccountRequestContext(context, account);
      if (result.status === "RECORDED") await retainResolutionReceipt(context, original, result.receipt);
      if (result.status === "CONFLICT" || result.status === "DENIED") await retainResolutionRejection(context, original,
        result.status === "CONFLICT" ? { kind: "CONFLICT_WITHOUT_MUTATION", currentRevision: result.currentRevision }
          : { kind: "DENIED_WITHOUT_MUTATION", currentRevision: null });
      return result;
    },
    async recoverResolution(context: AccountRequestContext) {
      context = Object.freeze({ ...context });
      const retained = await scoped(context, readResolution);
      if (!retained) throw Error("MEMBER_CLAIM_ORIGINAL_REQUIRED");
      if (retained.rejection && retained.rejectionSource === "INITIAL_EXECUTION") return retained.rejection.kind === "DENIED_WITHOUT_MUTATION"
        ? { status: "DENIED" as const } : { status: "CONFLICT" as const };
      const result = await resolution.recover(context, retained.original);
      await assertAccountRequestContext(context, account);
      if (result.status === "FOUND") await retainResolutionReceipt(context, retained.original, result.receipt);
      return result;
    },
    async clearResolvedResolution(context: AccountRequestContext, operationId: string) {
      coreUuid.parse(operationId);
      return scoped(context, async scope => {
        const retained = await readResolution(scope);
        if ((!retained?.receipt && !(retained?.rejection && retained.rejectionSource === "INITIAL_EXECUTION")) || retained.original.operationId !== operationId)
          throw Error("MEMBER_CLAIM_UNRESOLVED_OR_OPERATION_MISMATCH");
        const archived = await readAny(scope, operationId);
        if (archived && JSON.stringify(archived) !== JSON.stringify(retained))
          throw Error("MEMBER_CLAIM_RESOLVED_HISTORY_MISMATCH");
        if (!archived) await storage.setItem(key(scope, operationId), JSON.stringify(retained));
        await storage.deleteItem(key(scope));
      });
    },
    read: (context: AccountRequestContext) => scoped(context, read),
    async executeOnce(context: AccountRequestContext, input: MemberClaimCommand) {
      context = Object.freeze({ ...context });
      const original = memberClaimCommandSchema.parse(input);
      if (original.tripId !== context.tripId) throw Error("MEMBER_CLAIM_SCOPE_MISMATCH");
      await scoped(context, async (scope) => {
        if (await read(scope, original.operationId))
          throw Error("MEMBER_CLAIM_OPERATION_ALREADY_RESOLVED");
        if (await read(scope)) throw Error("MEMBER_CLAIM_RECOVER_ORIGINAL_REQUIRED");
        // Persist before dispatch: process loss at either side of POST must never authorize another POST.
        await write(scope, {
          version: 1,
          accountId: scope.accountId,
          tripId: scope.tripId,
          original,
          outcome: null,
          rejection: null,
        });
      });
      let outcome: z.infer<typeof memberClaimOutcomeSchema>;
      try {
        outcome = memberClaimOutcomeSchema.parse(
          await authority.execute(context, original),
        );
      } catch (error) {
        const rejection =
          error instanceof MemberClaimNoCommitError ? error.rejection : null;
        if (rejection)
          await scoped(context, async (scope) => {
            const prior = await read(scope);
            if (!prior || JSON.stringify(prior.original) !== JSON.stringify(original))
              throw Error("MEMBER_CLAIM_ORIGINAL_CHANGED");
            await write(scope, { ...prior, rejection });
          });
        throw error;
      }
      return retainOutcome(context, original, outcome);
    },
    async recover(context: AccountRequestContext) {
      context = Object.freeze({ ...context });
      const retained = await scoped(context, read);
      if (!retained) throw Error("MEMBER_CLAIM_ORIGINAL_REQUIRED");
      const outcome = await authority.recover(context, retained.original);
      if (outcome.status === "ABSENT_UNCONFIRMED") return outcome;
      return retainOutcome(context, retained.original, outcome);
    },
    // Frees only a confirmed/rejected active slot; immutable original history and accepted Core data remain.
    async clearResolved(context: AccountRequestContext, operationId: string) {
      coreUuid.parse(operationId);
      return scoped(context, async (scope) => {
        const retained = await read(scope);
        if (
          !retained ||
          (!retained.outcome && !retained.rejection) ||
          retained.original.operationId !== operationId
        )
          throw Error("MEMBER_CLAIM_UNRESOLVED_OR_OPERATION_MISMATCH");
        // Preserve the resolved original before freeing the active slot; it can never be sent again.
        const archived = await read(scope, operationId);
        if (
          archived &&
          (JSON.stringify(archived.original) !== JSON.stringify(retained.original) ||
            archived.rejection !== retained.rejection ||
            archived.outcome?.status !== retained.outcome?.status ||
            archived.outcome?.personId !== retained.outcome?.personId ||
            archived.outcome?.inviteId !== retained.outcome?.inviteId)
        )
          throw Error("MEMBER_CLAIM_RESOLVED_HISTORY_MISMATCH");
        // currentAccess is a mutable read observation, not part of the immutable disposition.
        if (!archived)
          await storage.setItem(key(scope, operationId), JSON.stringify(retained));
        await storage.deleteItem(key(scope));
      });
    },
  };
}
