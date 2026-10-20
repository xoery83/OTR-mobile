// Internal, explicit recovery seam only. No app import, startup, timer, credential
// selection, provider call, parser dispatch or filesystem deletion adapter.
const principal = "otr_trip_source_command_gateway";
const profile = "PNG_STATIC_RGB8_RGBA8_V1";
const fingerprint = "526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
const phases = [
  "STARTING",
  "RUNNING",
  "TERMINATION_REQUIRED",
  "UNKNOWN",
  "TERMINAL",
] as const;
type Phase = (typeof phases)[number];
export type ExecutionObligation = Readonly<{
  attemptId: string;
  operationId: string;
  sourceId: string;
  representationId: string;
  ownerRun: string | null;
  fence: number;
  phase: Phase;
  runToken: string;
  containerId: string | null;
  runtimeNodeId: string | null;
  resourceId: string;
}>;
export type RecoveryObligation = ExecutionObligation &
  Readonly<{
    nodeId: string;
    resourceKey: string;
    payloadHash: string;
    byteCount: number;
  }>;
type Rpc = (
  routine: "trip_source_execution_inventory" | "trip_source_execution_claim",
  parameters: Readonly<Record<string, string | number>>,
) => Promise<unknown>;
function fail(): never {
  throw new Error("SOURCE_EXECUTION_RECOVERY_UNAVAILABLE");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) return fail();
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !hash.test(value)) return fail();
  return value;
}
function generation(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    return fail();
  return value;
}
function obligation(raw: unknown): ExecutionObligation {
  const row = object(raw);
  if (
    row.execution_principal !== principal ||
    row.profile_id !== profile ||
    row.profile_sha256 !== fingerprint ||
    !phases.includes(row.phase as Phase)
  )
    return fail();
  const fence = generation(row.owner_fence);
  const ownerRun = row.owner_run === null ? null : id(row.owner_run);
  if ((ownerRun === null) !== (fence === 0)) return fail();
  const containerId = row.container_id === null ? null : digest(row.container_id);
  const runtimeNodeId = row.runtime_node_id === null ? null : id(row.runtime_node_id);
  if ((containerId === null) !== (runtimeNodeId === null)) return fail();
  const terminal = row.phase === "TERMINAL";
  if (
    row.termination_outstanding !== !terminal ||
    (row.phase === "RUNNING" && (!containerId || !ownerRun))
  )
    return fail();
  if (terminal) {
    if (
      !containerId ||
      !ownerRun ||
      typeof row.terminal_observed_at !== "string" ||
      typeof row.terminal_result !== "string" ||
      ![
        "PARSE_PASS",
        "PARSER_TIMEOUT",
        "PARSER_CRASH",
        "PARSER_RESOURCE_LIMIT",
        "PARSER_OUTPUT_LIMIT",
        "PARSER_PROTOCOL",
        "FORMAT_REJECTED",
      ].includes(row.terminal_result)
    )
      return fail();
    digest(row.terminal_evidence_sha256);
  } else if (
    row.terminal_observed_at !== null ||
    row.terminal_evidence_sha256 !== null ||
    row.terminal_result !== null
  )
    return fail();
  digest(row.operation_sha256);
  return Object.freeze({
    attemptId: id(row.id),
    operationId: id(row.operation_id),
    sourceId: id(row.source_id),
    representationId: id(row.representation_id),
    ownerRun,
    fence,
    phase: row.phase as Phase,
    runToken: id(row.run_token),
    containerId,
    runtimeNodeId,
    resourceId: id(row.staged_resource_id),
  });
}
export function createSourceExecutionRecovery(rpc: Rpc | null) {
  async function call(name: Parameters<Rpc>[0], params: Parameters<Rpc>[1]) {
    if (!rpc) return fail();
    // Any ambiguous transport remains unresolved. There is no retry/fallback.
    try {
      return await rpc(name, params);
    } catch {
      return fail();
    }
  }
  return Object.freeze({
    async inventory(): Promise<readonly RecoveryObligation[]> {
      const raw = await call("trip_source_execution_inventory", {});
      if (!Array.isArray(raw)) return fail();
      const seen = new Set<string>();
      return Object.freeze(
        raw.map((value) => {
          const row = object(value),
            entry = obligation(row),
            stage = object(row.staged_resource);
          if (
            seen.has(entry.attemptId) ||
            id(stage.id) !== entry.resourceId ||
            stage.execution_principal !== principal ||
            stage.cleaned_at !== null
          )
            return fail();
          seen.add(entry.attemptId);
          id(stage.node_id);
          if (entry.runtimeNodeId !== null && entry.runtimeNodeId !== stage.node_id)
            return fail();
          digest(stage.resource_key);
          digest(stage.payload_sha256);
          if (
            typeof stage.byte_count !== "number" ||
            !Number.isSafeInteger(stage.byte_count) ||
            stage.byte_count < 1 ||
            stage.byte_count > 52428800
          )
            return fail();
          // Recover exact opaque resource identity; never reinterpret it as a path.
          return Object.freeze({
            ...entry,
            nodeId: stage.node_id as string,
            resourceKey: stage.resource_key as string,
            payloadHash: stage.payload_sha256 as string,
            byteCount: stage.byte_count,
          });
        }),
      );
    },
    async takeOwnership(
      attemptId: string,
      expectedFence: number,
      newOwnerRun: string,
    ): Promise<ExecutionObligation> {
      id(attemptId);
      generation(expectedFence);
      id(newOwnerRun);
      if (expectedFence >= Number.MAX_SAFE_INTEGER) return fail();
      const raw = await call("trip_source_execution_claim", {
        attempt: attemptId,
        expected_fence: expectedFence,
        new_owner_run: newOwnerRun,
      });
      const entry = obligation(raw);
      if (
        entry.attemptId !== attemptId ||
        entry.ownerRun !== newOwnerRun ||
        entry.fence !== expectedFence + 1 ||
        (expectedFence === 0
          ? !["STARTING", "UNKNOWN"].includes(entry.phase)
          : !["UNKNOWN", "TERMINAL"].includes(entry.phase))
      )
        return fail();
      // This result transfers reconciliation responsibility ONLY, never dispatch.
      return entry;
    },
  });
}
