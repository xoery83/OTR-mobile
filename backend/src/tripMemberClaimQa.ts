import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  memberClaimIntentDigest,
  type MemberClaimAuthorityPort,
  type MemberClaimTransaction,
} from "./tripMemberClaimAuthority";
import { memberClaimReceiptSchema } from "./tripMemberClaimRecovery";

const qaSchema = z
  .strictObject({
    projectRef: z.literal("tuqigdxrvrerfewsxqgm"),
    tripId: coreUuid,
    personId: coreUuid,
    ownerAccountId: coreUuid,
    claimantAccountId: coreUuid,
    issueOperationId: coreUuid,
    claimOperationId: coreUuid,
    opensAt: z.iso.datetime({ offset: true }),
    closesAt: z.iso.datetime({ offset: true }),
    inviteExpiresAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (v) =>
      v.ownerAccountId !== v.claimantAccountId &&
      v.issueOperationId !== v.claimOperationId &&
      Date.parse(v.opensAt) < Date.parse(v.inviteExpiresAt) &&
      Date.parse(v.inviteExpiresAt) <= Date.parse(v.closesAt) &&
      Date.parse(v.closesAt) - Date.parse(v.opensAt) <= 30 * 60 * 1000,
  );
export type MemberClaimQaCase = z.infer<typeof qaSchema>;

// Shape/policy only; the owning selector must independently verify the actual DEV endpoint and current window.
export function parseMemberClaimQaCase(raw: unknown): MemberClaimQaCase {
  return qaSchema.parse(raw);
}

// Unselected DEV QA restriction only; the owning port still performs every business authorization.
export function createMemberClaimQaAuthority(
  underlying: MemberClaimAuthorityPort,
  input: MemberClaimQaCase,
  now: () => number = Date.now,
) {
  const qa = Object.freeze(parseMemberClaimQaCase(input));
  let closed = false,
    lastInstant = -Infinity;
  const require = (ok: unknown) => {
    if (!ok) throw Error("MEMBER_CLAIM_QA_CLOSED");
  };
  const current = () => {
    const instant = now();
    if (
      !Number.isFinite(instant) ||
      instant < lastInstant ||
      instant >= Date.parse(qa.closesAt)
    )
      closed = true;
    lastInstant = instant;
    require(
      !closed &&
        Number.isFinite(instant) &&
        instant >= Date.parse(qa.opensAt) &&
        instant < Date.parse(qa.closesAt),
    );
  };
  const port: MemberClaimAuthorityPort = {
    async atomic(inputScope, work) {
      const scope = Object.freeze({ ...inputScope });
      current();
      const owner = scope.actorAccountId === qa.ownerAccountId;
      require(
        scope.tripId === qa.tripId &&
          (owner || scope.actorAccountId === qa.claimantAccountId),
      );
      const operationId = owner ? qa.issueOperationId : qa.claimOperationId;
      const checkReceipt = (raw: unknown) => {
        const r = memberClaimReceiptSchema.parse(raw);
        require(
          r.tripId === qa.tripId &&
            r.personId === qa.personId &&
            r.actorAccountId === scope.actorAccountId &&
            r.operationId === operationId,
        );
        require(
          owner
            ? r.outcome === "ISSUED"
            : r.outcome === "LINKED" || r.outcome === "ALREADY_LINKED",
        );
        const expected = owner
          ? {
              kind: "ISSUE_TARGETED_INVITE" as const,
              tripId: qa.tripId,
              personId: qa.personId,
              operationId,
              target: {
                kind: "REGISTERED_ACCOUNT" as const,
                accountId: qa.claimantAccountId,
              },
            }
          : {
              kind: "CLAIM_PERSON" as const,
              tripId: qa.tripId,
              personId: qa.personId,
              operationId,
              inviteId: r.inviteId,
              explicitConsent: true as const,
            };
        require(r.intentDigest === memberClaimIntentDigest(expected));
      };
      const result = await underlying.atomic(scope, async (tx) => {
        current();
        let active = true,
          failed = false,
          pending = 0;
        const seenInvites = new Set<string>();
        const guarded = Object.fromEntries(
          Object.entries(tx).map(([name, method]) => [
            name,
            (...args: unknown[]) => {
              const task = (async () => {
                pending++;
                try {
                  current();
                  require(active && !failed);
                  switch (name) {
                    case "currentTime":
                      break;
                    case "currentEffectiveAccess":
                    case "accountLinkedPerson":
                    case "accountAccessDenied":
                      require(args[0] === scope.actorAccountId);
                      break;
                    case "currentOrganizerAuthority":
                      require(owner && args[0] === qa.ownerAccountId);
                      break;
                    case "personLinkedAccount":
                      require(args[0] === qa.personId);
                      break;
                    case "exactOrganizerApproval":
                      require(
                        !owner &&
                          args[0] === qa.personId &&
                          args[1] === qa.claimantAccountId,
                      );
                      break;
                    case "receipt":
                      require(args[0] === operationId);
                      break;
                    case "invite":
                      coreUuid.parse(args[0]);
                      require(!owner);
                      break;
                    case "issue":
                      require(
                        owner &&
                          args[0] === qa.personId &&
                          z
                            .strictObject({
                              kind: z.literal("REGISTERED_ACCOUNT"),
                              accountId: z.literal(qa.claimantAccountId),
                            })
                            .safeParse(args[1]).success,
                      );
                      break;
                    case "link":
                      require(
                        !owner &&
                          args[0] === qa.personId &&
                          args[1] === qa.claimantAccountId &&
                          seenInvites.has(String(args[2])) &&
                          z
                            .strictObject({
                              operationId: z.literal(operationId),
                              intentDigest: z.literal(
                                memberClaimIntentDigest({
                                  kind: "CLAIM_PERSON",
                                  operationId,
                                  tripId: qa.tripId,
                                  personId: qa.personId,
                                  inviteId: coreUuid.parse(args[2]),
                                  explicitConsent: true,
                                }),
                              ),
                            })
                            .safeParse(args[3]).success,
                      );
                      break;
                    case "saveReceipt":
                      checkReceipt(args[0]);
                      break;
                    default:
                      require(false);
                  }
                  const value = await (method as (...a: unknown[]) => Promise<unknown>)(
                    ...args,
                  );
                  current();
                  require(active && !failed);
                  if (name === "receipt" && value !== null) checkReceipt(value);
                  if (name === "issue")
                    require(
                      Date.parse((value as { expiresAt: string }).expiresAt) ===
                        Date.parse(qa.inviteExpiresAt),
                    );
                  if (name === "invite" && value !== null) {
                    const invite = value as Awaited<
                      ReturnType<MemberClaimTransaction["invite"]>
                    >;
                    require(
                      invite &&
                        invite.id === args[0] &&
                        invite.tripId === qa.tripId &&
                        invite.personId === qa.personId &&
                        invite.target.kind === "REGISTERED_ACCOUNT" &&
                        invite.target.accountId === qa.claimantAccountId &&
                        Date.parse(invite.expiresAt) === Date.parse(qa.inviteExpiresAt),
                    );
                    seenInvites.add(String(args[0]));
                  }
                  return value;
                } catch (error) {
                  failed = true;
                  throw error;
                } finally {
                  pending--;
                }
              })();
              void task.catch(() => {});
              return task;
            },
          ]),
        ) as MemberClaimTransaction;
        try {
          const value = await work(guarded);
          current();
          require(!failed && pending === 0);
          return value;
        } finally {
          active = false;
        }
      });
      current();
      return result;
    },
  };
  return {
    port,
    close() {
      closed = true;
    },
  };
}
