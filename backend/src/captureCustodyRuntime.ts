import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import {
  captureCustodyBatchSchema,
  captureUniversalCustodyBatchSchema,
  captureCustodyBindingJson,
  type CaptureMaterialCustody,
} from "../../src/domain/capture/captureCustody";
import { createCaptureStorageMaterial } from "./captureStorageMaterial";
import { createFlightPrivateCustody } from "./flightPrivateCustody";

export const captureCustodyRuntimePath = "/run/otr/capture-custody.json";
const legacySchema = z.strictObject({
  version: z.literal(1),
  directory: z.literal("/var/lib/otr/capture-custody"),
  identity: z.strictObject({
    store_id: z.uuid(),
    device: z.string().regex(/^[0-9]+$/),
    inode: z.string().regex(/^[0-9]+$/),
  }),
  expiresAt: z.iso.datetime({ offset: true }),
  batch: captureCustodyBatchSchema,
});
const schema = z.union([
  legacySchema,
  z.strictObject({
    ...legacySchema.shape,
    version: z.literal(2),
    batch: captureUniversalCustodyBatchSchema,
  }),
]);
// Explicit deployment entry only; same private-file checks as Catalog, no new secret.
export async function loadDevCaptureCustody(
  environment: Record<string, string | undefined>,
) {
  let file;
  try {
    file = await open(
      captureCustodyRuntimePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("CAPTURE_RUNTIME_UNAVAILABLE");
  }
  let config: z.infer<typeof schema>;
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 999 ||
      (stat.mode & 0o777) !== 0o440 ||
      stat.nlink !== 1 ||
      stat.size > 65536
    )
      throw 0;
    const body = await file.readFile("utf8");
    if (Buffer.byteLength(body) > 65536) throw 0;
    config = schema.parse(JSON.parse(body));
    if (config.version === 1 && (stat.size > 8192 || Buffer.byteLength(body) > 8192))
      throw 0;
    const remaining = Date.parse(config.expiresAt) - Date.now();
    if (
      remaining <= 0 ||
      remaining > (config.version === 2 ? 900000 : 86400000) ||
      environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
      environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
    )
      throw 0;
  } catch {
    throw new Error("CAPTURE_RUNTIME_UNAVAILABLE");
  } finally {
    await file.close();
  }
  const storage = createCaptureStorageMaterial({
    instanceId: "tuqigdxrvrerfewsxqgm",
    origin: environment.OTR_DEV_SUPABASE_URL!,
    credentialRef: "OTR_DEV_SUPABASE_SECRET_KEY",
    serviceToken: environment.OTR_DEV_SUPABASE_SECRET_KEY ?? "",
    timeoutMs: 15000,
  });
  const stores = await createFlightPrivateCustody(
    config.directory,
    config.identity,
    storage,
  );
  const assertCurrent = () => {
    if (Date.now() >= Date.parse(config.expiresAt))
      throw new Error("CAPTURE_RUNTIME_UNAVAILABLE");
  };
  const assertBinding = (binding: Parameters<CaptureMaterialCustody["read"]>[0]) => {
    assertCurrent();
    if (
      !config.batch.inputs.some(
        (b) => captureCustodyBindingJson(b) === captureCustodyBindingJson(binding),
      )
    )
      throw new Error("CAPTURE_CUSTODY_BINDING_CONFLICT");
  };
  const captureMaterialCustody: CaptureMaterialCustody = {
    async put(binding, bytes) {
      assertBinding(binding);
      await stores.captureMaterial.put(binding, bytes);
      assertBinding(binding);
    },
    async read(binding) {
      assertBinding(binding);
      const bytes = await stores.captureMaterial.read(binding);
      assertBinding(binding);
      return bytes;
    },
  };
  try {
    assertCurrent();
    return { captureMaterialCustody, close: stores.close };
  } catch (error) {
    await stores.close();
    throw error;
  }
}
