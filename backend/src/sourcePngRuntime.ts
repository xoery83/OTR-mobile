import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import type { DevBackendGateway } from "./app";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { createSourcePngBroker } from "./sourcePngBroker";
import { createSourcePngPrivateStage } from "./sourcePngPrivateStage";
import { createSourcePngStorageProducer } from "./sourcePngStorageProducer";
import { createSourcePngWorkerClient } from "./sourcePngWorkerTransport";
import { createSourcePngRequestPreparation } from "./sourcePngRequestPreparation";
import { createSourcePngBackendPreparation } from "./sourcePngBackendPreparation";

export const sourcePngRuntimePath = "/run/otr/universal-png-runtime.json";
export const sourcePngRuntimeSchema = z.strictObject({
  version: z.literal("OTR_DEV_UNIVERSAL_PNG/1"),
  enabled: z.literal(true),
  environment: z.literal("DEV"),
  project: z.literal("tuqigdxrvrerfewsxqgm"),
  actorId: z.uuid(),
  tripId: z.uuid(),
  expiresAt: z.iso.datetime(),
  nodeId: z.uuid(),
});
export async function readSourcePngRuntimeConfig(
  env: Record<string, string | undefined>,
) {
  if (env.OTR_DEV_UNIVERSAL_PNG_RUNTIME !== "enabled") return undefined;
  if (
    env.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
    env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
  )
    throw Error("PNG_RUNTIME_CONFIG_CLOSED");
  const file = await open(
    sourcePngRuntimePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const s = await file.stat();
    if (
      !s.isFile() ||
      s.uid !== 0 ||
      s.gid !== 999 ||
      (s.mode & 0o777) !== 0o440 ||
      s.nlink !== 1 ||
      s.size > 16384
    )
      throw Error("PNG_RUNTIME_CONFIG_CLOSED");
    const text = await file.readFile("utf8");
    if (
      Buffer.byteLength(text) > 16384 ||
      createHash("sha256").update(text).digest("hex") !==
        env.OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256
    )
      throw Error("PNG_RUNTIME_CONFIG_CLOSED");
    return sourcePngRuntimeSchema.parse(JSON.parse(text));
  } finally {
    await file.close();
  }
}
// Explicit hashed DEV configuration only. Source SQL remains the owning authority.
export function createSourcePngRuntimePorts(
  raw: z.input<typeof sourcePngRuntimeSchema>,
  deps: {
    gateway: DevBackendGateway;
    connection: CorePgConnection;
    storageToken: string;
    assertEnabled(): void;
    assertReadEnabled(): void;
  },
) {
  const config = sourcePngRuntimeSchema.parse(raw);
  let closed = false;
  const assertEnabled = () => {
    deps.assertEnabled();
    if (closed || Date.now() >= Date.parse(config.expiresAt))
      throw Error("SOURCE_CAPABILITY_CLOSED");
  };
  const custody = { accountId: config.actorId, tripId: config.tripId };
  const storage = {
    instanceId: "OTR_DEV_PNG_SOURCE_CUSTODY_V1",
    origin: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    credentialRef: "vault:otr/dev/backend/supabase-secret-key#universal-png-custody",
    serviceToken: deps.storageToken,
    timeoutMs: 15000,
  };
  const worker = createSourcePngWorkerClient("/run/otr/universal-png-worker/worker.sock");
  const stage = createSourcePngPrivateStage("/var/lib/otr/universal-png-stage");
  const forRequest = createSourcePngRequestPreparation({
    gateway: deps.gateway,
    actorId: config.actorId,
    tripId: config.tripId,
    assertEnabled,
    prepare(_scope, guard) {
      const fence = () => {
        assertEnabled();
        guard.assertRequestCurrent();
      };
      const current = async () => {
        fence();
      };
      const authorize = async () => {
        fence();
        await guard.assertCurrent();
        fence();
      };
      return createSourcePngBackendPreparation({
        broker: createSourcePngBroker(deps.connection, authorize, fence),
        stage,
        nodeId: config.nodeId,
        worker,
        assertCurrent: current,
        providerForRequest: (_scope, runSandbox) =>
          createSourcePngStorageProducer(storage, runSandbox, custody, guard),
      });
    },
  });
  return {
    sourcePngPreparationForRequest: forRequest,
    originalMetadataAllowed(actor: string, trip: string) {
      try {
        assertEnabled();
        return actor === config.actorId && trip === config.tripId;
      } catch {
        return false;
      }
    },
    async readOriginal(
      scope: {
        accountId: string;
        tripId: string;
        sourceId: string;
        representationId: string;
        sha256: string;
        byteCount: number;
      },
      assertCurrent: () => Promise<void>,
    ) {
      // Retained bytes use normal Source ACL, not the positive execution clock.
      const assertReadEnabled = () => {
        deps.assertReadEnabled();
        if (closed) throw Error("SOURCE_CAPABILITY_CLOSED");
      };
      const current = async () => {
        assertReadEnabled();
        await assertCurrent();
        assertReadEnabled();
      };
      await current();
      const producer = createSourcePngStorageProducer(
        storage,
        async () => {
          throw Error("PNG_READ_CANNOT_EXECUTE_WORKER");
        },
        custody,
        { assertRequestCurrent: assertReadEnabled, assertCurrent: current },
      );
      const { accountId, tripId, sourceId, representationId, sha256, byteCount } = scope;
      const bytes = await producer.readOriginal({
        accountId,
        tripId,
        sourceId,
        representationId,
        sha256,
        byteCount,
      });
      await current();
      return bytes;
    },
    close() {
      closed = true;
    },
  };
}
