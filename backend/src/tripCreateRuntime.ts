import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import { tripCreateWireRequestSchema as tripCreateRequestSchema } from "../../src/domain/trip/tripCreateWireContract";
import { TripCreateError, type TripCreatePort } from "./tripCreate";
import { createTripPgConnection } from "./tripCoreV2PgConnection";
import { createTripPgStorage } from "./tripCreatePgStorage";

// Proposed private mount only; loading it cannot provision a principal or open SQL gates.
export const tripCreateRuntimePath = "/run/otr/trip-create-runtime.json";
export const tripCreateRuntimeSchema = z.strictObject({
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

export async function loadDevTripCreateRuntime(
  environment: Record<string, string | undefined>,
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
      !("formatVersion" in config.request) &&
      (stat.size > 16384 || Buffer.byteLength(body) > 16384)
    )
      throw 0;
    const remaining = Date.parse(config.expiresAt) - Date.now();
    // Keep the existing finite activation's maximum 15-minute window; no automatic renewal.
    if (
      remaining <= 0 ||
      remaining > 900000 ||
      environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
      environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
    )
      throw 0;
  } catch {
    throw new Error("TRIP_CREATE_RUNTIME_UNAVAILABLE");
  } finally {
    await file.close();
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
