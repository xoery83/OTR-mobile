import { readUniversalFiniteConfig } from "./universalFiniteConfig";
import { loadDevUniversalOriginalSourceRuntime } from "./universalOriginalSourceRuntime";
import { loadDevUniversalRuntime } from "./universalFiniteRuntime";

// Operator diagnostics are finite categories, never SQL messages, query text or Auth data.
const safePreparationMessages = new Set([
  "SOURCE_ACCESS_DENIED",
  "UNIVERSAL_SOURCE_SCOPE_CLOSED",
  "INPUT_STALE",
  "INVALID_IMPORT_INPUT",
  "INVALID_UNIVERSAL_INPUT",
  "OPERATION_KEY_REUSED",
  "UNIVERSAL_SOURCE_RUN_UNAVAILABLE",
  "UNIVERSAL_SOURCE_BINDING_INVALID",
  "UNIVERSAL_RUNTIME_CLOSED",
  "CORE_PRINCIPAL_UNAVAILABLE",
  "CORE_TRANSACTION_UNFINISHED",
  "CORE_CONNECTION_TIMEOUT",
  "CORE_CONNECTION_RETIRED",
]);
const safePreparationStates = new Set([
  "42501",
  "23503",
  "23505",
  "23514",
  "40001",
  "40P01",
  "57014",
  "55P03",
  "28P01",
  "28000",
  "42702",
  "42883",
  "42P01",
  "42703",
  "08001",
  "08006",
]);
const safePreparationTransports = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
export function classifyPreparationFailure(error: unknown): string {
  const value =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : {};
  if (typeof value.message === "string" && safePreparationMessages.has(value.message))
    return value.message;
  if (typeof value.code === "string" && safePreparationStates.has(value.code))
    return `SQLSTATE_${value.code}`;
  if (typeof value.code === "string" && safePreparationTransports.has(value.code))
    return value.code;
  return "UNCLASSIFIED";
}
export class UniversalPreparationUnconfirmed extends Error {
  constructor(readonly diagnostic: { begin: string; read: string }) {
    super("UNIVERSAL_PREPARATION_UNCONFIRMED");
  }
}

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
  let beginFailure = "NOT_ATTEMPTED";
  try {
    if (mode === "PREPARE_ONCE") {
      // Exactly one invocation. Any error has an unknown write disposition until the
      // existing owning read independently verifies the same pinned Run. Never retry.
      outcome = "PREPARED";
      try {
        await source.prepareInputs();
        beginFailure = "ACKNOWLEDGED";
      } catch (error) {
        beginFailure = classifyPreparationFailure(error);
        outcome = "RECONCILED";
      }
    }
    try {
      await source.readPreparedInputs();
    } catch (error) {
      throw new UniversalPreparationUnconfirmed({
        begin: beginFailure,
        read: classifyPreparationFailure(error),
      });
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
