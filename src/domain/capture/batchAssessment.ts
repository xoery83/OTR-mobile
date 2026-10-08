import { z } from "zod";
import {
  captureIdSchema,
  captureRevisionSchema,
  sha256Schema,
  CAPTURE_LIMITS,
} from "./localCapture";
import {
  flightInputSchema,
  flightLocatorSchema,
  importDigest,
  type ImportHash,
} from "../trip/flightImportReview";
import { flightClosureCandidateSchema } from "../trip/flightImportClosure";
import { canonicalEventJson, parseEventJson, type Json } from "../trip/eventIntentJson";

// C4a contract observations only. No repository, publication or action authority.
export const BATCH_ASSESSMENT_LIMITS = Object.freeze({
  inputs: 64,
  bindings: 64,
  findings: 64,
  bytes: 1_048_576,
});
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
const revision = captureRevisionSchema;
const original = z.strictObject({
  captureId: captureIdSchema,
  payloadId: captureIdSchema,
  revision,
  sha256: sha256Schema,
  byteCount: z.number().int().positive().max(CAPTURE_LIMITS.binaryBytes),
});
export const captureIntakeManifestSchema = z.strictObject({
  version: z.literal(1),
  accountId: uuid,
  batchId: uuid,
  jobId: uuid,
  submissionKey: uuid,
  contextSnapshotId: uuid,
  contextSha256: sha256Schema,
  tripPriorId: uuid.nullable(),
  manifestVersion: revision,
  inputs: z
    .array(
      z.strictObject({
        inputId: uuid,
        replayKey: uuid,
        ordinal: z.number().int().nonnegative().max(63),
        continuesFromInputId: uuid.nullable(),
      }),
    )
    .min(1)
    .max(64),
});
const acquisition = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("ACCEPTED"), original }),
  z.strictObject({ state: z.enum(["FAILED", "PENDING", "UNKNOWN"]) }),
]);
const binding = z.strictObject({
  accountId: uuid,
  batchId: uuid,
  runId: uuid,
  runGeneration: revision,
  runInputSha256: sha256Schema,
  originalSha256: sha256Schema,
  pin: flightInputSchema,
});
const processing = z.enum([
  "UNDERSTOOD",
  "FAILED",
  "UNSUPPORTED",
  "DEFERRED",
  "PENDING",
  "UNKNOWN",
  "NOT_APPLICABLE",
]);
const candidate = flightClosureCandidateSchema
  .pick({
    id: true,
    run_id: true,
    proposal_sha256: true,
    input_sha256: true,
  })
  .extend({ id: uuid, run_id: uuid });
