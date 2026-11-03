import { createHash } from "node:crypto";
import { z } from "zod";
import type { RegisteredQaHostContext } from "./registered-qa-host-session";
import { createMemberClaimRepository } from "../../src/data/repositories/memberClaimRepository";
import { createCoreV2Transport } from "../../src/data/api/tripCoreV2Transport";
import { ApiClientError } from "../../src/data/api/client";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { corePersonBindingSchema } from "../../src/domain/trip/tripCoreV2Read";
import { itinerary_eventsSchema } from "../../src/domain/trip/tripCoreV2";
import { memberClaimIntentDigest } from "../../backend/src/tripMemberClaimAuthority";
import type { MemberClaimCommand } from "../../src/data/api/memberClaimContracts";
import { memberClaimReceiptSchema } from "../../backend/src/tripMemberClaimRecovery";
import {
  parseMemberClaimQaCase,
  type MemberClaimQaCase,
} from "../../backend/src/tripMemberClaimQa";

type SessionRun = (
  work: (context: RegisteredQaHostContext) => Promise<void>,
) => Promise<unknown>;
const cleanupSchema = z.object({
  status: z.literal("PASS"),
  accountId: z.uuid(),
  tripId: z.uuid(),
  ownSessionCleanup: z.literal("PASS_LOCAL_SCOPE_REFRESH_REVOKED"),
});

