import { z } from "zod";
import template from "../../docs/ops/auth-c04-20261103/finite-qa-candidate/QA_CASE_TEMPLATE.json";
import freshInvitation from "../../docs/ops/auth-c04-20261103/after-fix-fresh-invite-qa/CASE_CANDIDATE.json";
import {
  parseMemberClaimQaCase,
  type MemberClaimQaCase,
} from "../../backend/src/tripMemberClaimQa";
import {
  memberClaimCommandSchema,
  type MemberClaimCommand,
} from "../../src/data/api/memberClaimContracts";
import { memberClaimIntentDigest } from "../../backend/src/tripMemberClaimAuthority";
import { memberClaimReceiptSchema } from "../../backend/src/tripMemberClaimRecovery";

const preflightSchema = z.strictObject({
  tripOwnedByA: z.literal(true),
  ownerPersonLinkedToA: z.literal(true),
  targetNeverLinked: z.literal(true),
  bLinkedPeople: z.literal(0),
  originalReceipts: z.literal(0),
  directedInvites: z.literal(0),
  targetPaymentRecords: z.literal(0),
  targetPaymentGrants: z.literal(0),
  removedAccounts: z.literal(0),
  claimFunctionPresent: z.literal(true),
});
const rowsSchema = z.object({
  rows: z.array(z.strictObject({ result: z.unknown() })).length(1),
});
export const memberClaimQaInviteObservationSchema = z.strictObject({
  id: z.uuid(),
  tripId: z.uuid(),
  personId: z.uuid(),
  targetAccountId: z.uuid(),
  status: z.literal("PENDING"),
  expiresAt: z.iso.datetime({ offset: true }),
  observedAt: z.iso.datetime({ offset: true }),
});

