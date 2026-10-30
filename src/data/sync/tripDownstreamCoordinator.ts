import { coreUuid, coreRevision } from "@/domain/trip/tripCoreV2";
import {
  assertAccountRequestContext,
  type AccountScope,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import type { CoreReadTransport } from "../api/tripCoreV2Transport";

// A validated unchanged collection does not rewrite SQLite or disturb pending work.
export async function refreshCoreDownstream(
  core: Pick<
    ReturnType<typeof createTripCoreV2Repository>,
    "acceptedSnapshot" | "refresh"
  >,
  context: AccountRequestContext,
  transport: CoreReadTransport,
) {
  const before = await core.acceptedSnapshot(context);
  const result = await transport.collection(context);
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

type Dependencies = {
  scope(): Promise<AccountScope | null>;
  account(): Promise<string>;
  discover(scope: AccountScope): Promise<string[]>;
  pull(scope: AccountScope, tripId: string): Promise<boolean>;
  notify(scope: AccountScope, tripIds: string[], discoveryChanged: boolean): void;
  now?: () => number;
};
type ReadState = { next: number; failures: number; running?: Promise<void> };

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
  async function run(scope: AccountScope, id: string, work: () => Promise<void>) {
    await assertAccountRequestContext(scope, deps.account);
    const key = `${scope.generation}:${scope.accountId}:${id}`;
    for (const [prior, state] of reads)
      if (!prior.startsWith(`${scope.generation}:${scope.accountId}:`) && !state.running)
        reads.delete(prior);
    let state = reads.get(key);
    if (state?.running) return state.running;
    if (state && now() < state.next) return;
    state ??= { next: 0, failures: 0 };
    reads.set(key, state);
    const current = state;
    current.running = serial(async () => {
      const live = await deps.scope();
      if (
        !live ||
        live.accountId !== scope.accountId ||
        live.generation !== scope.generation
      )
        throw Error("TRIP_DOWNSTREAM_NOT_CURRENT");
      await assertAccountRequestContext(scope, deps.account);
      await work();
      await assertAccountRequestContext(scope, deps.account);
    })
      .then(
        () => {
          current.failures = 0;
          current.next = now() + 15_000;
        },
        (error: unknown) => {
          current.next =
            now() + [15_000, 30_000, 60_000][Math.min(current.failures++, 2)];
          throw error;
        },
      )
      .finally(() => {
        delete current.running;
      });
    return current.running;
  }
  async function trip(scope: AccountScope, tripId: string) {
    coreUuid.parse(tripId);
    return run(scope, tripId, async () => {
      const changed = await deps.pull(scope, tripId);
      await assertAccountRequestContext(scope, deps.account);
      if (changed) deps.notify(scope, [tripId], false);
    });
  }
  return {
    async trip(tripId: string) {
      const scope = await deps.scope();
      if (scope) await trip(scope, tripId);
    },
    async account() {
      const scope = await deps.scope();
      if (!scope) return;
      // Do not hold the serial read lane while enqueueing its individual Trip reads.
      let ids: string[] = [];
      await run(scope, "discovery", async () => {
        ids = await deps.discover(scope);
        await assertAccountRequestContext(scope, deps.account);
        deps.notify(scope, [], true);
      });
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
async function nativeCoordinator() {
  if (coordinator) return coordinator;
  const [
    { requireActiveUserId, readLocalAuthSnapshot },
    { isGeneralAccountCloudSyncEnabled },
    { AppState },
    Network,
    { notifyLedgerReadCompletion },
  ] = await Promise.all([
    import("../auth/authRepository"),
    import("./nativeTripQaScope"),
    import("react-native"),
    import("expo-network"),
    import("./ledgerOperationalSync"),
  ]);
  coordinator ??= createTripDownstreamCoordinator({
    account: requireActiveUserId,
    async scope() {
      if (!isGeneralAccountCloudSyncEnabled() || AppState.currentState !== "active")
        return null;
      const { session, principal } = await readLocalAuthSnapshot();
      if (
        principal?.kind !== "ACCOUNT" ||
        principal.accountId !== session?.identity?.userId
      )
        return null;
      const { captureAccountScope } = await import("../auth/accountRequestContext");
      const scope = await captureAccountScope(requireActiveUserId);
      if (scope.accountId !== principal.accountId) return null;
      const network = await Network.getNetworkStateAsync();
      await assertAccountRequestContext(scope, requireActiveUserId);
      return network.isConnected === false || network.isInternetReachable === false
        ? null
        : scope;
    },
    async discover(scope) {
      const [
        { createTripDiscoveryTransport, refreshTripDiscovery },
        { readLocalTripDiscoveryRepository },
      ] = await Promise.all([
        import("./tripDiscoveryTransport"),
        import("../repositories/tripDiscoveryRepository"),
      ]);
      const cache = await readLocalTripDiscoveryRepository();
      await refreshTripDiscovery(
        requireActiveUserId,
        createTripDiscoveryTransport(requireActiveUserId),
        cache,
      );
      await assertAccountRequestContext(scope, requireActiveUserId);
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
      ] = await Promise.all([
        import("../db/database"),
        import("../repositories/tripCoreV2Repository"),
        import("../api/tripCoreV2Transport"),
        import("../repositories/tripCoreSha256"),
      ]);
      const core = createTripCoreV2Repository(
        await readInitializedDatabase(),
        requireActiveUserId,
        tripCoreSha256Hex,
      );
      const context = { ...scope, tripId };
      return refreshCoreDownstream(
        core,
        context,
        createCoreV2Transport(requireActiveUserId, tripCoreSha256Hex, {
          timeoutMs: 20_000,
        }),
      );
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
export async function refreshTripFromCloud(tripId: string) {
  await (await nativeCoordinator()).trip(tripId);
}
