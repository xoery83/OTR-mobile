import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  type Stats,
} from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { universalBatchInputsSchema } from "./universalBatchSource";
import {
  mixedBInitialDigest,
  mixedBInitialManifestSchema,
} from "./universalMixedBTaskReservation";
import { universalContinuousSelectionSchema } from "./universalRegisteredTaskDraft";
import {
  universalFiniteConfigSchema,
  universalRuntimePath,
} from "./universalFiniteConfig";
export const universalContinuousConfigSchema = z
  .strictObject({
    version: z.literal(2),
    environment: z.literal("DEV"),
    project: z.literal("tuqigdxrvrerfewsxqgm"),
    enabled: z.literal(true),
    integrationId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
    mixedBInitialAcquisition: z
      .strictObject({
        initial: mixedBInitialManifestSchema,
        startsAt: z.iso.datetime({ offset: true }),
        expiresAt: z.iso.datetime({ offset: true }),
      })
      .optional(),
    finiteNative: z
      .strictObject({
        version: z.literal(1),
        startsAt: z.iso.datetime({ offset: true }),
        expiresAt: z.iso.datetime({ offset: true }),
        batch: universalBatchInputsSchema.extend({ actorId: z.uuid(), tripId: z.uuid() }),
        selection: universalContinuousSelectionSchema,
        mixedBForwardRecovery: z
          .strictObject({
            initial: mixedBInitialManifestSchema,
            materialInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .optional(),
      })
      .superRefine((v, c) => {
        const duration = Date.parse(v.expiresAt) - Date.parse(v.startsAt);
        if (
          duration <= 0 ||
          duration > 900000 ||
          BigInt(v.selection.maxCostNanos) > 50000000n
        )
          c.addIssue({ code: "custom", message: "UNIVERSAL_FINITE_NATIVE_BOUNDS" });
        const forward = v.mixedBForwardRecovery;
        if (forward) {
          const { initial } = forward;
          if (
            initial.actorId !== v.batch.actorId ||
            initial.tripId !== v.batch.tripId ||
            initial.batchId !== v.batch.batchId ||
            initial.submissionSha256 !== v.batch.submissionSha256 ||
            forward.materialInputSha256 === mixedBInitialDigest(initial) ||
            v.batch.inputs.length !== initial.originals.length ||
            initial.originals.some(
              (original) =>
                !v.batch.inputs.some(
                  (pin) =>
                    pin.id === original.inputId &&
                    pin.source_id === original.sourceId &&
                    pin.representation_id === original.originalRepresentationId &&
                    pin.payload_sha256 === original.sha256 &&
                    pin.byte_count === original.byteCount,
                ),
            )
          )
            c.addIssue({ code: "custom", message: "MIXED_B_FORWARD_CONFIG_BINDING" });
        }
      })
      .optional(),
    qaExecutionFence: z
      .strictObject({
        version: z.literal(1),
        accountId: z.uuid(),
        tripId: z.uuid(),
      })
      .optional(),
    directory: universalFiniteConfigSchema.shape.directory,
    identity: universalFiniteConfigSchema.shape.identity,
    taskDatabase: universalFiniteConfigSchema.shape.taskDatabase,
    sourcePg: universalFiniteConfigSchema.shape.sourcePg,
    taskPg: universalFiniteConfigSchema.shape.taskPg,
    catalogPg: universalFiniteConfigSchema.shape.catalogPg,
  })
  .superRefine((v, c) => {
    const initial = v.mixedBInitialAcquisition;
    if (initial) {
      const duration = Date.parse(initial.expiresAt) - Date.parse(initial.startsAt);
      if (
        v.finiteNative ||
        duration <= 0 ||
        duration > 900000 ||
        (v.qaExecutionFence &&
          (v.qaExecutionFence.accountId !== initial.initial.actorId ||
            v.qaExecutionFence.tripId !== initial.initial.tripId))
      )
        c.addIssue({ code: "custom", message: "MIXED_B_INITIAL_PHASE_BINDING" });
    }
    if (
      v.finiteNative &&
      (v.finiteNative.selection.integrationId !== v.integrationId ||
        (v.qaExecutionFence &&
          (v.qaExecutionFence.accountId !== v.finiteNative.batch.actorId ||
            v.qaExecutionFence.tripId !== v.finiteNative.batch.tripId)))
    )
      c.addIssue({ code: "custom", message: "UNIVERSAL_FINITE_NATIVE_BINDING" });
  });
const maxConfigBytes = 131072;
const configFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
function validMount(stat: Stats) {
  return (
    stat.isFile() &&
    stat.uid === 0 &&
    stat.gid === 999 &&
    (stat.mode & 0o777) === 0o440 &&
    stat.nlink === 1 &&
    stat.size <= maxConfigBytes
  );
}
function sameMount(first: Stats, actual: Stats) {
  return (
    validMount(actual) &&
    Number.isSafeInteger(first.dev) &&
    Number.isSafeInteger(first.ino) &&
    actual.dev === first.dev &&
    actual.ino === first.ino &&
    actual.size === first.size &&
    actual.mtimeMs === first.mtimeMs &&
    actual.ctimeMs === first.ctimeMs
  );
}
function assertPinnedMount(
  env: Record<string, string | undefined>,
  expected: Stats,
  expectedSha256: string,
) {
  let fd: number | undefined;
  try {
    if (env.OTR_DEV_UNIVERSAL_RUNTIME_SHA256 !== expectedSha256) throw 0;
    fd = openSync(universalRuntimePath, configFlags);
    if (!sameMount(expected, fstatSync(fd))) throw 0;
    const body = Buffer.allocUnsafe(expected.size + 1);
    let length = 0;
    while (length < body.length) {
      const n = readSync(fd, body, length, body.length - length, null);
      if (n === 0) break;
      length += n;
    }
    // The open descriptor may survive removal or replacement of its path.
    if (
      length !== expected.size ||
      createHash("sha256").update(body.subarray(0, length)).digest("hex") !==
        expectedSha256 ||
      !sameMount(expected, fstatSync(fd)) ||
      !sameMount(expected, lstatSync(universalRuntimePath))
    )
      throw 0;
  } catch {
    throw Error("MIXED_B_FORWARD_CONFIG_CHANGED");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
// Same private mount/hash. Optional execution restriction never supplies Auth,
// Source/Provider permission, a caller bearer or a Batch/Run/Task identity.
export async function readUniversalContinuousConfig(
  env: Record<string, string | undefined>,
  pinForwardConfig?: (assertCurrent: () => void) => void,
) {
  if (env.OTR_DEV_UNIVERSAL_CONTINUOUS_HOST !== "enabled") return undefined;
  if (
    env.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
    env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
  )
    throw Error("UNIVERSAL_CONTINUOUS_CONFIG_CLOSED");
  let file;
  try {
    file = await open(universalRuntimePath, configFlags);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw Error("UNIVERSAL_CONTINUOUS_CONFIG_CLOSED");
  }
  try {
    const stat = await file.stat();
    if (!validMount(stat)) throw 0;
    const body = await file.readFile("utf8");
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (
      Buffer.byteLength(body) > maxConfigBytes ||
      sha256 !== env.OTR_DEV_UNIVERSAL_RUNTIME_SHA256
    )
      throw 0;
    const config = universalContinuousConfigSchema.parse(JSON.parse(body));
    if (
      (config.mixedBInitialAcquisition || config.finiteNative?.mixedBForwardRecovery) &&
      pinForwardConfig
    ) {
      const assertCurrent = () => assertPinnedMount(env, stat, sha256);
      assertCurrent();
      pinForwardConfig(assertCurrent);
    }
    return config;
  } catch {
    throw Error("UNIVERSAL_CONTINUOUS_CONFIG_CLOSED");
  } finally {
    await file.close();
  }
}
