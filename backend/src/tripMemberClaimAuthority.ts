import { createHash } from "node:crypto";
import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";

const target = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("REGISTERED_ACCOUNT"), accountId: coreUuid }),
  z.strictObject({ kind: z.literal("UNREGISTERED_PERSON") }),
]);
export const memberClaimCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ISSUE_TARGETED_INVITE"),
    operationId: coreUuid,
    tripId: coreUuid,
    personId: coreUuid,
    target,
  }),
  z.strictObject({
    kind: z.literal("CLAIM_PERSON"),
    operationId: coreUuid,
    tripId: coreUuid,
    personId: coreUuid,
    inviteId: coreUuid,
    explicitConsent: z.literal(true),
  }),
  z.strictObject({
    kind: z.literal("REVOKE_UNCLAIMED_INVITE"),
    operationId: coreUuid,
    tripId: coreUuid,
    personId: coreUuid,
    inviteId: coreUuid,
  }),
]);
export type MemberClaimCommand = z.infer<typeof memberClaimCommandSchema>;
type Target = z.infer<typeof target>;
type Outcome = "ISSUED" | "LINKED" | "ALREADY_LINKED" | "INVITE_REVOKED";
type Access = "NONE" | "READ" | "COLLABORATE" | "ORGANIZER";
type Invite = {
  id: string;
  tripId: string;
  personId: string;
  target: Target;
  status: "PENDING" | "CLAIMED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
};
type Receipt = {
  tripId: string;
  actorAccountId: string;
  operationId: string;
  personId: string;
  intentDigest: string;
  outcome: Outcome;
  inviteId: string;
};

/** All reads and writes below must share one server-serialized authority scope. */
export type MemberClaimTransaction = {
  currentTime(): Promise<string>;
  currentEffectiveAccess(actorAccountId: string): Promise<Access | null>;
  currentOrganizerAuthority(actorAccountId: string): Promise<boolean>;
  personLinkedAccount(personId: string): Promise<string | null | undefined>;
  accountLinkedPerson(accountId: string): Promise<string | null>;
  exactOrganizerApproval(personId: string, claimantAccountId: string): Promise<boolean>;
  confirmedClaimantIdentity(
    personId: string,
    claimantAccountId: string,
  ): Promise<boolean>;
  accountAccessDenied(accountId: string): Promise<boolean>;
  invite(inviteId: string): Promise<Invite | null>;
  receipt(operationId: string): Promise<Receipt | null>;
  issue(
    personId: string,
    target: Target,
  ): Promise<{ inviteId: string; expiresAt: string }>;
  link(personId: string, claimantAccountId: string, inviteId: string): Promise<void>;
  revokeUnclaimed(inviteId: string): Promise<void>;
  saveReceipt(receipt: Receipt): Promise<void>;
};
export type MemberClaimAuthorityPort = {
  atomic<T>(
    scope: { tripId: string; actorAccountId: string },
    work: (transaction: MemberClaimTransaction) => Promise<T>,
  ): Promise<T>;
};
export type MemberClaimResult =
  | { status: "INVALID" | "UNAVAILABLE" | "DENIED" | "CONFLICT" }
  | { status: Outcome; personId: string; inviteId: string; currentAccess: Access };

const digest = (command: MemberClaimCommand) =>
  createHash("sha256")
    .update("otr-member-claim-v1\n" + JSON.stringify(command), "utf8")
    .digest("hex");
const denied: MemberClaimResult = { status: "DENIED" };
const unavailable: MemberClaimResult = { status: "UNAVAILABLE" };

