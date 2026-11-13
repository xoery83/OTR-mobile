import { tripRealtimeLeaseSchema } from "../../src/domain/auth/tripRealtimeAuthorization";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { CoreActor } from "../../src/domain/trip/tripCoreV2Mutation";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import { realtimeMembershipTransitionSchema } from "./tripPrivateRealtimeAuthority";
import type {
  RealtimeAuthorityScope,
  RealtimeCoreObservation,
  RealtimeMembershipBinding,
  TripPrivateRealtimeAuthorityPort,
  TripPrivateRealtimeAuthorityTransaction,
} from "./tripPrivateRealtimeAuthority";

export type RealtimeHeldCoreAuthority = {
  query: CorePgLease["query"];
  // Formal current/revoked Session check for this exact bearer, not only getUser/account existence.
  currentSession(): Promise<{ sessionId: string; accountId: string }>;
  currentActor(): Promise<CoreActor>;
  qualifyCore(): Promise<RealtimeCoreObservation>;
  readVisibleItem: TripPrivateRealtimeAuthorityTransaction["readVisibleItem"];
};
export type RealtimeCoreAtomicPort = {
  // Core owns BEGIN/COMMIT/ROLLBACK and canonical membership row locks; no nested observe().
  withScope<T>(
    scope: RealtimeAuthorityScope,
    work: (held: RealtimeHeldCoreAuthority) => Promise<T>,
  ): Promise<T>;
};
type SessionScope = RealtimeAuthorityScope & Readonly<{ sessionId: string }>;
type Transport = {
  // Hold delivery until assertCurrent passes AFTER the admission transaction acknowledges COMMIT.
  open(
    scope: SessionScope,
    binding: RealtimeMembershipBinding,
    core: RealtimeCoreObservation,
    assertCurrent: () => Promise<void>,
    signal: AbortSignal,
  ): ReturnType<TripPrivateRealtimeAuthorityTransaction["join"]>;
  enforce?: TripPrivateRealtimeAuthorityPort["enforceCommittedTransition"];
};

