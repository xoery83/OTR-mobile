import { z } from "zod";
import * as f from "./tripCoreV2";
import { corePayloadSchemas, coreVectorEntrySchema } from "./tripCoreV2Commands";
import { coreBoundarySchema } from "./tripCoreV2Temporal";
import { flightCommandLeaves } from "./flightAdmission";
import { flightLocatorSchema } from "./flightImportReview";
import { canonicalCoreJson, parseCoreJson, type Json } from "./tripCoreV2Json";
import type { CoreActor } from "./tripCoreV2Mutation";

const key = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const fieldKey = z.string().regex(/^[A-Za-z0-9._:-]{1,256}$/);
const stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
const unique = <T extends z.ZodType>(s: T, min = 0) =>
  z
    .array(s)
    .min(min)
    .max(64)
    .refine((v) => new Set(v.map((x) => canonicalCoreJson(x as Json))).size === v.length);
const ids = unique(f.coreUuid).refine((v) => v.join() === [...v].sort().join());
const target = z.strictObject({ kind: z.enum(["ITEM", "BOOKING"]), id: f.coreUuid });
const lineage = z.strictObject({
  coverageSha256: f.coreHash,
  resolvedOutputIdentity: key,
  outputPurpose: key,
  assessmentSha256: f.coreHash,
});
const endpoint = z.strictObject({
  airportCode: z.string().regex(/^[A-Z]{3}$/),
  time: coreBoundarySchema.refine(
    (t) =>
      t.instant === null &&
      t.source_instant === null &&
      t.interpretation_key === null &&
      t.interpretation_input_sha256 === null &&
      t.provenance_refs === null &&
      t.civil_resolution === "PENDING",
  ),
});
export const localBookedFlightPayloadSchema = z
  .strictObject({
    qualificationBasis: z.literal("BOOKING_EVIDENCED_ROUTE_TIME"),
    flightNumberLiteral: f
      .coreText(255)
      .refine((v) => !!v.trim())
      .nullable(),
    core: z.strictObject({ title: f.coreText(200).refine((v) => !!v.trim()) }),
    origin: endpoint.refine(
      (v) => v.time.local_date !== null && v.time.local_time !== null,
    ),
    destination: endpoint,
    participation: f.coreParticipationSchema,
    acl: f.coreAclSchema,
  })
  .refine((v) => v.origin.airportCode !== v.destination.airportCode);
export const localPayloadSchemas = {
  CREATE_SPARSE_FLIGHT: corePayloadSchemas.CREATE_SPARSE_FLIGHT,
  QUALIFY_FLIGHT: corePayloadSchemas.QUALIFY_FLIGHT,
  CREATE_BOOKING: corePayloadSchemas.CREATE_BOOKING,
  CREATE_BOOKING_EVIDENCED_FLIGHT_LOCAL: localBookedFlightPayloadSchema,
} as const;
const command = z.enum([
  "CREATE_SPARSE_FLIGHT",
  "QUALIFY_FLIGHT",
  "CREATE_BOOKING",
  "CREATE_BOOKING_EVIDENCED_FLIGHT_LOCAL",
]);
const base = unique(coreVectorEntrySchema, 1);
const operation = {
  slotId: f.coreUuid,
  operationId: f.coreUuid,
  target,
  command,
  baseVector: base,
  reviewedPayload: z.json(),
  intentSha256: f.coreHash,
  lineageAssessment: lineage,
  dependsOn: ids,
};
const manualOutput = z.strictObject({
  ...operation,
  command: z.literal("CREATE_SPARSE_FLIGHT"),
  manualProvenance: z.strictObject({
    kind: z.literal("MANUAL"),
    actorPersonId: f.coreUuid,
    authoredAt: stamp,
  }),
});
export const localMaterialPinSchema = z.strictObject({
  sourceId: f.coreUuid,
  materialRevision: f.coreRevision,
  representationId: f.coreUuid,
  sourceLocalRevision: f.coreRevision,
  captureId: key,
  captureRevision: f.coreRevision,
  batchId: f.coreUuid,
  inputId: f.coreUuid,
  originalSha256: f.coreHash,
  originalByteCount: z.number().int().positive().max(10485760),
  extractionResultDigest: f.coreHash,
  evidenceCatalogDigest: f.coreHash,
});
const fieldEvidence = z.strictObject({
  sourceId: f.coreUuid,
  materialRevision: f.coreRevision,
  representationId: f.coreUuid,
  evidenceId: key,
  fieldKey,
  locator: flightLocatorSchema,
});
export const localSourceCandidateSchema = z
  .strictObject({
    schemaId: z.literal("otr.local-flight-candidate/1"),
    sourceGroupKey: key,
    kind: z.enum(["FLIGHT_SEGMENT", "BOOKING"]),
    itemCandidateIds: ids,
    evidenceSnapshot: z
      .array(
        z.strictObject({
          itemToken: fieldKey,
          ref: fieldEvidence,
          raw: z.string().min(1).max(65536),
          normalizedValue: z.json(),
        }),
      )
      .min(1)
      .max(256),
    evidenceIds: z
      .array(key)
      .min(1)
      .max(256)
      .refine((v) => new Set(v).size === v.length && v.join() === [...v].sort().join()),
  })
  .refine((v) => new TextEncoder().encode(JSON.stringify(v)).byteLength <= 1048576)
  .refine(
    (v) =>
      v.evidenceSnapshot.map((e) => e.ref.evidenceId).join() === v.evidenceIds.join(),
  )
  .refine((v) =>
    v.kind === "FLIGHT_SEGMENT"
      ? v.itemCandidateIds.length === 0
      : v.itemCandidateIds.length > 0,
  );
