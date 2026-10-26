import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  universalFiniteConfigSchema,
  universalRuntimePath,
} from "./universalFiniteConfig";
export const universalContinuousConfigSchema = z.strictObject({
  version: z.literal(2),
  environment: z.literal("DEV"),
  project: z.literal("tuqigdxrvrerfewsxqgm"),
  enabled: z.literal(true),
  integrationId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  directory: universalFiniteConfigSchema.shape.directory,
  identity: universalFiniteConfigSchema.shape.identity,
  taskDatabase: universalFiniteConfigSchema.shape.taskDatabase,
  sourcePg: universalFiniteConfigSchema.shape.sourcePg,
  taskPg: universalFiniteConfigSchema.shape.taskPg,
  catalogPg: universalFiniteConfigSchema.shape.catalogPg,
});
// Same reviewed private mount with an explicit version. No App bearer, fixed Actor,
// Batch, Run, Task, finite window or environment-only permission is accepted.
export async function readUniversalContinuousConfig(
  env: Record<string, string | undefined>,
) {
  if (env.OTR_DEV_UNIVERSAL_CONTINUOUS_HOST !== "enabled") return undefined;
  if (
    env.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
    env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
  )
    throw Error("UNIVERSAL_CONTINUOUS_CONFIG_CLOSED");
  let file;
  try {
    file = await open(
      universalRuntimePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw Error("UNIVERSAL_CONTINUOUS_CONFIG_CLOSED");
  }
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 999 ||
      (stat.mode & 0o777) !== 0o440 ||
      stat.nlink !== 1 ||
      stat.size > 131072
    )
      throw 0;
    const body = await file.readFile("utf8");
    if (
      Buffer.byteLength(body) > 131072 ||
      createHash("sha256").update(body).digest("hex") !==
        env.OTR_DEV_UNIVERSAL_RUNTIME_SHA256
    )
      throw 0;
    return universalContinuousConfigSchema.parse(JSON.parse(body));
  } catch {
    throw Error("UNIVERSAL_CONTINUOUS_CONFIG_CLOSED");
  } finally {
    await file.close();
  }
}