// Connection-liveness only. Canonical Core Actor remains the business authority.
// No schema creation, grant, generation increment, membership writer or default transport.
export function createTripPrivateRealtimePgAuthorityPort(deps: {
  core: RealtimeCoreAtomicPort;
  transport: Transport;
}): TripPrivateRealtimeAuthorityPort {
  async function session(held: RealtimeHeldCoreAuthority, scope: RealtimeAuthorityScope) {
    const identity = await held.currentSession();
    const id = coreUuid.parse(identity.sessionId);
    if (
      id === "00000000-0000-0000-0000-000000000000" ||
      identity.accountId !== scope.accountId
    )
      throw Error("PRIVATE_REALTIME_SESSION_BINDING");
    return id;
  }
  async function binding(held: RealtimeHeldCoreAuthority, scope: RealtimeAuthorityScope) {
    const actor = await held.currentActor();
    if (
      actor.accountId !== scope.accountId ||
      actor.tripId !== scope.tripId ||
      !actor.personId
    )
      throw Error("PRIVATE_REALTIME_CANONICAL_ACTOR_REQUIRED");
    const row = (
      await held.query(
        "SELECT generation::float8 AS generation FROM public.trip_realtime_liveness WHERE account_id=$1::uuid AND trip_id=$2::uuid FOR SHARE",
        [scope.accountId, scope.tripId],
      )
    ).rows[0];
    if (!Number.isSafeInteger(row?.generation) || (row?.generation as number) <= 0)
      throw Error("PRIVATE_REALTIME_GENERATION_UNAVAILABLE");
    return {
      accountId: actor.accountId,
      tripId: actor.tripId,
      actorPersonId: actor.personId,
      active: actor.active,
      membershipGeneration: row!.generation as number,
    };
  }
  async function assertBinding(
    held: RealtimeHeldCoreAuthority,
    scope: RealtimeAuthorityScope,
    expected: RealtimeMembershipBinding,
  ) {
    const current = await binding(held, scope);
    if (
      !current.active ||
      current.actorPersonId !== expected.actorPersonId ||
      current.membershipGeneration !== expected.membershipGeneration ||
      current.accountId !== expected.accountId ||
      current.tripId !== expected.tripId
    )
      throw Error("PRIVATE_REALTIME_STALE_GENERATION");
  }
  const atomic: TripPrivateRealtimeAuthorityPort["atomic"] = async (scope, work) => {
    let committed = false;
    const result = await deps.core.withScope(scope, async (held) => {
      let boundSession: string | undefined;
      const assertSession = async () => {
        const id = await session(held, scope);
        if (boundSession !== undefined && boundSession !== id)
          throw Error("PRIVATE_REALTIME_SESSION_CHANGED");
        boundSession = id;
      };
      const tx: TripPrivateRealtimeAuthorityTransaction = {
        assertCurrentSession: assertSession,
        currentBinding: () => binding(held, scope),
        qualifyCore: () => held.qualifyCore(),
        assertBindingCurrent: (expected) => assertBinding(held, scope, expected),
        async join(expected, core, signal) {
          expected = Object.freeze({ ...expected });
          core = Object.freeze({ ...core });
          await assertSession();
          const sessionId = boundSession!;
          let opened:
            | Awaited<ReturnType<TripPrivateRealtimeAuthorityTransaction["join"]>>
            | undefined;
          let expiresAt: number | undefined;
          let closed = false;
          const close = () => {
            if (closed) return;
            closed = true;
            try {
              opened?.close();
            } catch {
              /* Admission never retries transport cleanup. */
            }
          };
          const unexpired = () => {
            if (expiresAt === undefined || Date.now() >= expiresAt) {
              close();
              throw Error("PRIVATE_REALTIME_LEASE_EXPIRED");
            }
            if (closed) throw Error("PRIVATE_REALTIME_LEASE_CLOSED");
          };
          const assertCurrent = async () => {
            if (!committed) throw Error("PRIVATE_REALTIME_JOIN_NOT_COMMITTED");
            unexpired();
            try {
              await deps.core.withScope(scope, async (live) => {
                if ((await session(live, scope)) !== sessionId)
                  throw Error("PRIVATE_REALTIME_SESSION_CHANGED");
                await assertBinding(live, scope, expected);
                const now = await live.qualifyCore();
                if (now.coreEpoch !== core.coreEpoch)
                  throw Error("PRIVATE_REALTIME_CORE_EPOCH_CHANGED");
              });
            } catch (error) {
              close();
              throw error;
            }
            unexpired();
          };
          try {
            opened = await deps.transport.open(
              Object.freeze({ ...scope, sessionId }),
              expected,
              core,
              assertCurrent,
              signal,
            );
            const lease = tripRealtimeLeaseSchema.parse(opened.lease);
            expiresAt = lease.expiresAt;
            unexpired();
            signal.throwIfAborted();
            return { lease, close };
          } catch (error) {
            close();
            throw error;
          }
        },
        readVisibleItem: (itemId) => held.readVisibleItem(itemId),
        async readOwningTransition(operationId) {
          const row = (
            await held.query(
              `SELECT jsonb_build_object(
          'receiptId',receipt_id,'operationId',operation_id,'accountId',account_id,
          'tripId',trip_id,'actorPersonId',actor_person_id,'kind',kind,
          'previousGeneration',previous_generation,'membershipGeneration',generation) AS receipt
          FROM public.trip_realtime_transitions WHERE account_id=$1::uuid AND trip_id=$2::uuid
            AND operation_id=$3::uuid`,
              [scope.accountId, scope.tripId, operationId],
            )
          ).rows[0];
          return row?.receipt ?? null;
        },
      };
      return work(tx);
    });
    committed = true;
    return result;
  };
  return {
    atomic,
    async enforceCommittedTransition(scope, receipt) {
      const expected = realtimeMembershipTransitionSchema.parse(receipt);
      const current = await atomic(scope, async (tx) => {
        await tx.assertCurrentSession();
        return tx.readOwningTransition(expected.operationId);
      });
      const committed = realtimeMembershipTransitionSchema.parse(current);
      if (JSON.stringify(committed) !== JSON.stringify(expected))
        throw Error("PRIVATE_REALTIME_TRANSITION_NOT_COMMITTED");
      if (!deps.transport.enforce)
        return {
          status: "UNCONFIRMED",
          receiptId: receipt.receiptId,
          membershipGeneration: receipt.membershipGeneration,
        };
      return deps.transport.enforce(scope, committed);
    },
  };
}