export const localReviewDecisionSchema = z.strictObject({
  confirmationId: f.coreUuid,
  confirmationKey: key,
  decisionVersion: z.literal(1),
  decisionRevision: f.coreRevision,
  actorAccountId: f.coreUuid,
  reviewedRunId: f.coreUuid,
  reviewedRunRevision: f.coreRevision,
  inputDigest: f.coreHash,
  candidateSetDigest: f.coreHash,
  selectionsDigest: f.coreHash,
  decisionSha256: f.coreHash,
});
const proof = z.strictObject({
  schemaId: z.literal("otr.trip.local-reviewed-proof/1"),
  profile: z.enum([
    "FLIGHT_SPARSE_ANCHOR_LOCAL/1",
    "FLIGHT_PHYSICAL_LOCAL/1",
    "COMMERCIAL_BOOKING_LOCAL/1",
    "BOOKING_EVIDENCED_ROUTE_TIME_LOCAL/1",
  ]),
  accountId: f.coreUuid,
  tripId: f.coreUuid,
  sourceMaterialPinsDigest: f.coreHash,
  runId: f.coreUuid,
  candidateId: f.coreUuid,
  candidateSha256: f.coreHash,
  confirmationId: f.coreUuid,
  decisionRevision: f.coreRevision,
  decisionSha256: f.coreHash,
  slotId: f.coreUuid,
  target,
  operationId: f.coreUuid,
  command,
  intentSha256: f.coreHash,
  outputPurposeDigest: f.coreHash,
  selectedSupportDigest: f.coreHash,
  lineageAssessmentDigest: f.coreHash,
  proofSha256: f.coreHash,
});
const sourceOutput = z.strictObject({
  ...operation,
  slotKey: key,
  candidateId: f.coreUuid,
  candidateSha256: f.coreHash,
  disposition: z.enum(["CREATE", "UPDATE"]),
  selectedFields: unique(fieldKey, 1),
  fieldEvidence: z.array(fieldEvidence).min(1).max(256),
  outputPurpose: key,
  proof,
});
const deferredOutput = z.strictObject({
  slotId: f.coreUuid,
  slotKey: key,
  candidateId: f.coreUuid,
  candidateSha256: f.coreHash,
  disposition: z.enum(["REJECT", "DEFER"]),
  target: z.null(),
  operationId: z.null(),
  baseVector: z.null(),
  command: z.null(),
  reviewedPayload: z.null(),
  selectedFields: unique(fieldKey),
  fieldEvidence: z.array(fieldEvidence).max(256),
  outputPurpose: z.null(),
  lineageAssessment: lineage,
  dependsOn: ids,
  intentSha256: z.null(),
  proof: z.null(),
});
export const localManualEnvelopeSchema = z.strictObject({
  schemaId: z.literal("otr.trip.local-manual-commit/1"),
  authority: z.literal("LOCAL_MANUAL"),
  commitId: f.coreUuid,
  accountId: f.coreUuid,
  tripId: f.coreUuid,
  actorPersonId: f.coreUuid,
  outputs: z.array(manualOutput).min(1).max(64),
  envelopeSha256: f.coreHash,
});
export const localSourceEnvelopeSchema = z.strictObject({
  schemaId: z.literal("otr.trip.local-reviewed-import/1"),
  authority: z.literal("LOCAL_REVIEWED_SOURCE"),
  commitId: f.coreUuid,
  accountId: f.coreUuid,
  tripId: f.coreUuid,
  materials: unique(localMaterialPinSchema, 1),
  run: z.strictObject({
    runId: f.coreUuid,
    runRevision: f.coreRevision,
    inputDigest: f.coreHash,
    candidateSetDigest: f.coreHash,
    assemblyContractVersion: key,
  }),
  review: localReviewDecisionSchema,
  slots: z
    .array(z.union([sourceOutput, deferredOutput]))
    .min(1)
    .max(64),
  envelopeSha256: f.coreHash,
});
export const localCommitEnvelopeSchema = z.discriminatedUnion("authority", [
  localManualEnvelopeSchema,
  localSourceEnvelopeSchema,
]);
export type LocalCommitEnvelope = z.infer<typeof localCommitEnvelopeSchema>;
export type LocalMaterialPin = z.infer<typeof localMaterialPinSchema>;
export type LocalReviewDecision = z.infer<typeof localReviewDecisionSchema>;
export type LocalExecutableOutput =
  z.infer<typeof manualOutput> | z.infer<typeof sourceOutput>;
