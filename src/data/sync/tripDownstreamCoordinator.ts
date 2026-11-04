import { ApiClientError } from "../api/client";
import type { createMemberAccessLossAdapter } from "../api/memberAccessLossAdapter";
import { coreUuid, coreRevision } from "@/domain/trip/tripCoreV2";
import { AppState } from "react-native";
import {
  assertAccountRequestContext,
  type AccountScope,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import type { CoreReadTransport } from "../api/tripCoreV2Transport";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "../auth/accountGeneration";

// A validated unchanged collection does not rewrite SQLite or disturb pending work.
export async function refreshCoreDownstream(
  core: Pick<
    ReturnType<typeof createTripCoreV2Repository>,
    "acceptedSnapshot" | "refresh"
  >,
  context: AccountRequestContext,
  transport: CoreReadTransport,
  readAccessLoss?: ReturnType<typeof createMemberAccessLossAdapter>,
) {
  const before = await core.acceptedSnapshot(context);
  let result;
  try {
    result = await transport.collection(context);
  } catch (error) {
    if (
      readAccessLoss &&
      error instanceof ApiClientError &&
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      const loss = await readAccessLoss(context);
      if (loss.status === "ACCESS_REVOKED") return true;
    }
    throw error;
  }
  const m = result.manifest,
    c = before?.certificate;
  if (
    c &&
    c.epoch === m.epoch &&
    coreRevision.parse(JSON.parse(c.revision)) === m.revision &&
    c.access_revision === m.accessRevision &&
    c.roster_hash === m.participatingRosterHash &&
    c.actor_person_binding_hash === m.actorPersonBindingHash &&
    c.ordinary_order_version === (m.ordinaryOrderVersion ?? 0)
  )
    return false;
  await core.refresh(context, { collection: async () => result });
  if (!(await core.acceptedSnapshot(context)))
    throw Error("CORE_DOWNSTREAM_CERTIFICATE_MISSING");
  return true;
}

export type TripDiscoveryReadObservation = Readonly<{
  scope: AccountScope;
  status: "RESTORING" | "CONFIRMED" | "UNAVAILABLE";
}>;
type Dependencies = {
  scope(): Promise<AccountScope | null>;
  account(): Promise<string>;
  discover(scope: AccountScope): Promise<string[]>;
  pull(scope: AccountScope, tripId: string): Promise<boolean>;
  notify(scope: AccountScope, tripIds: string[], discoveryChanged: boolean): void;
  observeDiscovery?(observation: TripDiscoveryReadObservation): void;
  now?: () => number;
};
type ReadState = {
  next: number;
  failures: number;
  running?: Promise<void>;
  observation?: TripDiscoveryReadObservation;
};

// Ephemeral read coalescing only. Certificates and Pending/UNKNOWN remain owned by Core.
export function createTripDownstreamCoordinator(deps: Dependencies) {
  const reads = new Map<string, ReadState>();
  const now = deps.now ?? Date.now;
  let tail = Promise.resolve();
  const serial = (work: () => Promise<void>) => {
    const run = tail.then(work);
    tail = run.catch(() => undefined);
    return run;
  };
  async function run(
    scope: AccountScope,
    id: string,
    work: () => Promise<void>,
    invalidated = false,
    isCurrent?: () => boolean,
  ) {
    await assertAccountRequestContext(scope, deps.account);
    const key = `${scope.generation}:${scope.accountId}:${id}`;
    for (const [prior, state] of reads)
      if (!prior.startsWith(`${scope.generation}:${scope.accountId}:`) && !state.running)
        reads.delete(prior);
    let state = reads.get(key);
    if (state?.running) return state.running;
    if (state && now() < state.next && (!invalidated || state.failures > 0)) return;
    state ??= { next: 0, failures: 0 };
    reads.set(key, state);
    const current = state;
    let skipped = false;
    const observe = (status: TripDiscoveryReadObservation["status"]) => {
      if (id !== "discovery") return;
      current.observation = { scope: { ...scope }, status };
      try {
        deps.observeDiscovery?.(current.observation);
      } catch {
        /* A view cannot invalidate the read checkpoint. */
      }
    };
    current.running = serial(async () => {
      const live = await deps.scope();
      if (
        !live ||
        live.accountId !== scope.accountId ||
        live.generation !== scope.generation
      )
        throw Error("TRIP_DOWNSTREAM_NOT_CURRENT");
      await assertAccountRequestContext(scope, deps.account);
      if (isCurrent && !isCurrent()) {
        skipped = true;
        return;
      }
      observe("RESTORING");
      await work();
      await assertAccountRequestContext(scope, deps.account);
    })
      .then(
        () => {
          if (skipped) return;
          current.failures = 0;
          current.next = now() + 15_000;
          observe("CONFIRMED");
        },
        (error: unknown) => {
          current.next =
            now() + [15_000, 30_000, 60_000][Math.min(current.failures++, 2)];
          observe("UNAVAILABLE");
          throw error;
        },
      )
      .finally(() => {
        delete current.running;
      });
    return current.running;
  }
  async function trip(
    scope: AccountScope,
    tripId: string,
    invalidated = false,
    isCurrent?: () => boolean,
  ) {
    coreUuid.parse(tripId);
    return run(
      scope,
      tripId,
      async () => {
        const changed = await deps.pull(scope, tripId);
        await assertAccountRequestContext(scope, deps.account);
        if (changed) deps.notify(scope, [tripId], false);
      },
      invalidated,
      isCurrent,
    );
  }
  async function discover(scope: AccountScope) {
    let ids: string[] = [];
    await run(scope, "discovery", async () => {
      ids = await deps.discover(scope);
      await assertAccountRequestContext(scope, deps.account);
      deps.notify(scope, [], true);
    });
    return ids;
  }
  return {
    discoveryObservation(scope: AccountScope) {
      if (scope.generation !== getAccountGeneration()) return null;
      return (
        reads.get(`${scope.generation}:${scope.accountId}:discovery`)?.observation ?? null
      );
    },
    async discovery() {
      const scope = await deps.scope();
      if (scope) await discover(scope);
    },
    async invalidate(context: AccountRequestContext) {
      await assertAccountRequestContext(context, deps.account);
      const running = reads.get(
        `${context.generation}:${context.accountId}:${context.tripId}`,
      )?.running;
      if (running) await running.catch(() => undefined);
      await assertAccountRequestContext(context, deps.account);
      const live = await deps.scope();
      if (live?.accountId !== context.accountId || live.generation !== context.generation)
        return;
      await trip(context, context.tripId, true);
    },
    async trip(tripId: string, expected?: AccountScope, isCurrent?: () => boolean) {
      const scope = await deps.scope();
      if (expected) {
        await assertAccountRequestContext(expected, deps.account);
        if (
          scope?.accountId !== expected.accountId ||
          scope.generation !== expected.generation
        )
          return;
      }
      if (scope) await trip(scope, tripId, false, isCurrent);
    },
    async account() {
      const scope = await deps.scope();
      if (!scope) return;
      // Do not hold the serial read lane while enqueueing its individual Trip reads.
      const ids = await discover(scope);
      for (const id of ids) {
        try {
          await trip(scope, id);
        } catch {
          await assertAccountRequestContext(scope, deps.account);
        }
      }
    },
  };
}

let coordinator: ReturnType<typeof createTripDownstreamCoordinator> | undefined;
let foregroundTrip: AccountRequestContext | null = null;
subscribeAccountGeneration(() => {
  foregroundTrip = null;
});

export function observeForegroundTrip(context: AccountRequestContext) {
  if (context.generation !== getAccountGeneration()) return () => {};
  const lease = Object.freeze({ ...context });
  foregroundTrip = lease;
  return () => {
    if (foregroundTrip !== lease) return;
    foregroundTrip = null;
  };
}
const discoveryObservationListeners = new Set<
  (value: TripDiscoveryReadObservation) => void
>();
export function subscribeTripDiscoveryReadObservation(
  listener: (value: TripDiscoveryReadObservation) => void,
) {
  discoveryObservationListeners.add(listener);
  return () => {
    discoveryObservationListeners.delete(listener);
  };
}
export function readTripDiscoveryReadObservation(scope: AccountScope) {
  return coordinator?.discoveryObservation(scope) ?? null;
}
async function nativeCoordinator() {
  if (coordinator) return coordinator;
  const [
    { requireAdoptedUserId, readCommittedLocalPrincipal, readCommittedLocalSession },
    { isGeneralAccountCloudSyncEnabled },
    Network,
    { notifyLedgerReadCompletion },
  ] = await Promise.all([
    import("../auth/authRepository"),
    import("./nativeTripQaScope"),
    import("expo-network"),
    import("./ledgerOperationalSync"),
  ]);
  coordinator ??= createTripDownstreamCoordinator({
    account: requireAdoptedUserId,
    async scope() {
      if (!isGeneralAccountCloudSyncEnabled() || AppState.currentState !== "active")
        return null;
      const generation = getAccountGeneration();
      let principal, session;
      try {
        principal = await readCommittedLocalPrincipal();
        session = await readCommittedLocalSession();
      } catch {
        return null;
      }
      if (
        generation !== getAccountGeneration() ||
        principal?.kind !== "ACCOUNT" ||
        principal.accountId !== session?.identity?.userId
      )
        return null;
      const { captureAccountScope } = await import("../auth/accountRequestContext");
      const scope = await captureAccountScope(requireAdoptedUserId);
      if (scope.accountId !== principal.accountId) return null;
      const network = await Network.getNetworkStateAsync();
      await assertAccountRequestContext(scope, requireAdoptedUserId);
      return network.isConnected === false || network.isInternetReachable === false
        ? null
        : scope;
    },
    async discover(scope) {
      const [
        { createTripDiscoveryTransport, refreshTripDiscovery },
        { createTripDiscoveryRepository },
        { readInitializedDatabase },
      ] = await Promise.all([
        import("./tripDiscoveryTransport"),
        import("../repositories/tripDiscoveryRepository"),
        import("../db/database"),
      ]);
      const cache = createTripDiscoveryRepository(
        await readInitializedDatabase(),
        requireAdoptedUserId,
      );
      await refreshTripDiscovery(
        requireAdoptedUserId,
        createTripDiscoveryTransport(requireAdoptedUserId),
        cache,
      );
      await assertAccountRequestContext(scope, requireAdoptedUserId);
      return (await cache.readMerged()).trips
        .filter((row) => row.remoteListed)
        .map((row) => row.id);
    },
    async pull(scope, tripId) {
      const [
        { readInitializedDatabase },
        { createTripCoreV2Repository },
        { createCoreV2Transport },
        { tripCoreSha256Hex },
        { createMemberAccessLossAdapter },
      ] = await Promise.all([
        import("../db/database"),
        import("../repositories/tripCoreV2Repository"),
        import("../api/tripCoreV2Transport"),
        import("../repositories/tripCoreSha256"),
        import("../api/memberAccessLossAdapter"),
      ]);
      const core = createTripCoreV2Repository(
        await readInitializedDatabase(),
        requireAdoptedUserId,
        tripCoreSha256Hex,
      );
      const context = { ...scope, tripId };
      return refreshCoreDownstream(
        core,
        context,
        createCoreV2Transport(requireAdoptedUserId, tripCoreSha256Hex, {
          timeoutMs: 20_000,
        }),
        createMemberAccessLossAdapter(requireAdoptedUserId, core, {
          timeoutMs: 20_000,
        }),
      );
    },
    observeDiscovery(observation) {
      if (observation.scope.generation !== getAccountGeneration()) return;
      for (const listener of discoveryObservationListeners) {
        try {
          listener(observation);
        } catch {
          /* Preserve successful cache apply. */
        }
      }
    },
    notify(scope, journeyIds, discoveryChanged) {
      notifyLedgerReadCompletion({ ...scope, journeyIds, discoveryChanged });
    },
  });
  return coordinator;
}

export async function refreshAccountTripReads() {
  await (await nativeCoordinator()).account();
}
export async function refreshForegroundTripReads() {
  const read = await nativeCoordinator();
  const target = foregroundTrip;
  await read.discovery();
  if (target && foregroundTrip === target)
    await read.trip(target.tripId, target, () => foregroundTrip === target);
}
export async function refreshTripFromCloud(tripId: string) {
  await (await nativeCoordinator()).trip(tripId);
}

// Unmounted until the owning private-subscription contract is qualified.
export async function invalidateTripFromCloud(context: AccountRequestContext) {
  await (await nativeCoordinator()).invalidate(context);
}
