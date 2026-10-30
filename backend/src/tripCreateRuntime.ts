import { loadDevGuestAdoptionRuntime } from "./guestAdoptionRuntime";
import type { PublishedUniversalP1Reader } from "./universalP1SourcePg";
import { createHash } from "node:crypto";
import { createSustainedDevTripPorts } from "./tripSustainedRuntime";
import { createTripPersonCloudCreatePgPort } from "./tripPersonCloudCreatePg";
import {
  PersonCloudCreateError,
  type TripPersonCloudCreatePort,
} from "./tripPersonCloudCreateHttp";
import {
  createNormalDevTripPorts,
  normalDevTripRuntimeSchema,
} from "./tripNormalRuntime";
import {
  createTripPgConnection,
  createTripMetadataPgConnection,
  createCorePgConnection,
  createPersonPgConnection,
} from "./tripCoreV2PgConnection";
import { createTripMetadataV2PgStorage } from "./tripMetadataV2PgStorage";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import { tripCreateWireRequestSchema as tripCreateRequestSchema } from "../../src/domain/trip/tripCreateWireContract";
import { TripCreateError, type TripCreatePort } from "./tripCreate";
import { createTripPgStorage } from "./tripCreatePgStorage";

// Proposed private mount only; loading it cannot provision a principal or open SQL gates.
export const tripCreateRuntimePath = "/run/otr/trip-create-runtime.json";
const finiteTripCreateRuntimeSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.literal(true),
  expiresAt: z.iso.datetime({ offset: true }),
  actorAccountId: z.uuid(),
  request: tripCreateRequestSchema,
  tripPg: z.strictObject({
    host: z.literal("db.tuqigdxrvrerfewsxqgm.supabase.co"),
    port: z.literal(5432),
    database: z.literal("postgres"),
    password: z.string().min(1),
    ca: z.string().min(1).optional(),
  }),
});

// Same private owning mount; disjoint version, never reinterpret a finite request.
const pgConfig = finiteTripCreateRuntimeSchema.shape.tripPg;
const normalTripCreateRuntimeSchema = z
  .strictObject({
    version: z.literal(2),
    enabled: z.literal(true),
    expiresAt: z.iso.datetime(),
    actorAccountId: z.uuid(),
    adoptionCutoff: z.iso.datetime(),
    startsAt: z.iso.datetime(),
    tripPg: pgConfig,
    metadataPg: pgConfig,
    corePg: pgConfig,
  })
  .superRefine((v, ctx) => {
    if (
      !normalDevTripRuntimeSchema.safeParse({
        version: 1,
        actorAccountId: v.actorAccountId,
        adoptionCutoff: v.adoptionCutoff,
        startsAt: v.startsAt,
        expiresAt: v.expiresAt,
      }).success
    )
      ctx.addIssue({ code: "custom", message: "INVALID_NORMAL_DEV_SCOPE" });
  });
const sustainedTripCreateRuntimeSchema = z.strictObject({
  version: z.literal(3),
  enabled: z.literal(true),
  tripPg: pgConfig,
  metadataPg: pgConfig,
  corePg: pgConfig,
  personPg: pgConfig,
});
export const tripCreateRuntimeSchema = z.union([
  finiteTripCreateRuntimeSchema,
  normalTripCreateRuntimeSchema,
  sustainedTripCreateRuntimeSchema,
]);

