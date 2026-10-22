import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import { tripMetadataV2UpdateSchema } from "../../src/domain/trip/tripMetadataV2Contract";
import { type TripMetadataV2Port } from "./tripMetadataV2";
import { TripMetadataError } from "./tripMetadata";
import { createTripMetadataPgConnection } from "./tripCoreV2PgConnection";
import { createTripMetadataV2PgStorage } from "./tripMetadataV2PgStorage";

// Proposed private mount only; loading it cannot provision a principal or open SQL gates.
export const tripMetadataV2RuntimePath = "/run/otr/trip-metadata-runtime.json";
export const tripMetadataV2RuntimeSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.literal(true),
  expiresAt: z.iso.datetime({ offset: true }),
  actorAccountId: z.uuid(),
  request: tripMetadataV2UpdateSchema,
  metadataPg: z.strictObject({
    host: z.literal("db.tuqigdxrvrerfewsxqgm.supabase.co"),
    port: z.literal(5432),
    database: z.literal("postgres"),
    password: z.string().min(1),
    ca: z.string().min(1).optional(),
  }),
});

export async function loadDevTripMetadataV2Runtime(
  environment: Record<string, string | undefined>,
) {
  let file;
  try {
    file = await open(
      tripMetadataV2RuntimePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("TRIP_METADATA_RUNTIME_UNAVAILABLE");
  }
  let config: z.infer<typeof tripMetadataV2RuntimeSchema>;
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 999 ||
      (stat.mode & 0o777) !== 0o440 ||
      stat.nlink !== 1 ||
      stat.size > 16384
    )
      throw 0;
    const body = await file.readFile("utf8");
    if (Buffer.byteLength(body) > 16384) throw 0;
    config = tripMetadataV2RuntimeSchema.parse(JSON.parse(body));
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
    throw new Error("TRIP_METADATA_RUNTIME_UNAVAILABLE");
  } finally {
    await file.close();
  }
  const storage = createTripMetadataV2PgStorage(
    createTripMetadataPgConnection(config.metadataPg),
  );
  let closed = false;
  const scope = (actor: string, operationId: string) => {
    if (closed || Date.now() >= Date.parse(config.expiresAt))
      throw new TripMetadataError(503, "TRIP_METADATA_CLOSED");
    if (actor !== config.actorAccountId || operationId !== config.request.operationId)
      throw new TripMetadataError(403, "TRIP_METADATA_FORBIDDEN");
  };
  const tripMetadataV2Port: TripMetadataV2Port = {
    async update(actor, request) {
      scope(actor, request.operationId);
      const checked = tripMetadataV2UpdateSchema.parse(request);
      if (JSON.stringify(checked) !== JSON.stringify(config.request))
        throw new TripMetadataError(409, "TRIP_METADATA_COLLISION");
      const result = await storage.update(actor, checked);
      scope(actor, checked.operationId);
      return result;
    },
    async snapshot(actor, tripId, operationId) {
      scope(actor, operationId);
      if (tripId !== config.request.tripId)
        throw new TripMetadataError(403, "TRIP_METADATA_FORBIDDEN");
      const result = await storage.snapshot(actor, tripId, operationId);
      scope(actor, operationId);
      if (result.tripId !== tripId || result.actorAccountId !== actor)
        throw new TripMetadataError(503, "TRIP_METADATA_RESULT_MISMATCH");
      return result;
    },
    async receipt(actor, operationId) {
      scope(actor, operationId);
      const result = await storage.receipt(actor, operationId);
      scope(actor, operationId);
      if (result && result.tripId !== config.request.tripId)
        throw new TripMetadataError(503, "TRIP_METADATA_RESULT_MISMATCH");
      return result;
    },
  };
  return {
    tripMetadataV2Port,
    async close() {
      closed = true;
    },
  };
}
