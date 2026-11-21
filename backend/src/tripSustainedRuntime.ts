import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { TripCreatePort } from "./tripCreate";
import { TripCreateError } from "./tripCreate";
import type { TripMetadataV2Port } from "./tripMetadataV2";
import type { CoreHttpConnection } from "./tripCoreV2Http";
import type { TripLifecyclePort } from "./tripLifecycle";
// Service composition only. Real ownership, rollout/revocation and command scope are checked by SQL every time.
// No fixed Trip, QA Actor, temporary window or clock is accepted by this factory.
export function createSustainedDevTripPorts(
  ports: {
    create: TripCreatePort;
    metadata: TripMetadataV2Port;
    core: CoreHttpConnection;
    lifecycle?: TripLifecyclePort;
  },
  enabled = false,
) {
  if (!enabled) return undefined;
  let closed = false;
  const guard = (actor: string) => {
    coreUuid.parse(actor);
    if (closed) throw new TripCreateError(503, "TRIP_SUSTAINED_DEV_CLOSED");
  };
  const guardRead = <Args extends unknown[], Result>(
    read?: (actor: string, ...args: Args) => Promise<Result>,
  ) => read && (async (actor: string, ...args: Args) => {
    guard(actor);
    const result = await read(actor, ...args);
    guard(actor);
    return result;
  });
  const create: TripCreatePort = {
    ...(ports.create.parentReceipt
      ? {
          async parentReceipt(actor: string, trip: string) {
            guard(actor);
            const result = await ports.create.parentReceipt!(actor, trip);
            guard(actor);
            return result;
          },
        }
      : {}),
    async create(actor, request, ...admission) {
      guard(actor);
      if (!("formatVersion" in request) || request.formatVersion !== 2)
        throw new TripCreateError(400, "TRIP_SUSTAINED_V2_REQUIRED");
      const r = await ports.create.create(actor, request, ...admission);
      guard(actor);
      return r;
    },
    async receipt(actor, operation) {
      guard(actor);
      const r = await ports.create.receipt(actor, operation);
      guard(actor);
      return r;
    },
  };
  const metadata: TripMetadataV2Port = {
    async update(actor, request, admit) {
      guard(actor);
      if (request.formatVersion !== 3)
        throw new TripCreateError(400, "TRIP_SUSTAINED_V3_REQUIRED");
      const r = await ports.metadata.update(actor, request, admit);
      guard(actor);
      return r;
    },
    async receipt(actor, operation) {
      guard(actor);
      const r = await ports.metadata.receipt(actor, operation);
      guard(actor);
      return r;
    },
    async snapshot(actor, trip, operation) {
      guard(actor);
      const r = await ports.metadata.snapshot(actor, trip, operation);
      guard(actor);
      return r;
    },
  };
  const core: CoreHttpConnection = {
    hash: ports.core.hash,
    ...(ports.core.memberAccess ? {
      memberAccess: {
        async execute(actor, trip, command) {
          guard(actor);
          const result = await ports.core.memberAccess!.execute(actor, trip, command);
          guard(actor);
          return result;
        },
        readOperation: guardRead(ports.core.memberAccess.readOperation)!,
        observeAccessLoss: guardRead(ports.core.memberAccess.observeAccessLoss)!,
      },
    } : {}),
    ...(ports.core.readRetainedPng
      ? {
          async readRetainedPng(scope, assertCurrent) {
            guard(scope.accountId);
            const bytes = await ports.core.readRetainedPng!(scope, async () => {
              guard(scope.accountId);
              await assertCurrent();
            });
            guard(scope.accountId);
            return bytes;
          },
        }
      : {}),
    ...(ports.core.publishUniversalP1 &&
    ports.core.finalizeUniversalP1Operation &&
    ports.core.source
      ? {
          source: {
            async withLockedSourcePlan(scope, work) {
              guard(scope.actorAccountId);
              const value = await ports.core.source!.withLockedSourcePlan(
                scope,
                async (tx) => {
                  guard(scope.actorAccountId);
                  const v = await work(tx);
                  guard(scope.actorAccountId);
                  return v;
                },
              );
              guard(scope.actorAccountId);
              return value;
            },
          },
          async publishUniversalP1(actor, trip, input) {
            guard(actor);
            const value = await ports.core.publishUniversalP1!(actor, trip, input);
            guard(actor);
            return value;
          },
          async finalizeUniversalP1Operation(actor, trip, input) {
            guard(actor);
            const value = await ports.core.finalizeUniversalP1Operation!(
              actor,
              trip,
              input,
            );
            guard(actor);
            return value;
          },
        }
      : {}),
    commands: {
      async withLockedCommand(scope, work) {
        guard(scope.actorAccountId);
        const r = await ports.core.commands.withLockedCommand(scope, async (tx) => {
          guard(scope.actorAccountId);
          const value = await work(tx);
          guard(scope.actorAccountId);
          return value;
        });
        guard(scope.actorAccountId);
        return r;
      },
    },
    async readOperation(actor, trip, operation) {
      guard(actor);
      const r = await ports.core.readOperation(actor, trip, operation);
      guard(actor);
      return r;
    },
    ...(ports.core.read
      ? {
          read: {
            people: guardRead(ports.core.read.people),
            items: guardRead(ports.core.read.items),
            itemSnapshot: guardRead(ports.core.read.itemSnapshot),
            itemLifecycle: guardRead(ports.core.read.itemLifecycle),
            betaCapabilityContext: guardRead(ports.core.read.betaCapabilityContext),
            async collection(
              ...args: Parameters<NonNullable<CoreHttpConnection["read"]>["collection"]>
            ) {
              guard(args[0]);
              const r = await ports.core.read!.collection(...args);
              guard(args[0]);
              return r;
            },
            async item(
              ...args: Parameters<NonNullable<CoreHttpConnection["read"]>["item"]>
            ) {
              guard(args[0]);
              const r = await ports.core.read!.item(...args);
              guard(args[0]);
              return r;
            },
            async capabilities(
              ...args: Parameters<
                NonNullable<NonNullable<CoreHttpConnection["read"]>["capabilities"]>
              >
            ) {
              guard(args[0]);
              if (!ports.core.read!.capabilities) throw Error("CORE_CAPABILITY_CLOSED");
              const r = await ports.core.read!.capabilities(...args);
              guard(args[0]);
              return r;
            },
          },
        }
      : {}),
  };
  const owningLifecycle = ports.lifecycle;
  const lifecycle: TripLifecyclePort | undefined = owningLifecycle && {
    async base(actor, trip) {
      guard(actor);
      const result = await owningLifecycle.base(actor, trip);
      guard(actor);
      return result;
    },
    async apply(actor, request, ...admission) {
      guard(actor);
      const result = await owningLifecycle.apply(actor, request, ...admission);
      guard(actor);
      return result;
    },
    async receipt(actor, trip, operation) {
      guard(actor);
      const result = await owningLifecycle.receipt(actor, trip, operation);
      guard(actor);
      return result;
    },
  };
  return {
    tripCreatePort: create,
    tripMetadataV2Port: metadata,
    ...(lifecycle ? { tripLifecyclePort: lifecycle } : {}),
    coreConnection: core,
    close() {
      closed = true;
    },
  };
}