export async function loadDevTripCreateRuntime(
  environment: Record<string, string | undefined>,
  readUniversalP1?: PublishedUniversalP1Reader,
) {
  let file;
  try {
    file = await open(
      tripCreateRuntimePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("TRIP_CREATE_RUNTIME_UNAVAILABLE");
  }
  let config: z.infer<typeof tripCreateRuntimeSchema>;
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 999 ||
      (stat.mode & 0o777) !== 0o440 ||
      stat.nlink !== 1 ||
      stat.size > 139264
    )
      throw 0;
    const body = await file.readFile("utf8");
    if (Buffer.byteLength(body) > 139264) throw 0;
    config = tripCreateRuntimeSchema.parse(JSON.parse(body));
    if (
      config.version === 1 &&
      !("formatVersion" in config.request) &&
      (stat.size > 16384 || Buffer.byteLength(body) > 16384)
    )
      throw 0;
    const remaining =
      config.version === 3 ? null : Date.parse(config.expiresAt) - Date.now();
    // Keep the existing finite activation's maximum 15-minute window; no automatic renewal.
    if (
      (remaining !== null &&
        (remaining <= 0 || remaining > (config.version === 2 ? 86400000 : 900000))) ||
      environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
      environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
    )
      throw 0;
  } catch {
    throw new Error("TRIP_CREATE_RUNTIME_UNAVAILABLE");
  } finally {
    await file.close();
  }
  if (config.version === 3) {
    const rawCoreConnection = createCorePgConnection(config.corePg);
    const guestAdoptionRuntime = loadDevGuestAdoptionRuntime(
      environment,
      rawCoreConnection,
    );
    const sustained = createSustainedDevTripPorts(
      {
        create: createTripPgStorage(createTripPgConnection(config.tripPg)),
        metadata: createTripMetadataV2PgStorage(
          createTripMetadataPgConnection(config.metadataPg),
        ),
        core: createCorePgHttpConnection(
          rawCoreConnection,
          async (bytes) => createHash("sha256").update(bytes).digest("hex"),
          undefined,
          {
            sustainedDev: true,
            ...(readUniversalP1 ? { reviewedP1: true as const } : {}),
          },
          readUniversalP1,
        ),
      },
      true,
    );
    if (!sustained) throw new Error("TRIP_CREATE_RUNTIME_UNAVAILABLE");
    const person = createTripPersonCloudCreatePgPort(
      createPersonPgConnection(config.personPg),
    );
    let closed = false;
    const guard = () => {
      if (closed) throw new PersonCloudCreateError(503, "PERSON_CREATE_CLOSED");
    };
    const tripPersonCloudCreatePort: TripPersonCloudCreatePort = {
      async create(actor, request) {
        guard();
        const result = await person.create(actor, request);
        guard();
        return result;
      },
      async receipt(actor, trip, operation) {
        guard();
        const result = await person.receipt(actor, trip, operation);
        guard();
        return result;
      },
    };
    return {
      ...sustained,
      guestAdoptionRuntime,
      tripPersonCloudCreatePort,
      async close() {
        closed = true;
        sustained.close();
      },
    };
  }
  if (config.version === 2) {
    const normal = createNormalDevTripPorts(
      {
        version: 1,
        actorAccountId: config.actorAccountId,
        adoptionCutoff: config.adoptionCutoff,
        startsAt: config.startsAt,
        expiresAt: config.expiresAt,
      },
      {
        create: createTripPgStorage(createTripPgConnection(config.tripPg)),
        metadata: createTripMetadataV2PgStorage(
          createTripMetadataPgConnection(config.metadataPg),
        ),
        core: createCorePgHttpConnection(
          createCorePgConnection(config.corePg),
          async (bytes) => createHash("sha256").update(bytes).digest("hex"),
        ),
      },
    );
    return {
      ...normal,
      async close() {
        normal.close();
      },
    };
  }
  const storage = createTripPgStorage(createTripPgConnection(config.tripPg));
  let closed = false;
  const scope = (actor: string, operationId: string) => {
    if (closed || Date.now() >= Date.parse(config.expiresAt))
      throw new TripCreateError(503, "TRIP_CREATE_CLOSED");
    if (actor !== config.actorAccountId || operationId !== config.request.operationId)
      throw new TripCreateError(403, "TRIP_CREATE_FORBIDDEN");
  };
  const tripCreatePort: TripCreatePort = {
    async create(actor, request) {
      scope(actor, request.operationId);
      const checked = tripCreateRequestSchema.parse(request);
      if (
        checked.tripId !== config.request.tripId ||
        checked.name !== config.request.name ||
        checked.destination !== config.request.destination ||
        checked.startDate !== config.request.startDate ||
        checked.endDate !== config.request.endDate ||
        JSON.stringify(checked) !== JSON.stringify(config.request)
      )
        throw new TripCreateError(409, "TRIP_CREATE_COLLISION");
      const result = await storage.create(actor, checked);
      scope(actor, checked.operationId);
      return result;
    },
    async receipt(actor, operationId) {
      scope(actor, operationId);
      const result = await storage.receipt(actor, operationId);
      scope(actor, operationId);
      if (result && result.tripId !== config.request.tripId)
        throw new TripCreateError(503, "TRIP_CREATE_RESULT_MISMATCH");
      return result;
    },
  };
  return {
    tripCreatePort,
    async close() {
      closed = true;
    },
  };
}
