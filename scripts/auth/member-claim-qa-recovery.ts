import { z } from "zod";
import {
  parseMemberClaimQaCase,
  type MemberClaimQaCase,
} from "../../backend/src/tripMemberClaimQa";
import { memberClaimIntentDigest } from "../../backend/src/tripMemberClaimAuthority";
import { memberClaimReceiptSchema } from "../../backend/src/tripMemberClaimRecovery";
import { memberClaimCommandSchema } from "../../src/data/api/memberClaimContracts";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { createMemberClaimRepository } from "../../src/data/repositories/memberClaimRepository";
import type { runMemberClaimQaScenario } from "./member-claim-qa-scenario";

// DEV-only, externally authorized window. Receipt absence never reaches execute().
export async function recoverMemberClaimQaIssue(
  input: MemberClaimQaCase,
  retained: { command: unknown; intentDigest: string },
  deps: Pick<
    Parameters<typeof runMemberClaimQaScenario>[1],
    | "withOwnerSession"
    | "readReceipt"
    | "retain"
    | "fetchImplementation"
    | "signal"
    | "now"
  > & { qualifyRecoveryWindow(qa: MemberClaimQaCase): Promise<void> },
) {
  const qa = Object.freeze(parseMemberClaimQaCase(input));
  const command = memberClaimCommandSchema.parse(retained.command);
  const digest = memberClaimIntentDigest(command);
  const require = (ok: unknown) => {
    if (!ok) throw Error("C04_QA_RECOVERY_UNPROVEN");
  };
  require(
    command.kind === "ISSUE_TARGETED_INVITE" &&
      command.target.kind === "REGISTERED_ACCOUNT" &&
      command.target.accountId === qa.claimantAccountId &&
      command.operationId === qa.issueOperationId &&
      command.tripId === qa.tripId &&
      command.personId === qa.personId &&
      digest === retained.intentDigest,
  );
  const current = () => {
    deps.signal?.throwIfAborted();
    const now = (deps.now ?? Date.now)();
    require(
      Number.isFinite(now) &&
        now >= Date.parse(qa.opensAt) &&
        now < Date.parse(qa.closesAt),
    );
  };
  let calls = 0;
  let summary: Record<string, unknown> | undefined;
  current();
  const cleanup = await deps.withOwnerSession(async (session) => {
    require(
      ++calls === 1 &&
        session.accountId === qa.ownerAccountId &&
        session.tripId === qa.tripId,
    );
    const token = async () => {
      current();
      const value = await session.readSession();
      require(value.identity?.userId === qa.ownerAccountId && value.accessToken);
      current();
      return { userId: qa.ownerAccountId, token: value.accessToken! };
    };
    await token();
    const account = async () => qa.ownerAccountId;
    const context = await captureAccountRequestContext(qa.tripId, account);
    const repository = createMemberClaimRepository(
      account,
      {
        baseUrl: "https://api-dev.xoery.art",
        // DEV recovery shares the existing Core FIFO (15s) and lease (60s); allow bounded Auth/HTTP overhead.
        timeoutMs: 90_000,
        fetchImplementation: deps.fetchImplementation,
        signal: deps.signal,
      },
      token,
    );
    await deps.qualifyRecoveryWindow(qa);
    await token();
    deps.retain({
      phase: "ORIGINAL_ISSUE_RECOVERY_ONLY",
      command: structuredClone(command),
      intentDigest: digest,
    });
    const result = await repository.recover(context, command);
    await token();
    if (result.status === "ABSENT_UNCONFIRMED")
      throw Error("C04_QA_ORIGINAL_OPERATION_UNCONFIRMED");
    require(result.status === "ISSUED");
    const receipt = memberClaimReceiptSchema.parse(
      await deps.readReceipt(structuredClone(command), qa.ownerAccountId),
    );
    await token();
    require(
      receipt.tripId === qa.tripId &&
        receipt.actorAccountId === qa.ownerAccountId &&
        receipt.operationId === command.operationId &&
        receipt.personId === qa.personId &&
        receipt.intentDigest === digest &&
        receipt.outcome === "ISSUED" &&
        receipt.inviteId === result.inviteId,
    );
    summary = {
      status: "ORIGINAL_ISSUE_RECEIPT_CONFIRMED",
      operationId: command.operationId,
      intentDigest: digest,
      inviteId: receipt.inviteId,
      currentAccess: result.currentAccess,
      invitationUsability: "NOT_VERIFIED",
      claim: "NOT_RUN",
      memberRevoke: "NOT_RUN",
      nativeColdRestore: "NOT_RUN",
    };
    deps.retain({ phase: "RECOVERY_RECEIPT_CHECKED", ...summary });
  });
  const cleaned = z
    .object({
      status: z.literal("PASS"),
      accountId: z.uuid(),
      tripId: z.uuid(),
      ownSessionCleanup: z.literal("PASS_LOCAL_SCOPE_REFRESH_REVOKED"),
    })
    .parse(cleanup);
  require(
    cleaned.accountId === qa.ownerAccountId &&
      cleaned.tripId === qa.tripId &&
      calls === 1 &&
      summary,
  );
  return summary!;
}
