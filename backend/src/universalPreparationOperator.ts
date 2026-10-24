import { readUniversalFiniteConfig } from "./universalFiniteConfig";
import { loadDevUniversalOriginalSourceRuntime } from "./universalOriginalSourceRuntime";
import { loadDevUniversalRuntime } from "./universalFiniteRuntime";

// Explicit trusted Operator only, never an HTTP/Native/startup callback. Uses the same
// pinned private capability and existing Source command / Task repository authorities.
export async function prepareUniversalTaskHost(
  mode: "PREPARE_ONCE" | "RECOVER_ONLY",
  environment: Record<string, string | undefined>,
  loaders = {
    config: readUniversalFiniteConfig,
    source: loadDevUniversalOriginalSourceRuntime,
    task: loadDevUniversalRuntime,
  },
) {
  if (mode !== "PREPARE_ONCE" && mode !== "RECOVER_ONLY")
    throw Error("UNIVERSAL_EXPLICIT_PREPARATION_REQUIRED");
  const config = await loaders.config(environment);
  if (!config) return { status: "CLOSED" as const };
  const source = await loaders.source(environment);
  if (!source) throw Error("UNIVERSAL_SOURCE_RUNTIME_CLOSED");
  let outcome: "PREPARED" | "RECONCILED" | "READ_ONLY" = "READ_ONLY";
  try {
    if (mode === "PREPARE_ONCE") {
      // Exactly one invocation. Any error has an unknown write disposition until the
      // existing owning read independently verifies the same pinned Run. Never retry.
      outcome = "PREPARED";
      try {
        await source.prepareInputs();
      } catch {
        outcome = "RECONCILED";
      }
    }
    try {
      await source.readPreparedInputs();
    } catch {
      throw Error("UNIVERSAL_PREPARATION_UNCONFIRMED");
    }
  } finally {
    await source.close();
  }
  // Source traffic is closed before Task phase. This loader validates real current
  // Source/catalog/Auth before using the existing Backend SQLite Task/WakeQueue.
  const task = await loaders.task(environment);
  if (!task) throw Error("OWNING_TASK_READER_UNAVAILABLE");
  try {
    const binding = await task.universalImportPort.readContext(
      config.actorId,
      config.task.import_id!,
      config.task.trip_id!,
    );
    if (
      !binding ||
      binding.actorId !== config.actorId ||
      binding.accountId !== config.task.account_id ||
      binding.tripId !== config.task.trip_id ||
      binding.batchId !== config.task.import_id ||
      binding.taskId !== config.task.task_id
    )
      throw Error("OWNING_TASK_READER_UNAVAILABLE");
    return { status: "TASK_CONTEXT_READY" as const, sourceOutcome: outcome, binding };
  } finally {
    await task.close();
  }
}
