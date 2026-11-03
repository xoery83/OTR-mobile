import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type {
  MemberClaimAuthorityPort,
  MemberClaimTransaction,
} from "./tripMemberClaimAuthority";
import {
  memberClaimAccessSchema,
  memberClaimReceiptSchema,
} from "./tripMemberClaimRecovery";

const target = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("REGISTERED_ACCOUNT"), accountId: coreUuid }),
  z.strictObject({ kind: z.literal("UNREGISTERED_PERSON") }),
]);
const inviteSchema = z.strictObject({
  id: coreUuid,
  tripId: coreUuid,
  personId: coreUuid,
  target,
  status: z.enum(["PENDING", "CLAIMED", "REVOKED", "EXPIRED"]),
  expiresAt: z.iso.datetime({ offset: true }),
});
const issueSchema = z.strictObject({
  inviteId: coreUuid,
  expiresAt: z.iso.datetime({ offset: true }),
});

// Candidate only. Expiry comes from explicit server configuration, never a Native request.
export function createTripMemberClaimPgPort(
  connection: CorePgConnection,
  options: Readonly<{ inviteExpiresAt: string }>,
): MemberClaimAuthorityPort {
  const expiresAt = z.iso.datetime({ offset: true }).parse(options.inviteExpiresAt);
  return {
    async atomic(scope, work) {
      const actor = coreUuid.parse(scope.actorAccountId),
        trip = coreUuid.parse(scope.tripId);
      let stage = "LEASE",
        lastRpcMethod: string | null = null;
      try {
        return await connection.withLease(async (lease) => {
          let active = true,
            pending = false,
            failed = false,
            commitAttempted = false,
            pendingMethods = 0;
          const call = async (method: string, payload: unknown = {}) => {
            if (!active || pending || failed) {
              failed = true;
              throw Error("MEMBER_CLAIM_TRANSACTION_UNAVAILABLE");
            }
            pending = true;
            stage = "RPC";
            lastRpcMethod = method;
            try {
              const result = await lease.query(
                "SELECT public.trip_member_claim_transaction($1::text,$2::jsonb) AS result",
                [method, JSON.stringify(payload)],
              );
              if (!active) throw Error("MEMBER_CLAIM_TRANSACTION_RELEASED");
              if (result.rows.length !== 1 || !("result" in result.rows[0]))
                throw Error("MEMBER_CLAIM_RESULT_MISSING");
              return result.rows[0].result;
            } catch (error) {
              failed = true;
              throw error;
            } finally {
              pending = false;
            }
          };
          const own = (account: string) => {
            if (account !== actor) {
              failed = true;
              throw Error("MEMBER_CLAIM_ACTOR_MISMATCH");
            }
          };
          const tx: MemberClaimTransaction = {
            currentTime: async () =>
              z.iso.datetime({ offset: true }).parse(await call("time")),
            currentEffectiveAccess: async (account) => {
              own(account);
              return memberClaimAccessSchema.parse(await call("access"));
            },
            currentOrganizerAuthority: async (account) => {
              own(account);
              return z.boolean().parse(await call("organizer"));
            },
            personLinkedAccount: async (personId) => {
              const row = z
                .strictObject({ found: z.boolean(), accountId: coreUuid.nullable() })
                .parse(await call("person", { personId: coreUuid.parse(personId) }));
              return row.found ? row.accountId : undefined;
            },
            accountLinkedPerson: async (account) => {
              own(account);
              return coreUuid.nullable().parse(await call("accountPerson"));
            },
            exactOrganizerApproval: async (personId, account) => {
              own(account);
              return z
                .boolean()
                .parse(await call("approval", { personId: coreUuid.parse(personId) }));
            },
            // No qualified unregistered identity-confirmation producer exists yet.
            confirmedClaimantIdentity: async () => false,
            accountAccessDenied: async (account) => {
              own(account);
              return z.boolean().parse(await call("denied"));
            },
            invite: async (inviteId) => {
              const result = inviteSchema
                .nullable()
                .parse(await call("invite", { inviteId: coreUuid.parse(inviteId) }));
              if (result && (result.id !== inviteId || result.tripId !== trip))
                throw Error("MEMBER_INVITE_BINDING");
              return result;
            },
            receipt: async (operationId) => {
              const receipt = memberClaimReceiptSchema
                .nullable()
                .parse(
                  await call("receipt", { operationId: coreUuid.parse(operationId) }),
                );
              if (
                receipt &&
                (receipt.operationId !== operationId ||
                  receipt.tripId !== trip ||
                  receipt.actorAccountId !== actor)
              )
                throw Error("MEMBER_RECEIPT_BINDING");
              return receipt;
            },
            issue: async (personId, value) =>
              issueSchema.parse(
                await call("issue", {
                  personId: coreUuid.parse(personId),
                  target: target.parse(value),
                  expiresAt,
                }),
              ),
            link: async (personId, account, inviteId) => {
              own(account);
              z.literal(true).parse(
                await call("link", {
                  personId: coreUuid.parse(personId),
                  inviteId: coreUuid.parse(inviteId),
                }),
              );
            },
            revokeUnclaimed: async (inviteId) => {
              z.literal(true).parse(
                await call("revoke", { inviteId: coreUuid.parse(inviteId) }),
              );
            },
            saveReceipt: async (receipt) => {
              const parsed = memberClaimReceiptSchema.parse(receipt);
              if (parsed.actorAccountId !== actor || parsed.tripId !== trip)
                throw Error("MEMBER_RECEIPT_BINDING");
              z.literal(true).parse(await call("saveReceipt", parsed));
            },
          };
          const bounded = Object.fromEntries(
            Object.entries(tx).map(([name, method]) => [
              name,
              (...args: unknown[]) => {
                const task = (async () => {
                  if (!active || failed) throw Error("MEMBER_CLAIM_TRANSACTION_RELEASED");
                  pendingMethods++;
                  try {
                    return await (method as (...values: unknown[]) => Promise<unknown>)(
                      ...args,
                    );
                  } catch (error) {
                    failed = true;
                    throw error;
                  } finally {
                    pendingMethods--;
                  }
                })();
                void task.catch(() => {});
                return task;
              },
            ]),
          ) as MemberClaimTransaction;
          try {
            stage = "BEGIN";
            await lease.query("BEGIN");
            stage = "TIMEOUT_SETUP";
            await lease.query("SET LOCAL lock_timeout='3s'");
            await lease.query("SET LOCAL statement_timeout='10s'");
            stage = "ACTOR_SCOPE";
            await lease.query(
              "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
              [actor, trip],
            );
            z.literal(true).parse(await call("lock"));
            stage = "WORK";
            const result = await work(bounded);
            if (pending || pendingMethods || failed)
              throw Error("MEMBER_CLAIM_TRANSACTION_UNFINISHED");
            active = false;
            commitAttempted = true;
            stage = "COMMIT";
            await lease.query("COMMIT");
            return result;
          } catch (error) {
            active = false;
            if (pending || pendingMethods || commitAttempted) lease.retire();
            else await lease.query("ROLLBACK").catch(() => lease.retire());
            throw error;
          } finally {
            active = false;
          }
        });
      } catch (error) {
        try {
          const rawCode = (error as { code?: unknown } | null)?.code;
          const sqlState =
            typeof rawCode === "string" && /^[0-9A-Z]{5}$/.test(rawCode) ? rawCode : null;
          // Only fixed phases and SQLSTATE; never the error message, SQL, payload or credentials.
          console.info(
            JSON.stringify({
              event: "member_claim_pg_failed",
              stage,
              lastRpcMethod,
              sqlState,
            }),
          );
        } catch {
          /* Preserve the original failure, including an unknown COMMIT. */
        }
        throw error;
      }
    },
  };
}
