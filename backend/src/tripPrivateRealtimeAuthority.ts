import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  tripRealtimeLeaseSchema,
  tripRealtimeMembershipTransitionSchema as realtimeMembershipTransitionSchema,
  tripRealtimeCommittedTransitionSchema,
  type TripRealtimeLease,
} from "../../src/domain/auth/tripRealtimeAuthorization";
import {
  createTripPrivateRealtimeAdmission,
  type TripPrivateRealtimeAdmissionPort,
} from "./tripPrivateRealtimeAdmission";
import type { DevBackendGateway } from "./app";
import { isNormalAccount } from "./authAccountQualification";
import { isOAuthResourceToken } from "./authResourceTokenBoundary";

const nil = "00000000-0000-0000-0000-000000000000";
const realId = coreUuid.refine((id) => id !== nil);
const generation = z.number().int().positive().safe();
const inputSchema = z.strictObject({
  tripId: realId,
  localGeneration: z.number().int().nonnegative().safe(),
});
const bindingSchema = z.strictObject({
  accountId: realId,
  tripId: realId,
  actorPersonId: realId,
  active: z.boolean(),
  membershipGeneration: generation,
});
const coreSchema = z.strictObject({
  qualification: z.literal("NOT_A_PRIVATE_JOIN_LEASE"),
  actorAccountId: realId,
  tripId: realId,
  actorPersonId: realId,
  coreEpoch: realId,
  coreAccessRevision: generation,
});
export { realtimeMembershipTransitionSchema };
export type RealtimeMembershipBinding = z.infer<typeof bindingSchema>;
export type RealtimeCoreObservation = z.infer<typeof coreSchema>;
export type RealtimeMembershipTransition = z.infer<
  typeof realtimeMembershipTransitionSchema
>;
export type RealtimeAuthorityScope = Parameters<
  TripPrivateRealtimeAdmissionPort["authorizeAndJoin"]
>[0];
export type TripPrivateRealtimeAuthorityTransaction = {
  assertCurrentSession(): Promise<void>;
  currentBinding(): Promise<unknown>;
  // Must use this transaction's held authority/Actor lease, NOT standalone observe() nested BEGIN.
  qualifyCore(): Promise<unknown>;
  assertBindingCurrent(binding: RealtimeMembershipBinding): Promise<void>;
  join(
    binding: RealtimeMembershipBinding,
    core: RealtimeCoreObservation,
    signal: AbortSignal,
  ): Promise<{ lease: TripRealtimeLease; close(): void }>;
  // Existing Core/owning Item projector performs per-item visibility; membership is insufficient.
  readVisibleItem(
    itemId: string,
  ): Promise<{ accountId: string; tripId: string; itemId: string; body: unknown } | null>;
  readOwningTransition(operationId: string): Promise<unknown | null>;
};
export type TripPrivateRealtimeAuthorityPort = {
  atomic<T>(
    scope: RealtimeAuthorityScope,
    work: (tx: TripPrivateRealtimeAuthorityTransaction) => Promise<T>,
  ): Promise<T>;
  // Revalidate immutable committed receipt, reject old generations AND force old transports closed.
  // A TTL, delivery request, or closed socket count alone cannot produce ENFORCED.
  enforceCommittedTransition(
    scope: RealtimeAuthorityScope,
    receipt: RealtimeMembershipTransition,
  ): Promise<{
    status: "ENFORCED" | "UNCONFIRMED";
    receiptId: string;
    membershipGeneration: number;
  }>;
};

