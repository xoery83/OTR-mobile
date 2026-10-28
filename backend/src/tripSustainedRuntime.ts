import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { TripCreatePort } from "./tripCreate";
import { TripCreateError } from "./tripCreate";
import type { TripMetadataV2Port } from "./tripMetadataV2";
import type { CoreHttpConnection } from "./tripCoreV2Http";
// Service composition only. Real ownership, rollout/revocation and command scope are checked by SQL every time.
// No fixed Trip, QA Actor, temporary window or clock is accepted by this factory.
export function createSustainedDevTripPorts(
  ports: {
    create: TripCreatePort;
    metadata: TripMetadataV2Port;
    core: CoreHttpConnection;
  },
  enabled = false,
) {
  if (!enabled) return undefined;
  let closed = false;
  const guard = (actor: string) => {
    coreUuid.parse(actor);
    if (closed) throw new TripCreateError(503, "TRIP_SUSTAINED_DEV_CLOSED");
  };
  const create: TripCreatePort = {
    async create(actor, request) {
      guard(actor);
      if (!("formatVersion" in request) || request.formatVersion !== 2)
        throw new TripCreateError(400, "TRIP_SUSTAINED_V2_REQUIRED");
      const r = await ports.create.create(actor, request);
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
    async update(actor, request) {
      guard(actor);
      if (request.formatVersion !== 3)
        throw new TripCreateError(400, "TRIP_SUSTAINED_V3_REQUIRED");
      const r = await ports.metadata.update(actor, request);
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
  return {
    tripCreatePort: create,
    tripMetadataV2Port: metadata,
    coreConnection: core,
    close() {
      closed = true;
    },
  };
}