export type LocalHash = (bytes: Uint8Array) => Promise<string>;
export async function localHash(domain: string, body: unknown, hash: LocalHash) {
  return f.coreHash.parse(
    await hash(new TextEncoder().encode(canonicalCoreJson([domain, body] as Json))),
  );
}
const withoutDigest = (value: Record<string, unknown>, field: string) =>
  Object.fromEntries(Object.entries(value).filter(([k]) => k !== field));
export function parseLocalCommitEnvelope(input: unknown): LocalCommitEnvelope {
  const text = typeof input === "string" ? input : canonicalCoreJson(input as Json);
  const env = localCommitEnvelopeSchema.parse(parseCoreJson(text, 1048576));
  if (new TextEncoder().encode(canonicalCoreJson(env as Json)).length > 1048576)
    throw new Error("LOCAL_ENVELOPE_TOO_LARGE");
  const outputs = env.authority === "LOCAL_MANUAL" ? env.outputs : env.slots;
  if (
    new Set(outputs.map((x) => x.slotId)).size !== outputs.length ||
    new Set(outputs.flatMap((x) => (x.operationId ? [x.operationId] : []))).size !==
      outputs.filter((x) => x.operationId).length
  )
    throw new Error("LOCAL_IDENTITY_REUSED");
  const byId = new Map(outputs.map((x) => [x.slotId, x]));
  const active = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new Error("LOCAL_DEPENDENCY_CYCLE");
    if (done.has(id)) return;
    const x = byId.get(id);
    if (!x) throw new Error("LOCAL_DEPENDENCY_MISSING");
    active.add(id);
    for (const d of x.dependsOn) visit(d);
    active.delete(id);
    done.add(id);
  };
  for (const x of outputs) visit(x.slotId);
  for (const x of outputs) {
    if (!x.command) continue;
    localPayloadSchemas[x.command].parse(x.reviewedPayload);
    if ((x.command === "CREATE_BOOKING" ? "BOOKING" : "ITEM") !== x.target.kind)
      throw new Error("LOCAL_TARGET_MISMATCH");
    if (!x.baseVector.some((v) => v.kind === x.target.kind && v.id === x.target.id))
      throw new Error("INVALID_BASE_VECTOR");
    if (
      x.baseVector.some(
        (v) => v.kind === "SOURCE" || v.kind === "EXPENSE_LINK" || v.kind === "ORDER",
      )
    )
      throw new Error("LOCAL_BASE_UNSUPPORTED");
    const keys = x.baseVector.map((v) => `${v.kind}:${v.id}`);
    if (new Set(keys).size !== keys.length || keys.join() !== [...keys].sort().join())
      throw new Error("INVALID_BASE_VECTOR");
    if (
      x.command !== "QUALIFY_FLIGHT" &&
      x.baseVector.find((v) => v.kind === x.target.kind && v.id === x.target.id)!
        .revision !== null
    )
      throw new Error("LOCAL_CREATE_BASE_REQUIRED");
    if (
      env.authority === "LOCAL_REVIEWED_SOURCE" &&
      "disposition" in x &&
      x.disposition !== (x.command === "QUALIFY_FLIGHT" ? "UPDATE" : "CREATE")
    )
      throw new Error("LOCAL_UPDATE_UNSUPPORTED");
  }
  return env;
}
export function localIntentBody(env: LocalCommitEnvelope, x: LocalExecutableOutput) {
  return {
    accountId: env.accountId,
    tripId: env.tripId,
    target: x.target,
    operationId: x.operationId,
    command: x.command,
    baseVector: x.baseVector,
    reviewedPayload: x.reviewedPayload,
    selectedFields: "selectedFields" in x ? x.selectedFields : [],
    dependsOn: x.dependsOn,
  };
}
export function localReviewSelections(env: z.infer<typeof localSourceEnvelopeSchema>) {
  // Persist every immutable slot/target/candidate binding for cold recovery.
  // Proof is derived from this saved selection + decision, so including it
  // here would create decision -> proof -> decision hash recursion.
  return env.slots.map(({ proof: _derivedProof, ...selection }) => selection);
}
export type RetainedLocalAuthorityState = {
  actor: CoreActor;
  coverageSha256: string;
  // These are owning repository observations, never caller-provided flags.
  claims: ReadonlyMap<
    string,
    { resolvedOutputIdentity: string; outputPurpose: string; assessmentSha256: string }
  >;
  source?: {
    materials: {
      pin: LocalMaterialPin;
      bytes: Uint8Array;
      extractionResult: Json;
      evidenceCatalog: Json;
    }[];
    run: z.infer<typeof localSourceEnvelopeSchema>["run"];
    candidates: ReadonlyMap<string, { sha256: string; body: Json }>;
    relationships: ReadonlyMap<string, readonly string[]>;
    decision: LocalReviewDecision;
    evidence: ReadonlyMap<
      string,
      { ref: z.infer<typeof fieldEvidence>; normalizedValue: Json }
    >;
  };
};
export type LocalMutationCommand = {
  operationId: string;
  tripId: string;
  target: z.infer<typeof target>;
  baseVector: z.infer<typeof base>;
  command: z.infer<typeof command>;
  payload: Json;
  admission: {
    mode: "MANUAL" | "LOCAL_REVIEWED_SOURCE";
    sourceIntentId: null;
    policyVersion: null;
  };
};
export type VerifiedLocalOperation = Readonly<{
  actor: CoreActor;
  command: LocalMutationCommand;
  authority: LocalCommitEnvelope["authority"];
  output: LocalExecutableOutput;
  claimKey: string;
  commitId: string;
}>;
const verified = new WeakSet<object>();
export const isVerifiedLocalOperation = (
  value: unknown,
): value is VerifiedLocalOperation =>
  typeof value === "object" && value !== null && verified.has(value);
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const equal = (a: unknown, b: unknown) =>
  canonicalCoreJson(a as Json) === canonicalCoreJson(b as Json);
