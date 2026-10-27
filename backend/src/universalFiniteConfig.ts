import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { taskSchema, attemptSchema } from "../../src/domain/intelligence/persistence";
export const universalRuntimePath = "/run/otr/universal-runtime.json";
const pg = z.strictObject({
  host: z.literal("db.tuqigdxrvrerfewsxqgm.supabase.co"),
  port: z.literal(5432),
  database: z.literal("postgres"),
  password: z.string().min(1).max(8192),
  ca: z.string().min(1).max(16384),
});
export const universalFiniteConfigSchema = z.strictObject({
  version: z.literal(1),
  environment: z.literal("DEV"),
  project: z.literal("tuqigdxrvrerfewsxqgm"),
  startsAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  actorId: z.uuid(),
  bearer: z.string().min(1).max(8192),
  sessionReference: z.string().regex(/^vault:[A-Za-z0-9/_-]{1,128}$/),
  task: taskSchema,
  attempt: attemptSchema,
  directory: z.literal("/var/lib/otr/universal-custody"),
  identity: z.strictObject({
    store_id: z.uuid(),
    device: z.string().regex(/^\d+$/),
    inode: z.string().regex(/^\d+$/),
  }),
  taskDatabase: z.literal("/var/lib/otr/universal-custody/continuations.db"),
  sourcePg: pg,
  taskPg: pg,
  catalogPg: pg,
});

// Exact private Operator mount. Missing file is CLOSED; no environment-only permission minting.
export async function readUniversalFiniteConfig(
  environment: Record<string, string | undefined>,
) {
  let file;
  try {
    file = await open(
      universalRuntimePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw Error("UNIVERSAL_RUNTIME_CLOSED");
  }
  let config: z.infer<typeof universalFiniteConfigSchema>;
  try {
    const stat = await file.stat();
    const body = await file.readFile("utf8");
    if (
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 999 ||
      (stat.mode & 0o777) !== 0o440 ||
      stat.nlink !== 1 ||
      stat.size > 131072 ||
      Buffer.byteLength(body) > 131072 ||
      createHash("sha256").update(body).digest("hex") !==
        environment.OTR_DEV_UNIVERSAL_RUNTIME_SHA256
    )
      throw Error();
    config = universalFiniteConfigSchema.parse(JSON.parse(body));
  } catch {
    throw Error("UNIVERSAL_RUNTIME_CLOSED");
  } finally {
    await file.close();
  }
  if (
    environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
    environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
    Date.parse(config.expiresAt) - Date.parse(config.startsAt) > 900000 ||
    Date.parse(config.expiresAt) <= Date.parse(config.startsAt) ||
    config.actorId !== config.task.account_id ||
    config.task.task_id !== config.attempt.task_id ||
    config.task.account_id !== config.attempt.account_id ||
    !config.task.trip_id ||
    config.task.policy_snapshot.deadline !== config.expiresAt
  )
    throw Error("UNIVERSAL_RUNTIME_CLOSED");
  assertUniversalFiniteCurrent(config, environment);
  return config;
}
export function assertUniversalFiniteCurrent(
  config: z.infer<typeof universalFiniteConfigSchema>,
  environment: Record<string, string | undefined>,
) {
  if (
    Date.now() < Date.parse(config.startsAt) ||
    Date.now() >= Date.parse(config.expiresAt) ||
    environment.OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT !== "enabled"
  )
    throw Error("UNIVERSAL_RUNTIME_CLOSED");
}
