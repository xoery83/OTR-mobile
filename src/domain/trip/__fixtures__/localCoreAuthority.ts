import { createHash, randomUUID } from "node:crypto";
import { coreDateBoundary } from "../tripCoreV2Temporal";
import {
  localHash,
  localIntentBody,
  localReviewSelections,
  type LocalCommitEnvelope,
  type RetainedLocalAuthorityState,
} from "../localCoreAuthority";
import type { Json } from "../tripCoreV2Json";
const testDefaults = () => ({
  participation: { mode: "SELF" as const, people: [] as string[], selfPersonId: null },
  acl: { visibility: "PRIVATE" as const, people: [] as string[] },
});
export const localTestHash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const h = "a".repeat(64);
export const localTestStamp = "2026-10-19T00:00:00.000000Z";
const omit = (obj: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
export async function sealLocalTestEnvelope(
  env: LocalCommitEnvelope,
  state: RetainedLocalAuthorityState,
) {
  const source = env.authority === "LOCAL_REVIEWED_SOURCE";
  const outputs = env.authority === "LOCAL_MANUAL" ? env.outputs : env.slots;
  for (const x of outputs)
    if (x.command)
      x.intentSha256 = await localHash(
        source ? "otr-local-import-intent-v1" : "otr-local-manual-intent-v1",
        localIntentBody(env, x),
        localTestHash,
      );
  if (env.authority === "LOCAL_REVIEWED_SOURCE") {
    env.review.selectionsDigest = await localHash(
      "otr-local-import-review-selections-v1",
      localReviewSelections(env),
      localTestHash,
    );
    env.review.decisionSha256 = await localHash(
      "otr-local-import-review-v1",
      omit(env.review, "decisionSha256"),
      localTestHash,
    );
    state.source!.decision = structuredClone(env.review);
    for (const x of env.slots)
      if (x.command) {
        Object.assign(x.proof, {
          intentSha256: x.intentSha256,
          decisionSha256: env.review.decisionSha256,
          sourceMaterialPinsDigest: await localHash(
            "otr-local-import-material-pins-v1",
            env.materials,
            localTestHash,
          ),
          outputPurposeDigest: await localHash(
            "otr-local-import-output-purpose-v1",
            x.outputPurpose,
            localTestHash,
          ),
          lineageAssessmentDigest: await localHash(
            "otr-local-import-lineage-v1",
            x.lineageAssessment,
            localTestHash,
          ),
          selectedSupportDigest: await localHash(
            "otr-local-import-support-v1",
            x.fieldEvidence.map((r) => state.source!.evidence.get(r.evidenceId)),
            localTestHash,
          ),
        });
        x.proof.proofSha256 = await localHash(
          "otr-local-import-proof-v1",
          omit(x.proof, "proofSha256"),
          localTestHash,
        );
      }
  }
  env.envelopeSha256 = await localHash(
    source ? "otr-local-import-envelope-v1" : "otr-local-manual-envelope-v1",
    omit(env, "envelopeSha256"),
    localTestHash,
  );
  return { env, state };
}
export async function localAuthorityFixture(
  source = false,
  flightNumber: string | null = null,
) {
  const accountId = randomUUID(),
    tripId = randomUUID(),
    personId = randomUUID(),
    slotId = randomUUID(),
    operationId = randomUUID(),
    itemId = randomUUID(),
    commitId = randomUUID();
  const actor = {
    accountId,
    tripId,
    personId,
    personIds: [personId],
    active: true,
    canManageShared: false,
  };
  const lineageAssessment = {
    coverageSha256: h,
    resolvedOutputIdentity: `new-${itemId}`,
    outputPurpose: "FLIGHT",
    assessmentSha256: h,
  };
  const state: RetainedLocalAuthorityState = {
    actor,
    coverageSha256: h,
    claims: new Map([
      [
        slotId,
        {
          resolvedOutputIdentity: lineageAssessment.resolvedOutputIdentity,
          outputPurpose: "FLIGHT",
          assessmentSha256: h,
        },
      ],
    ]),
  };
  const output = {
    slotId,
    operationId,
    target: { kind: "ITEM" as const, id: itemId },
    command: "CREATE_SPARSE_FLIGHT" as const,
    baseVector: [{ kind: "ITEM" as const, id: itemId, revision: null }],
    reviewedPayload: {
      flightNumberLiteral: "NZ5069",
      departureDate: "2026-12-14",
      ...testDefaults(),
    },
    intentSha256: h,
    lineageAssessment,
    dependsOn: [],
  };
  let env: LocalCommitEnvelope = {
    schemaId: "otr.trip.local-manual-commit/1",
    authority: "LOCAL_MANUAL",
    commitId,
    accountId,
    tripId,
    actorPersonId: personId,
    outputs: [
      {
        ...output,
        manualProvenance: {
          kind: "MANUAL",
          actorPersonId: personId,
          authoredAt: localTestStamp,
        },
      },
    ],
    envelopeSha256: h,
  };
  if (source) {
    const sourceId = randomUUID(),
      representationId = randomUUID(),
      inputId = randomUUID(),
      candidateId = randomUUID(),
      runId = randomUUID(),
      confirmationId = randomUUID();
    const bytes = new TextEncoder().encode(
      "Confirmed return Nelson Auckland December 22 11:55 13:25",
    );
    const boundary = (clock: string) => ({
      ...coreDateBoundary("2026-12-22"),
      local_time: clock,
      clock_precision: -1,
      quality: "ESTIMATED" as const,
    });
    const reviewedPayload = {
      qualificationBasis: "BOOKING_EVIDENCED_ROUTE_TIME",
      flightNumberLiteral: flightNumber,
      core: { title: "Nelson to Auckland" },
      origin: { airportCode: "NSN", time: boundary("11:55") },
      destination: { airportCode: "AKL", time: boundary("13:25") },
      ...testDefaults(),
    };
    const values: Record<string, Json> = {
      "booking.assertion": "CONFIRMED",
      "origin.airport": "NSN",
      "destination.airport": "AKL",
      "origin.local_date": "2026-12-22",
      "origin.local_time": "11:55",
      "destination.local_date": "2026-12-22",
      "destination.local_time": "13:25",
      occurrence: "return",
    };
    if (flightNumber !== null) values.service = flightNumber;
    const catalog = Object.entries(values).map(([fieldKey, normalizedValue], i) => ({
      ref: {
        sourceId,
        materialRevision: 1,
        representationId,
        evidenceId: `e${i}`,
        fieldKey,
        locator: {
          input_id: inputId,
          kind: "TEXT_SPAN" as const,
          page: null,
          start: 0,
          end: bytes.length,
          region: null,
        },
      },
      normalizedValue,
    }));
    const pin = {
      sourceId,
      materialRevision: 1,
      representationId,
      sourceLocalRevision: 1,
      captureId: randomUUID(),
      captureRevision: 1,
      batchId: randomUUID(),
      inputId,
      originalSha256: await localTestHash(bytes),
      originalByteCount: bytes.length,
      extractionResultDigest: await localHash(
        "otr-local-extraction-result-v1",
        { text: new TextDecoder().decode(bytes) },
        localTestHash,
      ),
      evidenceCatalogDigest: await localHash(
        "otr-local-import-evidence-catalog-v1",
        catalog,
        localTestHash,
      ),
    };
    const run = {
      runId,
      runRevision: 1,
      inputDigest: h,
      candidateSetDigest: h,
      assemblyContractVersion: "assembly1",
    };
    const review = {
      confirmationId,
      confirmationKey: "review1",
      decisionVersion: 1 as const,
      decisionRevision: 1,
      actorAccountId: accountId,
      reviewedRunId: runId,
      reviewedRunRevision: 1,
      inputDigest: h,
      candidateSetDigest: h,
      selectionsDigest: h,
      decisionSha256: h,
    };
    const candidateBody = {
      schemaId: "otr.local-flight-candidate/1",
      sourceGroupKey: "round-trip",
      kind: "FLIGHT_SEGMENT",
      itemCandidateIds: [],
      evidenceIds: catalog.map((x) => x.ref.evidenceId).sort(),
      evidenceSnapshot: [...catalog]
        .sort((a, b) => a.ref.evidenceId.localeCompare(b.ref.evidenceId))
        .map((entry) => ({
          itemToken: "return-segment",
          ...entry,
          raw: new TextDecoder().decode(bytes),
        })),
    };
    const candidateSha256 = await localHash(
      "otr-local-import-candidate-v1",
      candidateBody,
      localTestHash,
    );
    const command = "CREATE_BOOKING_EVIDENCED_FLIGHT_LOCAL" as const;
    const proof = {
      schemaId: "otr.trip.local-reviewed-proof/1" as const,
      profile: "BOOKING_EVIDENCED_ROUTE_TIME_LOCAL/1" as const,
      accountId,
      tripId,
      sourceMaterialPinsDigest: h,
      runId,
      candidateId,
      candidateSha256,
      confirmationId,
      decisionRevision: 1,
      decisionSha256: h,
      slotId,
      target: output.target,
      operationId,
      command,
      intentSha256: h,
      outputPurposeDigest: h,
      selectedSupportDigest: h,
      lineageAssessmentDigest: h,
      proofSha256: h,
    };
    env = {
      schemaId: "otr.trip.local-reviewed-import/1",
      authority: "LOCAL_REVIEWED_SOURCE",
      commitId,
      accountId,
      tripId,
      materials: [pin],
      run,
      review,
      slots: [
        {
          ...output,
          command,
          reviewedPayload,
          slotKey: "return",
          candidateId,
          candidateSha256,
          disposition: "CREATE",
          selectedFields: Object.keys(values),
          fieldEvidence: catalog.map((x) => x.ref),
          outputPurpose: "FLIGHT",
          proof,
        },
      ],
      envelopeSha256: h,
    };
    state.source = {
      materials: [
        {
          pin,
          bytes,
          extractionResult: { text: new TextDecoder().decode(bytes) },
          evidenceCatalog: catalog,
        },
      ],
      run,
      candidates: new Map([
        [candidateId, { sha256: candidateSha256, body: candidateBody }],
      ]),
      relationships: new Map(),
      decision: review,
      evidence: new Map(catalog.map((x) => [x.ref.evidenceId, x])),
    };
  }
  return sealLocalTestEnvelope(env, state);
}