const locators = z.array(flightLocatorSchema).min(1).max(64);
const finding = z.strictObject({
  id: uuid,
  candidate,
  evidence: locators,
  question: z.enum(["NONE", "SEMANTIC"]),
  // Complete explicit dependency coverage; omission is never independence.
  dependencies: z
    .array(
      z.discriminatedUnion("relation", [
        z.strictObject({ inputId: uuid, relation: z.enum(["DEPENDS_ON", "UNKNOWN"]) }),
        z.strictObject({
          inputId: uuid,
          relation: z.literal("INDEPENDENT"),
          evidence: locators,
        }),
      ]),
    )
    .min(1)
    .max(64),
});
export const captureProcessingSnapshotSchema = z.strictObject({
  version: z.literal(1),
  accountId: uuid,
  batchId: uuid,
  jobId: uuid,
  manifestVersion: revision,
  manifestSha256: sha256Schema,
  assessmentRevision: revision,
  inputs: z
    .array(
      z.strictObject({
        inputId: uuid,
        observedRevision: revision,
        acquisition,
        processing,
        bindings: z.array(binding).max(64),
      }),
    )
    .min(1)
    .max(64),
  findings: z.array(finding).max(64),
  // Retained caller-owned history, not new decisions or a Review writer.
  decisions: z
    .array(
      z.strictObject({
        id: uuid,
        accountId: uuid,
        candidateId: uuid,
        proposalSha256: sha256Schema,
        decisionSha256: sha256Schema,
        revision,
      }),
    )
    .max(64),
  historicalEvidence: z
    .array(
      z.strictObject({
        accountId: uuid,
        batchId: uuid,
        runId: uuid,
        runGeneration: revision,
        pins: z.array(flightInputSchema).min(1).max(64),
      }),
    )
    .max(64),
});
const requestSchema = z.strictObject({
  manifest: captureIntakeManifestSchema,
  snapshot: captureProcessingSnapshotSchema,
  current: z.strictObject({
    accountId: uuid,
    batchId: uuid,
    jobId: uuid,
    manifestVersion: revision,
    manifestSha256: sha256Schema,
    assessmentRevision: revision,
    snapshotSha256: sha256Schema,
    inputRevisions: z
      .array(z.strictObject({ inputId: uuid, revision }))
      .min(1)
      .max(64),
  }),
});
const reason = z.enum([
  "ACQUISITION_FAILED",
  "ACQUISITION_PENDING",
  "ACQUISITION_UNKNOWN",
  "PROCESSING_FAILED",
  "UNSUPPORTED",
  "DEFERRED",
  "PROCESSING_PENDING",
  "PROCESSING_UNKNOWN",
  "DEPENDENCY_UNKNOWN",
  "HUMAN_DECISION_CONFLICT",
]);
export const captureBatchAssessmentSchema = z.strictObject({
  version: z.literal(1),
  accountId: uuid,
  batchId: uuid,
  jobId: uuid,
  manifestVersion: revision,
  manifestSha256: sha256Schema,
  assessmentRevision: revision,
  snapshotSha256: sha256Schema,
  barrier: z.enum(["PENDING", "ASSESSED_READ_ONLY"]),
  reasons: z.array(z.strictObject({ inputId: uuid, reason })).max(64),
  coverage: captureProcessingSnapshotSchema.shape.inputs,
  findings: z
    .array(
      z.strictObject({
        id: uuid,
        candidate,
        evidence: locators,
        dependencyState: z.enum(["SUPPORTED_READ_ONLY", "BLOCKED"]),
        reasons: z.array(reason).max(10),
        provisionalReview: z.enum(["AVAILABLE_READ_ONLY", "UNAVAILABLE"]),
        decisionIds: z.array(uuid).max(64),
        matureActionableAttention: z.literal(false),
      }),
    )
    .max(64),
  decisions: captureProcessingSnapshotSchema.shape.decisions,
  historicalEvidence: captureProcessingSnapshotSchema.shape.historicalEvidence,
  preparation: z.literal("NOT_AUTHORIZED"),
  domainAdmission: z.literal("NOT_AUTHORIZED"),
});
export type CaptureIntakeManifest = z.infer<typeof captureIntakeManifestSchema>;
export type CaptureProcessingSnapshot = z.infer<typeof captureProcessingSnapshotSchema>;
export type CaptureBatchAssessment = z.infer<typeof captureBatchAssessmentSchema>;
type Input = CaptureProcessingSnapshot["inputs"][number];
const json = (v: unknown) => canonicalEventJson(v as Json);
function fail(code: string): never {
  throw new Error(code);
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) fail("C4A_DUPLICATE_MAPPING");
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function inputReason(input: Input): z.infer<typeof reason> | null {
  if (input.acquisition.state !== "ACCEPTED")
    return `ACQUISITION_${input.acquisition.state}`;
  switch (input.processing) {
    case "FAILED":
      return "PROCESSING_FAILED";
    case "PENDING":
      return "PROCESSING_PENDING";
    case "UNKNOWN":
      return "PROCESSING_UNKNOWN";
    case "UNSUPPORTED":
      return "UNSUPPORTED";
    case "DEFERRED":
      return "DEFERRED";
    default:
      return null;
  }
}

/** Strict JSON-text entrypoint with pure async hashing, same seam as CP13B.
 * Caller supplies exact current
 * contract pins; this performs no current repository/authorization lookup. */
