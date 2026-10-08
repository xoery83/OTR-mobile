import { z } from "zod";
import {
  captureIntakeManifestSchema,
  captureProcessingSnapshotSchema,
  captureBatchAssessmentSchema,
  assessCaptureBatch,
} from "./batchAssessment";
import { sha256Schema } from "./localCapture";
import { canonicalEventJson, parseEventJson, type Json } from "../trip/eventIntentJson";
import { importDigest, type ImportHash } from "../trip/flightImportReview";

export const ASSESSMENT_BODY_BYTES = 2_097_152;
export class AssessmentObservationError extends Error {
  constructor(
    readonly code:
      | "RECORD_TOO_LARGE"
      | "INTEGRITY"
      | "HEAD_CONFLICT"
      | "REVISION_CONFLICT"
      | "STALE_OBSERVATION",
  ) {
    super(code);
  }
}
export const assessmentObservationBodySchema = z.strictObject({
  version: z.literal(1),
  c2RequestSha256: sha256Schema,
  c2ManifestSha256: sha256Schema,
  contextSha256: sha256Schema,
  parentBodySha256: sha256Schema.nullable(),
  manifest: captureIntakeManifestSchema,
  snapshot: captureProcessingSnapshotSchema,
  envelope: captureBatchAssessmentSchema,
});
export type AssessmentObservationBody = z.infer<typeof assessmentObservationBodySchema>;
export const observationJson = (value: unknown) => canonicalEventJson(value as Json);
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Validates exact immutable wire bytes; owning-data freshness is repository-owned. */
export async function validateAssessmentObservation(raw: string, sha256: ImportHash) {
  if (typeof raw !== "string") throw new AssessmentObservationError("INTEGRITY");
  if (new TextEncoder().encode(raw).byteLength > ASSESSMENT_BODY_BYTES)
    throw new AssessmentObservationError("RECORD_TOO_LARGE");
  try {
    const body = freeze(
      assessmentObservationBodySchema.parse(parseEventJson(raw, ASSESSMENT_BODY_BYTES)),
    );
    if (
      observationJson(body) !== raw ||
      body.contextSha256 !== body.manifest.contextSha256 ||
      (body.snapshot.assessmentRevision === 1) !== (body.parentBodySha256 === null)
    )
      throw new AssessmentObservationError("INTEGRITY");
    const { manifest, snapshot } = body;
    const snapshotSha256 = await importDigest(
      "otr-capture-processing-snapshot-v1",
      snapshot as Json,
      sha256,
    );
    const envelope = await assessCaptureBatch(
      observationJson({
        manifest,
        snapshot,
        current: {
          accountId: manifest.accountId,
          batchId: manifest.batchId,
          jobId: manifest.jobId,
          manifestVersion: manifest.manifestVersion,
          manifestSha256: snapshot.manifestSha256,
          assessmentRevision: snapshot.assessmentRevision,
          snapshotSha256,
          inputRevisions: snapshot.inputs.map((i) => ({
            inputId: i.inputId,
            revision: i.observedRevision,
          })),
        },
      }),
      sha256,
    );
    if (observationJson(envelope) !== observationJson(body.envelope))
      throw new AssessmentObservationError("INTEGRITY");
    return {
      body,
      bodySha256: await importDigest(
        "otr-capture-assessment-observation-v1",
        body as Json,
        sha256,
      ),
    };
  } catch (error) {
    if (error instanceof AssessmentObservationError) throw error;
    throw new AssessmentObservationError("INTEGRITY");
  }
}