// DEV-only orchestration. Real normal Auth, independent SQL reader and approved window/controller are supplied by the owning operator.
export async function runMemberClaimQaScenario(
  input: MemberClaimQaCase,
  deps: {
    withOwnerSession: SessionRun;
    withClaimantSession: SessionRun;
    preflight(qa: MemberClaimQaCase): Promise<void>;
    readReceipt(command: MemberClaimCommand, actorAccountId: string): Promise<unknown>;
    retain(value: Record<string, unknown>): void;
    fetchImplementation?: typeof fetch;
    signal?: AbortSignal;
    now?: () => number;
  },
) {
  const qa = Object.freeze(parseMemberClaimQaCase(input));
  const current = () => {
    deps.signal?.throwIfAborted();
    const now = (deps.now ?? Date.now)();
    if (
      !Number.isFinite(now) ||
      now < Date.parse(qa.opensAt) ||
      now >= Date.parse(qa.closesAt)
    )
      throw Error("C04_QA_WINDOW_NOT_CURRENT");
  };
  const require = (ok: unknown) => {
    if (!ok) throw Error("C04_QA_CASE_UNPROVEN");
  };
  const checkedCleanup = (raw: unknown, account: string) => {
    const result = cleanupSchema.parse(raw);
    require(result.accountId === account && result.tripId === qa.tripId);
  };
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const options = {
    baseUrl: "https://api-dev.xoery.art",
    fetchImplementation: deps.fetchImplementation,
    signal: deps.signal,
  };
  const participant = async (context: RegisteredQaHostContext, expected: string) => {
    current();
    require(context.accountId === expected && context.tripId === qa.tripId);
    const token = async () => {
      current();
      const session = await context.readSession();
      if (session.identity?.userId !== expected || !session.accessToken)
        throw Error("C04_QA_CASE_UNPROVEN");
      current();
      return { userId: expected, token: session.accessToken };
    };
    await token();
    const account = async () => expected;
    return {
      accountId: expected,
      context: await captureAccountRequestContext(qa.tripId, account),
      repository: createMemberClaimRepository(account, options, token),
      core: createCoreV2Transport(account, hash, options, token),
    };
  };
  let ownerCalls = 0,
    claimantCalls = 0;
  let summary: Record<string, unknown> | undefined;
  current();
  const ownerCleanup = await deps.withOwnerSession(async (ownerContext) => {
    require(++ownerCalls === 1);
    const owner = await participant(ownerContext, qa.ownerAccountId);
    const claimantCleanup = await deps.withClaimantSession(async (claimantContext) => {
      require(++claimantCalls === 1);
      const claimant = await participant(claimantContext, qa.claimantAccountId);
      await deps.preflight(qa);
      current();
      const execute = async (person: typeof owner, command: MemberClaimCommand) => {
        current();
        deps.retain({
          phase: "ORIGINAL_COMMAND_RETAINED",
          actorAccountId: person.accountId,
          command: structuredClone(command),
          intentDigest: memberClaimIntentDigest(command),
        });
        let result;
        try {
          result = await person.repository.execute(person.context, command);
        } catch (error) {
          if (
            !(error instanceof ApiClientError) ||
            !(
              error.kind === "network" ||
              error.kind === "timeout" ||
              error.status === 503
            )
          )
            throw error;
          current();
          deps.retain({
            phase: "UNKNOWN_RECOVERY_ONLY",
            operationId: command.operationId,
          });
          result = await person.repository.recover(person.context, command);
        }
        current();
        if (result.status === "ABSENT_UNCONFIRMED")
          throw Error("C04_QA_ORIGINAL_OPERATION_UNCONFIRMED");
        const receipt = memberClaimReceiptSchema.parse(
          await deps.readReceipt(structuredClone(command), person.accountId),
        );
        current();
        require(
          receipt.tripId === qa.tripId &&
            receipt.actorAccountId === person.accountId &&
            receipt.personId === qa.personId &&
            receipt.operationId === command.operationId &&
            receipt.intentDigest === memberClaimIntentDigest(command),
        );
        require(
          receipt.inviteId === result.inviteId && receipt.outcome === result.status,
        );
        return result;
      };
      const issue: MemberClaimCommand = {
        kind: "ISSUE_TARGETED_INVITE",
        operationId: qa.issueOperationId,
        tripId: qa.tripId,
        personId: qa.personId,
        target: { kind: "REGISTERED_ACCOUNT", accountId: qa.claimantAccountId },
      };
      const issued = await execute(owner, issue);
      require(issued.status === "ISSUED");
      const claim: MemberClaimCommand = {
        kind: "CLAIM_PERSON",
        operationId: qa.claimOperationId,
        tripId: qa.tripId,
        personId: qa.personId,
        inviteId: issued.inviteId,
        explicitConsent: true,
      };
      const linked = await execute(claimant, claim);
      require(linked.status === "LINKED" && linked.currentAccess === "READ");
      current();
      // Explicit idempotency check only after a confirmed original receipt; never an UNKNOWN replay.
      const duplicate = await claimant.repository.execute(claimant.context, claim);
      require(
        duplicate.status === "LINKED" &&
          duplicate.currentAccess === "READ" &&
          duplicate.inviteId === linked.inviteId,
      );
      const recovered = await claimant.repository.recover(claimant.context, claim);
      require(recovered.status === "LINKED" && recovered.currentAccess === "READ");
      const a = await owner.core.collection(owner.context),
        b = await claimant.core.collection(claimant.context);
      current();
      const aRecords = a.pages.flatMap((p) => p.records),
        bRecords = b.pages.flatMap((p) => p.records);
      const own = bRecords
        .filter((r) => r.kind === "PERSON_BINDING")
        .map((r) => corePersonBindingSchema.parse(r.body))
        .filter((r) => r.active && r.account_id === qa.claimantAccountId);
      require(own.length === 1 && own[0].person_id === qa.personId);
      const privateIds = aRecords
        .filter((r) => {
          if (r.kind !== "ITEM") return false;
          const body = itinerary_eventsSchema.passthrough().parse(r.body);
          return (
            body.visibility === "PRIVATE" && body.owner_account_id === qa.ownerAccountId
          );
        })
        .map((r) => r.id);
      require(!bRecords.some((r) => r.kind === "ITEM" && privateIds.includes(r.id)));
      summary = {
        status: "INVITE_CLAIM_MEMBER_READ_CHECKED",
        tripId: qa.tripId,
        personId: qa.personId,
        issueOperationId: issue.operationId,
        claimOperationId: claim.operationId,
        privateItemNegative: privateIds.length
          ? "OWNER_PRIVATE_ITEMS_ABSENT_FOR_B"
          : "NO_QUALIFIED_PRIVATE_FIXTURE",
        nativeColdRestore: "NOT_RUN",
        memberRevoke: "NOT_RUN",
        evidenceScope: "SCENARIO_CHECKS_ATTACH_REAL_AUTH_READBACK_CONTROLLER_RECEIPTS",
      };
      deps.retain({ phase: "SCENARIO_CHECKS_COMPLETED", ...summary });
    });
    checkedCleanup(claimantCleanup, qa.claimantAccountId);
  });
  checkedCleanup(ownerCleanup, qa.ownerAccountId);
  require(summary && ownerCalls === 1 && claimantCalls === 1);
  return summary!;
}
