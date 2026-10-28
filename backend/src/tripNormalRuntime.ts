import { z } from "zod";
import type { TripCreatePort } from "./tripCreate";
import { TripCreateError } from "./tripCreate";
import type { TripMetadataV2Port } from "./tripMetadataV2";
import type { CoreHttpConnection } from "./tripCoreV2Http";
export const normalDevTripRuntimeSchema = z
  .strictObject({
    version: z.literal(1),
    actorAccountId: z.uuid(),
    adoptionCutoff: z.iso.datetime(),
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .refine(
    (v) =>
      Date.parse(v.adoptionCutoff) <= Date.parse(v.startsAt) &&
      Date.parse(v.expiresAt) > Date.parse(v.startsAt) &&
      Date.parse(v.expiresAt) - Date.parse(v.startsAt) <= 86400000,
  );
export type NormalDevTripRuntime = z.infer<typeof normalDevTripRuntimeSchema>;
// Caller supplies existing owning Pg ports. This factory neither logs in nor installs/opens SQL.
export function createNormalDevTripPorts(
  input: NormalDevTripRuntime,
  ports: {
    create: TripCreatePort;
    metadata: TripMetadataV2Port;
    core: CoreHttpConnection;
  },
  clock = () => Date.now(),
) {
  const scope = normalDevTripRuntimeSchema.parse(input);
  let closed = false;
  const guard = (actor: string) => {
    if (
      closed ||
      clock() < Date.parse(scope.startsAt) ||
      clock() >= Date.parse(scope.expiresAt)
    )
      throw new TripCreateError(503, "TRIP_NORMAL_DEV_CLOSED");
    if (actor !== scope.actorAccountId)
      throw new TripCreateError(403, "TRIP_NORMAL_DEV_FORBIDDEN");
  };
  const tripCreatePort: TripCreatePort = {
    async create(actor, request) {
      guard(actor);
      if (!("formatVersion" in request) || request.formatVersion !== 2)
        throw new TripCreateError(400, "TRIP_NORMAL_V2_REQUIRED");
      const result = await ports.create.create(actor, request);
      guard(actor);
      return result;
    },
    async receipt(actor, operation) {
      guard(actor);
      const result = await ports.create.receipt(actor, operation);
      guard(actor);
      return result;
    },
  };
  const tripMetadataV2Port: TripMetadataV2Port = {
    async update(actor, request) {
      guard(actor);
      if (request.formatVersion !== 3)
        throw new TripCreateError(400, "TRIP_NORMAL_METADATA_V3_REQUIRED");
      const result = await ports.metadata.update(actor, request);
      guard(actor);
      return result;
    },
    async receipt(actor, operation) {
      guard(actor);
      const result = await ports.metadata.receipt(actor, operation);
      guard(actor);
      return result;
    },
    async snapshot(actor, trip, operation) {
      guard(actor);
      const result = await ports.metadata.snapshot(actor, trip, operation);
      guard(actor);
      return result;
    },
  };
  // Source/Review/Admission/Document custody ports are deliberately not exposed here.
  const coreConnection: CoreHttpConnection = {
    hash: ports.core.hash,
    commands: {
      async withLockedCommand(commandScope, work) {
        guard(commandScope.actorAccountId);
        const result = await ports.core.commands.withLockedCommand(
          commandScope,
          async (tx) => {
            guard(commandScope.actorAccountId);
            const value = await work(tx);
            guard(commandScope.actorAccountId);
            return value;
          },
        );
        guard(commandScope.actorAccountId);
        return result;
      },
    },
    async readOperation(actor, trip, operation) {
      guard(actor);
      const result = await ports.core.readOperation(actor, trip, operation);
      guard(actor);
      return result;
    },
    ...(ports.core.read
      ? {
          read: {
            async collection(
              ...args: Parameters<NonNullable<CoreHttpConnection["read"]>["collection"]>
            ) {
              guard(args[0]);
              const result = await ports.core.read!.collection(...args);
              guard(args[0]);
              return result;
            },
            async item(
              ...args: Parameters<NonNullable<CoreHttpConnection["read"]>["item"]>
            ) {
              guard(args[0]);
              const result = await ports.core.read!.item(...args);
              guard(args[0]);
              return result;
            },
            async capabilities(
              ...args: Parameters<
                NonNullable<NonNullable<CoreHttpConnection["read"]>["capabilities"]>
              >
            ) {
              guard(args[0]);
              if (!ports.core.read!.capabilities)
                throw new TripCreateError(503, "CORE_CAPABILITY_CLOSED");
              const result = await ports.core.read!.capabilities(...args);
              guard(args[0]);
              return result;
            },
          },
        }
      : {}),
  };
  return {
    tripCreatePort,
    tripMetadataV2Port,
    coreConnection,
    close() {
      closed = true;
    },
  };
}