// DEV operator readback only. Root supplies its existing read-only SqlTransport; never a normal A/B operation identity.
function createFixedReadback(
  input: MemberClaimQaCase,
  query: (sql: string) => Promise<unknown>,
  fixedCase: Readonly<Record<string, string>>,
) {
  const qa = Object.freeze(parseMemberClaimQaCase(input));
  for (const [key, value] of Object.entries(fixedCase))
    if (qa[key as keyof MemberClaimQaCase] !== value)
      throw Error("C04_READBACK_FIXED_CASE_REQUIRED");
  const uuid = (value: string) => `'${z.uuid().parse(value)}'::uuid`;
  const trip = uuid(qa.tripId),
    person = uuid(qa.personId),
    a = uuid(qa.ownerAccountId),
    b = uuid(qa.claimantAccountId);
  const read = async (sql: string) => rowsSchema.parse(await query(sql)).rows[0].result;
  return {
    async readInvite(inviteId: string) {
      const selected = uuid(inviteId);
      const invite = memberClaimQaInviteObservationSchema.parse(
        await read(`SELECT (
        SELECT jsonb_build_object('id',i.id,'tripId',d.trip_id,'personId',d.person_id,
          'targetAccountId',d.target_account_id,'status',d.status,'expiresAt',i.expires_at,
          'observedAt',clock_timestamp())
        FROM public.trip_directed_invite_targets d JOIN public.journey_invites i ON i.id=d.invite_id
        WHERE i.id=${selected} AND i.trip_id=${trip} AND NOT i.is_active
          AND d.trip_id=${trip} AND d.person_id=${person} AND d.target_account_id=${b} AND d.approved_by=${a}
      ) AS result`),
      );
      if (
        invite.id !== inviteId ||
        invite.tripId !== qa.tripId ||
        invite.personId !== qa.personId ||
        invite.targetAccountId !== qa.claimantAccountId
      )
        throw Error("C04_READBACK_INVITE_MISMATCH");
      return invite;
    },
    async preflight(expected: MemberClaimQaCase) {
      const checked = parseMemberClaimQaCase(expected);
      if (
        Object.keys(qa).some(
          (k) =>
            qa[k as keyof MemberClaimQaCase] !== checked[k as keyof MemberClaimQaCase],
        )
      )
        throw Error("C04_READBACK_CASE_MISMATCH");
      // Reuses pg-candidate/PREFLIGHT_READONLY.sql's exact QA scope, adding only current execution CAS counts.
      return preflightSchema.parse(
        await read(`SELECT jsonb_build_object(
        'tripOwnedByA', EXISTS(SELECT 1 FROM public.trips WHERE id=${trip} AND created_by=${a}),
        'ownerPersonLinkedToA', EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=${trip} AND id=${uuid("b90c34ba-96d7-4b64-874a-b4f5525d64d8")} AND user_id=${a} AND status='linked'),
        'targetNeverLinked', EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=${trip} AND id=${person} AND user_id IS NULL AND linked_at IS NULL AND status='unlinked'),
        'bLinkedPeople', (SELECT count(*)::int FROM public.journey_members WHERE trip_id=${trip} AND user_id=${b} AND status='linked'),
        'originalReceipts', (SELECT count(*)::int FROM public.trip_member_claim_receipts WHERE operation_id IN (${uuid(qa.issueOperationId)},${uuid(qa.claimOperationId)})),
        'directedInvites', (SELECT count(*)::int FROM public.trip_directed_invite_targets WHERE trip_id=${trip} AND person_id=${person}),
        'targetPaymentRecords', (SELECT count(*)::int FROM public.personal_settlement_payment_records WHERE journey_id=${trip} AND counterparty_member_id=${person}),
        'targetPaymentGrants', (SELECT count(*)::int FROM public.personal_settlement_payment_read_grants WHERE journey_id=${trip} AND member_id=${person}),
        'removedAccounts', (SELECT count(*)::int FROM public.journey_removed_users WHERE trip_id=${trip} AND user_id IN (${a},${b})),
        'claimFunctionPresent', to_regprocedure('public.trip_member_claim_transaction(text,jsonb)') IS NOT NULL
      ) AS result`),
      );
    },
    async readReceipt(original: MemberClaimCommand, actorAccountId: string) {
      const command = memberClaimCommandSchema.parse(original);
      const issue = command.kind === "ISSUE_TARGETED_INVITE";
      if (
        command.tripId !== qa.tripId ||
        command.personId !== qa.personId ||
        command.operationId !== (issue ? qa.issueOperationId : qa.claimOperationId) ||
        actorAccountId !== (issue ? qa.ownerAccountId : qa.claimantAccountId) ||
        (issue
          ? command.target.kind !== "REGISTERED_ACCOUNT" ||
            command.target.accountId !== qa.claimantAccountId
          : command.kind !== "CLAIM_PERSON")
      )
        throw Error("C04_READBACK_COMMAND_MISMATCH");
      const receipt = memberClaimReceiptSchema.parse(
        await read(`SELECT (
        SELECT jsonb_build_object('operationId',operation_id,'actorAccountId',actor_account_id,
          'tripId',trip_id,'personId',person_id,'inviteId',invite_id,'intentDigest',intent_digest,'outcome',outcome)
        FROM public.trip_member_claim_receipts WHERE operation_id=${uuid(command.operationId)}
          AND actor_account_id=${uuid(actorAccountId)} AND trip_id=${trip}
      ) AS result`),
      );
      if (
        receipt.operationId !== command.operationId ||
        receipt.actorAccountId !== actorAccountId ||
        receipt.tripId !== qa.tripId ||
        receipt.personId !== qa.personId ||
        receipt.intentDigest !== memberClaimIntentDigest(command) ||
        (issue
          ? receipt.outcome !== "ISSUED"
          : receipt.outcome !== "LINKED" || receipt.inviteId !== command.inviteId)
      )
        throw Error("C04_READBACK_RECEIPT_MISMATCH");
      return receipt;
    },
  };
}

export function createMemberClaimQaReadback(
  input: MemberClaimQaCase,
  query: (sql: string) => Promise<unknown>,
) {
  return createFixedReadback(input, query, template.qaCase);
}

// Separate fixed QA intent only; this cannot qualify or replay the prior UNKNOWN.
export function createFreshInvitationQaReadback(
  input: MemberClaimQaCase,
  query: (sql: string) => Promise<unknown>,
) {
  const { readInvite, readReceipt } = createFixedReadback(
    input,
    query,
    freshInvitation.qaCase,
  );
  return { readInvite, readReceipt };
}
