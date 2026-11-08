import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { DevBackendGateway } from "./app";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { createSourcePdfRequestPreparation } from "./sourcePdfRequestPreparation";
import { createSourcePdfRequestV2 } from "./sourcePdfRequestV2";
import { createSourcePdfV2StorageProducer } from "./sourcePdfStorageProducer";
import { createSourcePdfV2PrivateStage } from "./sourcePdfPrivateStage";
import { createSourcePdfV2WorkerClient } from "./sourcePdfV2WorkerTransport";

export const sourcePdfRuntimePath = "/run/otr/universal-pdf-runtime.json";
export const sourcePdfRuntimeSchema = z.strictObject({
  version: z.literal("OTR_DEV_UNIVERSAL_PDF/1"),
  enabled: z.literal(true),
  environment: z.literal("DEV"),
  project: z.literal("tuqigdxrvrerfewsxqgm"),
  actorId: z.uuid(),
  tripId: z.uuid(),
  // Deadline remains pinned by the existing root-owned hashed config and owning SQL.
  expiresAt: z.iso.datetime(),
  nodeId: z.uuid(),
  ownerRun: z.uuid(),
  producerId: z.uuid(),
});
const sourcePdfConfigSchema = z.discriminatedUnion("version", [
  sourcePdfRuntimeSchema,
  sourcePdfRuntimeSchema.omit({ actorId: true, tripId: true }).extend({
    version: z.literal("OTR_DEV_UNIVERSAL_PDF/2"),
  }),
]);
const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export async function readSourcePdfRuntimeConfig(
  env: Record<string, string | undefined>,
) {
  if (env.OTR_DEV_UNIVERSAL_PDF_RUNTIME !== "enabled") return undefined;
  if (
    env.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
    env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
  )
    throw Error("PDF_RUNTIME_CONFIG_CLOSED");
  const file = await open(
    sourcePdfRuntimePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
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
      throw Error("PDF_RUNTIME_CONFIG_CLOSED");
    const text = await file.readFile("utf8");
    if (
      Buffer.byteLength(text) > 16384 ||
      sha256(text) !== env.OTR_DEV_UNIVERSAL_PDF_RUNTIME_SHA256
    )
      throw Error("PDF_RUNTIME_CONFIG_CLOSED");
    return sourcePdfConfigSchema.parse(JSON.parse(text));
  } finally {
    await file.close();
  }
}

// Called only after an explicit hashed private config; no SQL/Host installation.
export function createSourcePdfRuntimePorts(
  raw: z.input<typeof sourcePdfConfigSchema>,
  deps: {
    gateway: DevBackendGateway;
    connection: CorePgConnection;
    storageToken: string;
    assertEnabled(): void;
  },
) {
  const config = sourcePdfConfigSchema.parse(raw);
  let closed = false;
  const assertEnabled = () => {
    deps.assertEnabled();
    if (closed || Date.now() >= Date.parse(config.expiresAt))
      throw Error("SOURCE_CAPABILITY_CLOSED");
  };
  assertEnabled();
  const connection = deps.connection;
  const worker = createSourcePdfV2WorkerClient(
    "/run/otr/universal-pdf-worker/worker.sock",
  );
  const storage = {
    instanceId: "OTR_DEV_PDF_SOURCE_CUSTODY_V1",
    origin: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    credentialRef: "vault:otr/dev/backend/supabase-secret-key#universal-pdf-custody",
    serviceToken: deps.storageToken,
    timeoutMs: 15000,
  };
  const stage = createSourcePdfV2PrivateStage("/var/lib/otr/universal-pdf-stage", worker);
  function portsForRequest(request: Request, actor: string) {
    assertEnabled();
    const route = /^\/v2\/trips\/([^/]+)\/sources\//.exec(new URL(request.url).pathname);
    const trip = coreUuid.safeParse(route?.[1]);
    if (
      !trip.success ||
      !coreUuid.safeParse(actor).success ||
      (config.version === "OTR_DEV_UNIVERSAL_PDF/1" &&
        (actor !== config.actorId || trip.data !== config.tripId))
    )
      throw Error("SOURCE_ACCESS_DENIED");
    const custody = { accountId: actor, tripId: trip.data };
    const provider = createSourcePdfV2StorageProducer(storage, worker, custody);
    const workload = {
      ownerRun: config.ownerRun,
      producerId: config.producerId,
      providerInstanceSha256: provider.configurationSha256,
    };
    return { custody, workload };
  }
  return {
    originalMetadataAllowed(actor: string, trip: string) {
      try {
        assertEnabled();
        return config.version === "OTR_DEV_UNIVERSAL_PDF/2"
          ? coreUuid.safeParse(actor).success && coreUuid.safeParse(trip).success
          : actor === config.actorId && trip === config.tripId;
      } catch {
        return false;
      }
    },
    sourcePdfV4PreparationForRequest(request: Request, actor: string) {
      const { custody, workload } = portsForRequest(request, actor);
      return createSourcePdfRequestPreparation({
        gateway: deps.gateway,
        connection,
        workload,
        nodeId: config.nodeId,
        requestBoundReserve: config.version === "OTR_DEV_UNIVERSAL_PDF/2",
        assertEnabled,
        stage,
        providerForRequest: (guard) =>
          createSourcePdfV2StorageProducer(storage, worker, custody, guard),
      })(request, actor);
    },
    sourcePdfV2ForRequest(request: Request, actor: string) {
      const { custody, workload } = portsForRequest(request, actor);
      return createSourcePdfRequestV2({
        gateway: deps.gateway,
        connection,
        workload,
        assertEnabled,
        hash: async (bytes) => sha256(bytes),
        runWorker: worker,
        readOriginalForRequest: (guard) =>
          createSourcePdfV2StorageProducer(storage, worker, custody, guard).readOriginal,
      })(request, actor);
    },
    close() {
      closed = true;
    },
  };
}
