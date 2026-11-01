import {
  tripRealtimeLeaseSchema,
  tripRealtimeRevocationSchema,
  type TripRealtimeLease,
  type TripRealtimeRevocation,
} from "../../domain/auth/tripRealtimeAuthorization";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "./accountRequestContext";
import { subscribeAccountGeneration } from "./accountGeneration";

type Events = {
  invalidated(hint: { leaseId: string; authorizationRevision: number }): void;
  revoked(receipt: TripRealtimeRevocation): void;
  disconnected(): void;
};
type Dependencies = {
  account(): Promise<string>;
  // Trusted owning port: normal-session server admission and actual private join are atomic.
  open?(
    context: AccountRequestContext,
    events: Events,
    signal: AbortSignal,
  ): Promise<{
    lease: TripRealtimeLease;
    close(): void;
  }>;
  accessRevoked(
    context: AccountRequestContext,
    receipt: TripRealtimeRevocation,
  ): Promise<void>;
};

export function createTripPrivateRealtimeAuthorization(deps: Dependencies) {
  // Process-only stale-result defense; every open must recheck the server's durable access fence.
  const revoked = new Map<string, number>();
  const pendingCacheFence = new Map<string, TripRealtimeRevocation>();
  return async (
    input: AccountRequestContext,
    invalidated: () => void,
    disconnected: () => void,
    signal: AbortSignal,
  ): Promise<() => void> => {
    if (!deps.open || signal.aborted) throw Error("PRIVATE_REALTIME_UNAVAILABLE");
    const context = Object.freeze({ ...input });
    await assertAccountRequestContext(context, deps.account);
    const key = JSON.stringify([context.accountId, context.tripId]);
    if (pendingCacheFence.has(key))
      throw Error("PRIVATE_REALTIME_CACHE_FENCE_UNCONFIRMED");
    const controller = new AbortController();
    let stopped = false;
    let opened: Awaited<ReturnType<NonNullable<Dependencies["open"]>>> | undefined;
    let lease: TripRealtimeLease | undefined;
    let transportClosed = false;
    const closeTransport = () => {
      if (!opened || transportClosed) return;
      transportClosed = true;
      try {
        opened.close();
      } catch {
        /* Cleanup stays nonfatal during Account transitions. */
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unlisten = () => {};
    const close = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", close);
      unlisten();
      controller.abort();
      closeTransport();
    };
    const unavailable = () => {
      close();
      disconnected();
    };
    unlisten = subscribeAccountGeneration(unavailable);
    signal.addEventListener("abort", close, { once: true });
    try {
      if (signal.aborted) {
        close();
        throw Error("PRIVATE_REALTIME_UNAVAILABLE");
      }
      opened = await deps.open(
        context,
        {
          invalidated(hint) {
            if (stopped) return;
            if (!lease) return;
            if (Date.now() >= lease.expiresAt) {
              unavailable();
              return;
            }
            if (
              hint.leaseId !== lease.leaseId ||
              hint.authorizationRevision !== lease.authorizationRevision
            )
              return;
            void assertAccountRequestContext(context, deps.account)
              .then(() => {
                if (!stopped && lease && Date.now() < lease.expiresAt) invalidated();
              })
              .catch(unavailable);
          },
          revoked(value) {
            if (stopped) return;
            const parsed = tripRealtimeRevocationSchema.safeParse(value);
            if (!parsed.success) {
              unavailable();
              return;
            }
            const receipt = parsed.data;
            if (
              receipt.accountId !== context.accountId ||
              receipt.tripId !== context.tripId
            )
              return;
            if (
              receipt.authorizationRevision <=
              Math.max(lease?.authorizationRevision ?? -1, revoked.get(key) ?? -1)
            )
              return;
            try {
              assertAccountRequestGeneration(context);
            } catch {
              unavailable();
              return;
            }
            revoked.set(key, receipt.authorizationRevision);
            pendingCacheFence.set(key, receipt);
            close();
            void assertAccountRequestContext(context, deps.account)
              .then(async () => {
                await deps.accessRevoked(context, receipt);
                if (pendingCacheFence.get(key) === receipt) pendingCacheFence.delete(key);
              })
              .catch(() => {
                // Keep this exact revision's denied fence on identity/storage failure.
              })
              .finally(disconnected);
          },
          disconnected: unavailable,
        },
        controller.signal,
      );
      lease = tripRealtimeLeaseSchema.parse(opened.lease);
      await assertAccountRequestContext(context, deps.account);
      const remaining = lease.expiresAt - Date.now();
      if (
        stopped ||
        signal.aborted ||
        lease.accountId !== context.accountId ||
        lease.tripId !== context.tripId ||
        lease.authorizationRevision <= (revoked.get(key) ?? -1) ||
        pendingCacheFence.has(key) ||
        remaining <= 0 ||
        remaining > 2_147_483_647
      )
        throw Error("PRIVATE_REALTIME_AUTHORIZATION_REJECTED");
      timer = setTimeout(unavailable, remaining);
      return close;
    } catch (error) {
      close();
      closeTransport();
      throw error;
    }
  };
}