// Candidate composition only: no membership writer, ledger, channel transport or route is installed.
export function createTripPrivateRealtimeAuthority(deps: {
  gateway: Pick<DevBackendGateway, "validateAccessToken">;
  port?: TripPrivateRealtimeAuthorityPort;
}) {
  const port = deps.port;
  async function normalScope(
    request: Request,
    raw: unknown,
    extra: "itemId" | "operationId",
  ) {
    if (!port) throw Error("PRIVATE_REALTIME_AUTHORITY_CLOSED");
    request.signal.throwIfAborted();
    const input =
      extra === "itemId"
        ? inputSchema.extend({ itemId: realId }).parse(raw)
        : inputSchema.extend({ operationId: realId }).parse(raw);
    const token = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
    if (!token || isOAuthResourceToken(token)) throw Error("NORMAL_ACCOUNT_REQUIRED");
    const user = await deps.gateway.validateAccessToken(token);
    request.signal.throwIfAborted();
    if (!user || !isNormalAccount(user)) throw Error("NORMAL_ACCOUNT_REQUIRED");
    return {
      scope: Object.freeze({
        accountId: user.id,
        tripId: input.tripId,
        localGeneration: input.localGeneration,
        accessToken: token,
      }),
      id: "itemId" in input ? input.itemId : input.operationId,
    };
  }
  async function qualified(
    tx: TripPrivateRealtimeAuthorityTransaction,
    scope: RealtimeAuthorityScope,
  ) {
    await tx.assertCurrentSession();
    const binding = bindingSchema.parse(await tx.currentBinding());
    if (
      !binding.active ||
      binding.accountId !== scope.accountId ||
      binding.tripId !== scope.tripId
    )
      throw Error("PRIVATE_REALTIME_MEMBERSHIP_DENIED");
    const core = coreSchema.parse(await tx.qualifyCore());
    if (
      core.actorAccountId !== scope.accountId ||
      core.tripId !== scope.tripId ||
      core.actorPersonId !== binding.actorPersonId
    )
      throw Error("PRIVATE_REALTIME_ACTOR_MISMATCH");
    return { binding, core };
  }
  const admission = createTripPrivateRealtimeAdmission({
    gateway: deps.gateway,
    port: port
      ? {
          async authorizeAndJoin(scope, signal) {
            let opened:
              | Awaited<ReturnType<TripPrivateRealtimeAuthorityTransaction["join"]>>
              | undefined;
            try {
              return await port.atomic(scope, async (tx) => {
                signal.throwIfAborted();
                const { binding, core } = await qualified(tx, scope);
                signal.throwIfAborted();
                opened = await tx.join(binding, core, signal);
                const lease = tripRealtimeLeaseSchema.parse(opened.lease);
                if (
                  lease.accountId !== scope.accountId ||
                  lease.tripId !== scope.tripId ||
                  lease.actorPersonId !== binding.actorPersonId ||
                  lease.authorizationRevision !== binding.membershipGeneration
                )
                  throw Error("PRIVATE_REALTIME_LEASE_BINDING");
                await tx.assertCurrentSession();
                await tx.assertBindingCurrent(binding);
                signal.throwIfAborted();
                return opened;
              });
            } catch (error) {
              try {
                opened?.close();
              } catch {
                /* Never upgrade an unknown join to success. */
              }
              throw error;
            }
          },
        }
      : undefined,
  });
  return {
    subscribe: admission,
    async readItem(request: Request, raw: unknown) {
      const { scope, id } = await normalScope(request, raw, "itemId");
      return port!.atomic(scope, async (tx) => {
        const { binding } = await qualified(tx, scope);
        request.signal.throwIfAborted();
        const item = await tx.readVisibleItem(id);
        await tx.assertCurrentSession();
        await tx.assertBindingCurrent(binding);
        request.signal.throwIfAborted();
        if (item === null) return null; // Not visible is not a revocation receipt.
        if (
          item.accountId !== scope.accountId ||
          item.tripId !== scope.tripId ||
          item.itemId !== id
        )
          throw Error("PRIVATE_REALTIME_ITEM_BINDING");
        return item;
      });
    },
    async reconcileTransition(request: Request, raw: unknown) {
      const { scope, id } = await normalScope(request, raw, "operationId");
      const receipt = await port!.atomic<RealtimeMembershipTransition>(
        scope,
        async (tx) => {
          await tx.assertCurrentSession();
          const value = await tx.readOwningTransition(id);
          if (value === null) throw Error("PRIVATE_REALTIME_TRANSITION_UNCONFIRMED");
          const result = realtimeMembershipTransitionSchema.parse(value);
          if (
            result.accountId !== scope.accountId ||
            result.tripId !== scope.tripId ||
            result.operationId !== id
          )
            throw Error("PRIVATE_REALTIME_TRANSITION_BINDING");
          return result;
        },
      );
      let enforcement: "SERVER_GENERATION_FENCE_AND_DISCONNECT" | "UNCONFIRMED" =
        "UNCONFIRMED";
      // Receipt COMMIT is independent of subsequent transport cleanup, failure or cancellation.
      if (!request.signal.aborted) {
        try {
          const enforced = await port!.enforceCommittedTransition(scope, receipt);
          if (
            !request.signal.aborted &&
            enforced.status === "ENFORCED" &&
            enforced.receiptId === receipt.receiptId &&
            enforced.membershipGeneration === receipt.membershipGeneration
          )
            enforcement = "SERVER_GENERATION_FENCE_AND_DISCONNECT";
        } catch {
          /* Keep the committed receipt available for cache-deny; never retry cleanup here. */
        }
      }
      return tripRealtimeCommittedTransitionSchema.parse({
        receipt,
        receiptState: "COMMITTED",
        enforcement,
      });
    },
  };
}