export async function assessCaptureBatch(
  raw: unknown,
  sha256: ImportHash,
): Promise<CaptureBatchAssessment> {
  // R2: accept wire data only, not caller objects. Portable JS cannot identify a
  // transparent Proxy without platform-specific inspection. Do not inspect/coerce it.
  if (typeof raw !== "string") fail("C4A_RAW_INPUT_INVALID");
  if (new TextEncoder().encode(raw).byteLength > BATCH_ASSESSMENT_LIMITS.bytes)
    fail("C4A_RESOURCE_LIMIT");
  let decoded: Json;
  try {
    decoded = parseEventJson(raw, BATCH_ASSESSMENT_LIMITS.bytes);
  } catch {
    fail("C4A_RAW_INPUT_INVALID");
  }
  // Established lossless JSON grammar rejects duplicate keys before Zod/hashing.
  const { manifest, snapshot, current } = freeze(requestSchema.parse(decoded));
  if (
    new TextEncoder().encode(json({ manifest, snapshot, current })).byteLength >
    BATCH_ASSESSMENT_LIMITS.bytes
  )
    fail("C4A_RESOURCE_LIMIT");
  if (manifest.batchId === manifest.jobId) fail("C4A_IDENTITY_ALIAS");
  unique(manifest.inputs.map((i) => i.inputId));
  unique(manifest.inputs.map((i) => i.replayKey));
  if (
    manifest.inputs.some(
      (i, at) =>
        i.ordinal !== at ||
        (i.continuesFromInputId !== null &&
          manifest.inputs.some((x) => x.inputId === i.continuesFromInputId)),
    )
  )
    fail("C4A_ROSTER_INVALID");
  if ([snapshot.accountId, current.accountId].some((id) => id !== manifest.accountId))
    fail("C4A_ACCOUNT_MISMATCH");
  if (
    [snapshot.batchId, current.batchId].some((id) => id !== manifest.batchId) ||
    [snapshot.jobId, current.jobId].some((id) => id !== manifest.jobId)
  )
    fail("C4A_BATCH_MISMATCH");
  if (
    snapshot.manifestVersion !== manifest.manifestVersion ||
    current.manifestVersion !== manifest.manifestVersion ||
    snapshot.assessmentRevision !== current.assessmentRevision
  )
    fail("C4A_STALE_REVISION");
  const roster = new Set(manifest.inputs.map((i) => i.inputId));
  const cover = (ids: string[]) => {
    unique(ids);
    if (ids.length !== roster.size || ids.some((id) => !roster.has(id)))
      fail("C4A_COVERAGE_INVALID");
  };
  cover(snapshot.inputs.map((i) => i.inputId));
  cover(current.inputRevisions.map((i) => i.inputId));
  const inputs = new Map(snapshot.inputs.map((i) => [i.inputId, i]));
  for (const pin of current.inputRevisions)
    if (inputs.get(pin.inputId)!.observedRevision !== pin.revision)
      fail("C4A_STALE_REVISION");
  const bindings = snapshot.inputs.flatMap((i) => i.bindings);
  if (bindings.length > BATCH_ASSESSMENT_LIMITS.bindings) fail("C4A_RESOURCE_LIMIT");
  unique(bindings.map((b) => b.pin.id));
  unique(
    snapshot.inputs.flatMap((i) =>
      i.acquisition.state === "ACCEPTED" ? [i.acquisition.original.captureId] : [],
    ),
  );
  const byRun = new Map<string, { generation: number; digest: string }>();
  for (const i of snapshot.inputs) {
    if (i.acquisition.state !== "ACCEPTED") {
      if (i.processing !== "NOT_APPLICABLE" || i.bindings.length)
        fail("C4A_INCONSISTENT_DISPOSITION");
    } else {
      if (
        i.processing === "NOT_APPLICABLE" ||
        (i.processing === "UNDERSTOOD" && !i.bindings.length)
      )
        fail("C4A_INCONSISTENT_DISPOSITION");
      for (const b of i.bindings) {
        if (b.accountId !== manifest.accountId) fail("C4A_ACCOUNT_MISMATCH");
        if (b.batchId !== manifest.batchId) fail("C4A_BATCH_MISMATCH");
        if (b.originalSha256 !== i.acquisition.original.sha256)
          fail("C4A_CONTENT_PIN_MISMATCH");
        const run = byRun.get(b.runId);
        if (
          run &&
          (run.generation !== b.runGeneration || run.digest !== b.runInputSha256)
        )
          fail("C4A_RUN_PIN_MISMATCH");
        byRun.set(b.runId, { generation: b.runGeneration, digest: b.runInputSha256 });
      }
    }
  }
  // Run Input IDs are not C2 Input IDs. Every locator must resolve exact retained
  // mapping and understood support. References alone do not prove semantic meaning.
  function evidence(refs: z.infer<typeof locators>, runId?: string) {
    for (const l of refs) {
      const owners = snapshot.inputs.filter(
        (i) =>
          i.processing === "UNDERSTOOD" &&
          i.bindings.some(
            (b) => b.pin.id === l.input_id && (!runId || b.runId === runId),
          ),
      );
      if (owners.length !== 1) fail("C4A_EVIDENCE_INVALID");
      const pin = owners[0].bindings.find((b) => b.pin.id === l.input_id)!.pin;
      if (
        l.kind === "TEXT_SPAN" &&
        (l.start === null || l.end === null || l.end <= l.start || l.end > pin.byte_count)
      )
        fail("C4A_EVIDENCE_INVALID");
    }
  }
  unique(snapshot.findings.map((f) => f.id));
  const candidates = new Map<string, string>();
  for (const f of snapshot.findings) {
    const prior = candidates.get(f.candidate.id);
    if (prior && prior !== json(f.candidate)) fail("C4A_CANDIDATE_PIN_MISMATCH");
    candidates.set(f.candidate.id, json(f.candidate));
    cover(f.dependencies.map((d) => d.inputId));
    const run = byRun.get(f.candidate.run_id);
    if (!run || run.digest !== f.candidate.input_sha256) fail("C4A_RUN_PIN_MISMATCH");
    evidence(f.evidence, f.candidate.run_id);
    for (const d of f.dependencies) {
      if (d.relation === "INDEPENDENT") evidence(d.evidence);
      if (
        d.relation !== "DEPENDS_ON" &&
        inputs
          .get(d.inputId)!
          .bindings.some(
            (b) =>
              b.runId === f.candidate.run_id &&
              f.evidence.some((l) => l.input_id === b.pin.id),
          )
      )
        fail("C4A_DEPENDENCY_INCONSISTENT");
    }
  }
  unique(snapshot.decisions.map((d) => d.id));
  for (const d of snapshot.decisions)
    if (d.accountId !== manifest.accountId) fail("C4A_ACCOUNT_MISMATCH");
  for (const h of snapshot.historicalEvidence) {
    if (h.accountId !== manifest.accountId) fail("C4A_ACCOUNT_MISMATCH");
    unique(h.pins.map((p) => p.id));
  }
  if (
    (await importDigest("otr-capture-intake-manifest-v1", manifest as Json, sha256)) !==
      snapshot.manifestSha256 ||
    current.manifestSha256 !== snapshot.manifestSha256
  )
    fail("C4A_MANIFEST_DIGEST_MISMATCH");
  if (
    (await importDigest(
      "otr-capture-processing-snapshot-v1",
      snapshot as Json,
      sha256,
    )) !== current.snapshotSha256
  )
    fail("C4A_SNAPSHOT_DIGEST_MISMATCH");
  const reasons = manifest.inputs.flatMap(({ inputId }) => {
    const why = inputReason(inputs.get(inputId)!);
    return why ? [{ inputId, reason: why }] : [];
  });
  const pending = snapshot.inputs.some(
    (i) =>
      ["PENDING", "UNKNOWN"].includes(i.acquisition.state) ||
      ["PENDING", "UNKNOWN"].includes(i.processing),
  );
  const findings = [...snapshot.findings]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f) => {
      const why = new Set<z.infer<typeof reason>>();
      for (const d of f.dependencies) {
        // Structural locators cannot establish semantic independence (R1).
        if (d.relation !== "DEPENDS_ON") why.add("DEPENDENCY_UNKNOWN");
        if (d.relation === "DEPENDS_ON") {
          const r = inputReason(inputs.get(d.inputId)!);
          if (r) why.add(r);
        }
      }
      const decisions = snapshot.decisions.filter(
        (d) => d.candidateId === f.candidate.id,
      );
      if (decisions.some((d) => d.proposalSha256 !== f.candidate.proposal_sha256))
        why.add("HUMAN_DECISION_CONFLICT");
      return {
        id: f.id,
        candidate: f.candidate,
        evidence: f.evidence,
        dependencyState: why.size ? "BLOCKED" : "SUPPORTED_READ_ONLY",
        reasons: [...why].sort(),
        provisionalReview:
          f.question === "SEMANTIC" && !why.size && !decisions.length
            ? "AVAILABLE_READ_ONLY"
            : "UNAVAILABLE",
        decisionIds: decisions.map((d) => d.id).sort(),
        matureActionableAttention: false,
      };
    });
  return freeze(
    captureBatchAssessmentSchema.parse({
      version: 1,
      accountId: manifest.accountId,
      batchId: manifest.batchId,
      jobId: manifest.jobId,
      manifestVersion: manifest.manifestVersion,
      manifestSha256: snapshot.manifestSha256,
      assessmentRevision: snapshot.assessmentRevision,
      snapshotSha256: current.snapshotSha256,
      barrier: pending ? "PENDING" : "ASSESSED_READ_ONLY",
      reasons,
      coverage: manifest.inputs.map((i) => inputs.get(i.inputId)),
      findings,
      decisions: [...snapshot.decisions].sort((a, b) => a.id.localeCompare(b.id)),
      historicalEvidence: snapshot.historicalEvidence,
      preparation: "NOT_AUTHORIZED",
      domainAdmission: "NOT_AUTHORIZED",
    }),
  );
}