function deny(): never {
  throw new Error("LOCAL_AUTHORITY_INVALID");
}
export async function verifyLocalCommit(
  env: LocalCommitEnvelope,
  state: RetainedLocalAuthorityState,
  hash: LocalHash,
): Promise<VerifiedLocalOperation[]> {
  env = deepFreeze(parseLocalCommitEnvelope(env));
  state = structuredClone(state);
  const actor = state.actor;
  if (
    !actor.active ||
    !actor.personId ||
    !actor.personIds.includes(actor.personId) ||
    actor.accountId !== env.accountId ||
    actor.tripId !== env.tripId
  )
    deny();
  const source = env.authority === "LOCAL_REVIEWED_SOURCE" ? env : null;
  if (source) {
    const retained = state.source;
    if (
      !retained ||
      !equal(source.run, retained.run) ||
      !equal(source.review, retained.decision)
    )
      deny();
    if (
      source.review.actorAccountId !== env.accountId ||
      source.review.reviewedRunId !== source.run.runId ||
      source.review.reviewedRunRevision !== source.run.runRevision ||
      source.review.inputDigest !== source.run.inputDigest ||
      source.review.candidateSetDigest !== source.run.candidateSetDigest
    )
      deny();
    if (source.materials.length !== retained.materials.length) deny();
    for (const pin of source.materials) {
      const r = retained.materials.find((x) => equal(pin, x.pin));
      if (
        !r ||
        r.bytes.length !== pin.originalByteCount ||
        (await hash(r.bytes)) !== pin.originalSha256
      )
        deny();
      if (
        (await localHash("otr-local-extraction-result-v1", r.extractionResult, hash)) !==
          pin.extractionResultDigest ||
        (await localHash(
          "otr-local-import-evidence-catalog-v1",
          r.evidenceCatalog,
          hash,
        )) !== pin.evidenceCatalogDigest
      )
        deny();
      // The separately loaded evidence map must be the retained catalog, not an unrelated caller map.
      const catalog = z
        .array(z.strictObject({ ref: fieldEvidence, normalizedValue: z.json() }))
        .max(256)
        .parse(r.evidenceCatalog);
      for (const entry of catalog)
        if (!equal(retained.evidence.get(entry.ref.evidenceId), entry)) deny();
      if (
        catalog.some(
          (e) =>
            e.ref.sourceId !== pin.sourceId ||
            e.ref.materialRevision !== pin.materialRevision ||
            e.ref.representationId !== pin.representationId,
        )
      )
        deny();
    }
    if (
      (await localHash(
        "otr-local-import-review-selections-v1",
        localReviewSelections(source),
        hash,
      )) !== source.review.selectionsDigest ||
      (await localHash(
        "otr-local-import-review-v1",
        withoutDigest(source.review, "decisionSha256"),
        hash,
      )) !== source.review.decisionSha256
    )
      deny();
  } else if (env.authority === "LOCAL_MANUAL" && env.actorPersonId !== actor.personId)
    deny();
  const domain = source ? "otr-local-import-envelope-v1" : "otr-local-manual-envelope-v1";
  if (
    (await localHash(domain, withoutDigest(env, "envelopeSha256"), hash)) !==
    env.envelopeSha256
  )
    deny();
  const result: VerifiedLocalOperation[] = [];
  for (const x of source
    ? source.slots
    : (env as z.infer<typeof localManualEnvelopeSchema>).outputs) {
    if (!x.command) continue;
    const assessment = state.claims.get(x.slotId);
    if (
      !assessment ||
      !equal(x.lineageAssessment, { coverageSha256: state.coverageSha256, ...assessment })
    )
      deny();
    if ("manualProvenance" in x && x.manualProvenance.actorPersonId !== actor.personId)
      deny();
    if (
      (await localHash(
        source ? "otr-local-import-intent-v1" : "otr-local-manual-intent-v1",
        localIntentBody(env, x),
        hash,
      )) !== x.intentSha256
    )
      deny();
    if (source && "proof" in x) {
      const retained = state.source!,
        candidate = retained.candidates.get(x.candidateId);
      if (
        !candidate ||
        candidate.sha256 !== x.candidateSha256 ||
        (await localHash("otr-local-import-candidate-v1", candidate.body, hash)) !==
          candidate.sha256
      )
        deny();
      const candidateBody = localSourceCandidateSchema.parse(candidate.body);
      if (
        candidateBody.kind !==
        (x.command === "CREATE_BOOKING" ? "BOOKING" : "FLIGHT_SEGMENT")
      )
        deny();
      for (const entry of candidateBody.evidenceSnapshot)
        if (
          !equal(retained.evidence.get(entry.ref.evidenceId), {
            ref: entry.ref,
            normalizedValue: entry.normalizedValue,
          })
        )
          deny();
      if (x.fieldEvidence.some((r) => !candidateBody.evidenceIds.includes(r.evidenceId)))
        deny();
      if (x.outputPurpose !== x.lineageAssessment.outputPurpose) deny();
      for (const ref of x.fieldEvidence) {
        const r = retained.evidence.get(ref.evidenceId);
        if (
          !r ||
          !retained.materials.some(
            (m) =>
              Array.isArray(m.evidenceCatalog) &&
              m.evidenceCatalog.some((e) => equal(e, r)),
          ) ||
          !equal(r.ref, ref) ||
          !source.materials.some(
            (m) =>
              m.sourceId === ref.sourceId &&
              m.materialRevision === ref.materialRevision &&
              m.representationId === ref.representationId &&
              m.inputId === ref.locator.input_id,
          ) ||
          !x.selectedFields.includes(ref.fieldKey)
        )
          deny();
      }
      if (x.selectedFields.some((k) => !x.fieldEvidence.some((r) => r.fieldKey === k)))
        deny();
      const expectedProfile = {
        CREATE_SPARSE_FLIGHT: "FLIGHT_SPARSE_ANCHOR_LOCAL/1",
        QUALIFY_FLIGHT: "FLIGHT_PHYSICAL_LOCAL/1",
        CREATE_BOOKING: "COMMERCIAL_BOOKING_LOCAL/1",
        CREATE_BOOKING_EVIDENCED_FLIGHT_LOCAL: "BOOKING_EVIDENCED_ROUTE_TIME_LOCAL/1",
      }[x.command];
      const p = x.proof;
      if (
        p.profile !== expectedProfile ||
        p.accountId !== env.accountId ||
        p.tripId !== env.tripId ||
        p.runId !== source.run.runId ||
        p.candidateId !== x.candidateId ||
        p.candidateSha256 !== x.candidateSha256 ||
        p.confirmationId !== source.review.confirmationId ||
        p.decisionRevision !== source.review.decisionRevision ||
        p.decisionSha256 !== source.review.decisionSha256 ||
        p.slotId !== x.slotId ||
        !equal(p.target, x.target) ||
        p.operationId !== x.operationId ||
        p.command !== x.command ||
        p.intentSha256 !== x.intentSha256
      )
        deny();
      if (
        p.sourceMaterialPinsDigest !==
          (await localHash(
            "otr-local-import-material-pins-v1",
            source.materials,
            hash,
          )) ||
        p.outputPurposeDigest !==
          (await localHash(
            "otr-local-import-output-purpose-v1",
            x.outputPurpose,
            hash,
          )) ||
        p.lineageAssessmentDigest !==
          (await localHash("otr-local-import-lineage-v1", x.lineageAssessment, hash)) ||
        p.selectedSupportDigest !==
          (await localHash(
            "otr-local-import-support-v1",
            x.fieldEvidence.map((r) => retained.evidence.get(r.evidenceId)),
            hash,
          )) ||
        p.proofSha256 !==
          (await localHash(
            "otr-local-import-proof-v1",
            withoutDigest(p, "proofSha256"),
            hash,
          ))
      )
        deny();
      const support = (field: string, value: unknown) =>
        x.fieldEvidence.some(
          (r) =>
            r.fieldKey === field &&
            equal(retained.evidence.get(r.evidenceId)!.normalizedValue, value),
        );
      const payload = localPayloadSchemas[x.command].parse(x.reviewedPayload);
      if (x.command === "CREATE_BOOKING_EVIDENCED_FLIGHT_LOCAL") {
        const b = localBookedFlightPayloadSchema.parse(payload);
        for (const [field, value] of [
          ["booking.assertion", "CONFIRMED"],
          ["origin.airport", b.origin.airportCode],
          ["destination.airport", b.destination.airportCode],
          ["origin.local_date", b.origin.time.local_date],
          ["origin.local_time", b.origin.time.local_time],
        ] as const)
          if (!support(field, value)) deny();
        for (const side of ["origin", "destination"] as const)
          for (const field of ["zone_id", "supplied_offset_seconds"] as const)
            if (
              b[side].time[field] !== null &&
              !support(`${side}.${field}`, b[side].time[field])
            )
              deny();
        if (b.flightNumberLiteral !== null && !support("service", b.flightNumberLiteral))
          deny();
        if (
          !x.fieldEvidence.some(
            (r) => r.fieldKey === "occurrence" && r.locator.kind !== "WHOLE",
          )
        )
          deny();
        if (
          b.destination.time.local_date !== null &&
          !support("destination.local_date", b.destination.time.local_date)
        )
          deny();
        if (
          b.destination.time.local_time !== null &&
          !support("destination.local_time", b.destination.time.local_time)
        )
          deny();
      } else if (x.command === "CREATE_SPARSE_FLIGHT") {
        const b = corePayloadSchemas.CREATE_SPARSE_FLIGHT.parse(payload);
        if (
          !support("service", b.flightNumberLiteral) ||
          !support("origin.local_date", b.departureDate)
        )
          deny();
      } else if (x.command === "QUALIFY_FLIGHT") {
        const b = corePayloadSchemas.QUALIFY_FLIGHT.parse(payload);
        if (
          b.origin.time.local_date === null ||
          b.origin.time.quality !== "EXACT" ||
          b.origin.time.source_instant === null
        )
          deny();
        const leaves = flightCommandLeaves(b);
        for (const [field, value] of Object.entries(leaves)) {
          if (
            !support(field, value) ||
            b.proofs[field]?.kind !== "RETAINED" ||
            b.proofs[field]?.ref !== `local-import/field-evidence/${x.slotId}/${field}`
          )
            deny();
        }
        if (Object.keys(b.proofs).some((k) => !Object.hasOwn(leaves, k))) deny();
        // Airport and complete location facts are also bound, including nullable values.
        for (const side of ["origin", "destination"] as const)
          if (!support(`${side}.location`, b[side].location)) deny();
      } else if (x.command === "CREATE_BOOKING") {
        const b = corePayloadSchemas.CREATE_BOOKING.parse(payload);
        if (
          !b.fields.provider?.trim() ||
          !b.fields.confirmation_code?.trim() ||
          !support("booking.assertion", "CONFIRMED")
        )
          deny();
        for (const [field, value] of Object.entries(b.fields))
          if (!support(`booking.fields.${field}`, value)) deny();
        for (const value of b.observations)
          if (!support(`booking.observation.${value.observation_id}`, value)) deny();
        if (b.entitlementIds.length || b.documentIds.length) deny();
        const siblings = retained.relationships.get(x.candidateId);
        if (!siblings || !equal(siblings, candidateBody.itemCandidateIds)) deny();
        for (const itemId of b.itemIds) {
          const sibling = source.slots.find(
            (s) =>
              s.target?.kind === "ITEM" && s.target.id === itemId && s.command !== null,
          );
          if (
            !sibling ||
            !siblings.includes(sibling.candidateId) ||
            !x.dependsOn.includes(sibling.slotId)
          )
            deny();
          const related = retained.candidates.get(sibling.candidateId);
          if (!related) deny();
          const group = localSourceCandidateSchema.parse(related.body);
          if (
            group.kind !== "FLIGHT_SEGMENT" ||
            group.sourceGroupKey !== candidateBody.sourceGroupKey
          )
            deny();
        }
      }
    }
    const claimKey = await localHash(
      "otr-local-output-claim-v1",
      {
        schemaId: "otr.local-output-claim/1",
        accountId: env.accountId,
        tripId: env.tripId,
        resolvedOutputIdentity: assessment.resolvedOutputIdentity,
        targetKind: x.target.kind,
        outputPurpose: assessment.outputPurpose,
      },
      hash,
    );
    const op: VerifiedLocalOperation = deepFreeze({
      actor: structuredClone(actor),
      command: {
        operationId: x.operationId,
        tripId: env.tripId,
        target: x.target,
        baseVector: x.baseVector,
        command: x.command,
        payload: x.reviewedPayload,
        admission: {
          mode: source ? ("LOCAL_REVIEWED_SOURCE" as const) : ("MANUAL" as const),
          sourceIntentId: null,
          policyVersion: null,
        },
      },
      authority: env.authority,
      output: x,
      claimKey,
      commitId: env.commitId,
    });
    verified.add(op);
    result.push(op);
  }
  if (!result.length) throw new Error("LOCAL_NO_ELIGIBLE_OUTPUT");
  return result;
}
const receiptBase = {
  schemaId: z.literal("otr.trip.local-core-receipt/1"),
  commitId: f.coreUuid,
  slotId: f.coreUuid,
  operationId: f.coreUuid,
  target,
  localRevision: f.coreRevision,
  intentSha256: f.coreHash,
  resultDigest: f.coreHash,
  receiptSha256: f.coreHash,
};
export const localCoreReceiptSchema = z.discriminatedUnion("authority", [
  z.strictObject({ ...receiptBase, authority: z.literal("LOCAL_MANUAL") }),
  z.strictObject({
    ...receiptBase,
    authority: z.literal("LOCAL_REVIEWED_SOURCE"),
    proofSha256: f.coreHash,
  }),
]);
export type LocalCoreReceipt = z.infer<typeof localCoreReceiptSchema>;
