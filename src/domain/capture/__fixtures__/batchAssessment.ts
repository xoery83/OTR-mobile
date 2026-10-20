// Synthetic C2 contract observations, not an installed C2 repository or publication.
import { createHash } from "node:crypto";
import { importDigest, type ImportHash } from "../../trip/flightImportReview";
import type { Json } from "../../trip/eventIntentJson";
import type {
  CaptureIntakeManifest,
  CaptureProcessingSnapshot,
} from "../batchAssessment";

export const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export const hash = (n: number) => n.toString(16).padStart(64, "0");
export const sha256: ImportHash = async (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const locator = (inputId: string) => ({
  input_id: inputId,
  kind: "TEXT_SPAN" as const,
  page: null,
  start: 0,
  end: 8,
  region: null,
});
export async function fixture() {
  const manifest: CaptureIntakeManifest = {
    version: 1,
    accountId: id(1),
    batchId: id(2),
    jobId: id(3),
    submissionKey: id(4),
    contextSnapshotId: id(5),
    contextSha256: hash(5),
    tripPriorId: id(6),
    manifestVersion: 1,
    inputs: [10, 11].map((n, ordinal) => ({
      inputId: id(n),
      replayKey: id(n + 10),
      ordinal,
      continuesFromInputId: null,
    })),
  };
  const snapshot: CaptureProcessingSnapshot = {
    version: 1,
    accountId: id(1),
    batchId: id(2),
    jobId: id(3),
    manifestVersion: 1,
    manifestSha256: hash(1),
    assessmentRevision: 1,
    inputs: [10, 11].map((n) => ({
      inputId: id(n),
      observedRevision: 1,
      acquisition: {
        state: "ACCEPTED",
        original: {
          captureId: id(n + 20),
          payloadId: id(n + 30),
          revision: 1,
          sha256: hash(n),
          byteCount: 20,
        },
      },
      processing: "UNDERSTOOD",
      bindings: [
        {
          accountId: id(1),
          batchId: id(2),
          runId: id(50),
          runGeneration: 1,
          runInputSha256: hash(50),
          originalSha256: hash(n),
          pin: {
            id: id(n + 100),
            source_id: id(n + 200),
            representation_id: id(n + 300),
            material_revision: 1,
            payload_sha256: hash(n),
            byte_count: 20,
            observed_source_row_revision: 1,
            historical_selection: false,
          },
        },
      ],
    })),
    findings: [60, 61].map((n) => ({
      id: id(n),
      candidate: {
        id: id(n + 100),
        run_id: id(50),
        proposal_sha256: hash(n),
        input_sha256: hash(50),
      },
      evidence: [locator(id(110)), locator(id(111))],
      question: "SEMANTIC",
      dependencies: [10, 11].map((m) => ({ inputId: id(m), relation: "DEPENDS_ON" })),
    })),
    decisions: [],
    historicalEvidence: [],
  };
  return seal({ manifest, snapshot });
}
export async function seal(input: {
  manifest: CaptureIntakeManifest;
  snapshot: CaptureProcessingSnapshot;
}) {
  input.snapshot.manifestSha256 = await importDigest(
    "otr-capture-intake-manifest-v1",
    input.manifest as Json,
    sha256,
  );
  return {
    ...input,
    current: {
      accountId: input.manifest.accountId,
      batchId: input.manifest.batchId,
      jobId: input.manifest.jobId,
      manifestVersion: input.manifest.manifestVersion,
      manifestSha256: input.snapshot.manifestSha256,
      assessmentRevision: input.snapshot.assessmentRevision,
      snapshotSha256: await importDigest(
        "otr-capture-processing-snapshot-v1",
        input.snapshot as Json,
        sha256,
      ),
      inputRevisions: input.snapshot.inputs.map((i) => ({
        inputId: i.inputId,
        revision: i.observedRevision,
      })),
    },
  };
}