/** Dormant: no port is installed in the Backend app or Hosted environment. */
export async function executeMemberClaim(
  raw: unknown,
  authenticatedActorAccountId: string,
  port?: MemberClaimAuthorityPort,
): Promise<MemberClaimResult> {
  const parsed = memberClaimCommandSchema.safeParse(raw);
  if (!parsed.success || !coreUuid.safeParse(authenticatedActorAccountId).success)
    return { status: "INVALID" };
  if (!port) return unavailable;
  const command = parsed.data;
  const intentDigest = digest(command);
  try {
    return await port.atomic(
      { tripId: command.tripId, actorAccountId: authenticatedActorAccountId },
      async (tx): Promise<MemberClaimResult> => {
        const access = await tx.currentEffectiveAccess(authenticatedActorAccountId);
        if (access === null) return unavailable;
        const prior = await tx.receipt(command.operationId);
        if (prior) {
          if (
            prior.tripId !== command.tripId ||
            prior.actorAccountId !== authenticatedActorAccountId ||
            prior.operationId !== command.operationId ||
            prior.personId !== command.personId ||
            prior.intentDigest !== intentDigest
          )
            return { status: "CONFLICT" };
          return {
            status: prior.outcome,
            personId: prior.personId,
            inviteId: prior.inviteId,
            currentAccess: access,
          };
        }
        const linked = await tx.personLinkedAccount(command.personId);
        if (linked === undefined) return denied;
        let outcome: Outcome;
        let inviteId: string;
        if (command.kind === "ISSUE_TARGETED_INVITE") {
          if (
            linked !== null ||
            !(await tx.currentOrganizerAuthority(authenticatedActorAccountId))
          )
            return denied;
          const issued = await tx.issue(command.personId, command.target);
          const now = Date.parse(await tx.currentTime());
          if (
            !coreUuid.safeParse(issued.inviteId).success ||
            !Number.isFinite(now) ||
            !(Date.parse(issued.expiresAt) > now)
          )
            throw new Error("MEMBER_INVITE_RESULT_INVALID");
          outcome = "ISSUED";
          inviteId = issued.inviteId;
        } else {
          const invite = await tx.invite(command.inviteId);
          const currentTarget = target.safeParse(invite?.target);
          if (
            !invite ||
            !currentTarget.success ||
            invite.id !== command.inviteId ||
            invite.tripId !== command.tripId ||
            invite.personId !== command.personId ||
            invite.status !== "PENDING" ||
            !(Date.parse(invite.expiresAt) > Date.parse(await tx.currentTime()))
          )
            return denied;
          inviteId = invite.id;
          if (command.kind === "REVOKE_UNCLAIMED_INVITE") {
            if (
              linked !== null ||
              !(await tx.currentOrganizerAuthority(authenticatedActorAccountId))
            )
              return denied;
            await tx.revokeUnclaimed(invite.id);
            outcome = "INVITE_REVOKED";
          } else {
            if (
              (currentTarget.data.kind === "REGISTERED_ACCOUNT" &&
                currentTarget.data.accountId !== authenticatedActorAccountId) ||
              (await tx.accountAccessDenied(authenticatedActorAccountId)) ||
              !(await tx.exactOrganizerApproval(
                command.personId,
                authenticatedActorAccountId,
              )) ||
              (currentTarget.data.kind === "UNREGISTERED_PERSON" &&
                !(await tx.confirmedClaimantIdentity(
                  command.personId,
                  authenticatedActorAccountId,
                ))) ||
              (linked !== null && linked !== authenticatedActorAccountId)
            )
              return denied;
            const otherPerson = await tx.accountLinkedPerson(authenticatedActorAccountId);
            if (otherPerson !== null && otherPerson !== command.personId)
              return { status: "CONFLICT" };
            if (linked === null) {
              await tx.link(command.personId, authenticatedActorAccountId, invite.id);
              outcome = "LINKED";
            } else {
              outcome = "ALREADY_LINKED";
            }
          }
        }
        const receipt: Receipt = {
          tripId: command.tripId,
          actorAccountId: authenticatedActorAccountId,
          operationId: command.operationId,
          personId: command.personId,
          intentDigest,
          outcome,
          inviteId,
        };
        await tx.saveReceipt(receipt);
        return {
          status: outcome,
          personId: command.personId,
          inviteId,
          currentAccess: access,
        };
      },
    );
  } catch {
    return unavailable;
  }
}
