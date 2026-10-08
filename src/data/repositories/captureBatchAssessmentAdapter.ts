import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  captureAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  assessCaptureBatch,
  BATCH_ASSESSMENT_LIMITS,
  captureIntakeManifestSchema,
  captureProcessingSnapshotSchema,
  type CaptureProcessingSnapshot,
} from "@/domain/capture/batchAssessment";
import {
  boundedSubmissionJson,
  canonicalSubmission,
} from "@/domain/capture/captureSubmission";
import type { z } from "zod";
import {
  tripImportSnapshotSchema,
  tripImportCatalogSchemas,
} from "@/data/api/tripImportCatalogContracts";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "@/domain/trip/eventIntentJson";
import { flightInputSchema, importDigest } from "@/domain/trip/flightImportReview";
import { createCaptureSubmissionTransactionStore } from "./captureSubmissionRepository";
import type { LocalCaptureDependencies } from "./localCaptureInboxRepository";
import type { createTripImportAdmissionRepository } from "./tripImportAdmissionRepository";
import {
  createPublicationMembershipTransactionStore,
  type PublicationMembershipDatabase,
} from "./tripPublicationMembershipRepository";

const json = (value: unknown) => canonicalEventJson(value as Json);
const fail = (): never => {
  throw new Error("C4A_ADAPTER_PROVENANCE_INVALID");
};
type Binding = {
  id: string;
  capture_id: string;
  source_id: string;
  trip_id: string;
  material_revision: number;
  representation_id: string;
};
// Dormant, local read only. Membership installation and Transport remain with their owner.
export function createCaptureBatchAssessmentAdapter(
  database: PublicationMembershipDatabase,
  importStore: ReturnType<typeof createTripImportAdmissionRepository>["transactionStore"],
  getAccountId: () => Promise<string>,
  dependencies: LocalCaptureDependencies,
) {
  const { sha256 } = dependencies;
  const c2Store = createCaptureSubmissionTransactionStore(database, dependencies);
  const membershipStore = createPublicationMembershipTransactionStore(
    database,
    importStore,
    getAccountId,
    sha256,
  );
  async function scoped<T>(context: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      let result!: T;
      await database.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, getAccountId);
        result = await work();
        await assertAccountRequestContext(context, getAccountId);
      });
      assertAccountRequestGeneration(context);
      return result;
    });
  }
  async function observe(context: AccountRequestContext, jobId: string) {
    const job = await c2Store.load(context, jobId);
    if (job.inputs.length > BATCH_ASSESSMENT_LIMITS.inputs)
      throw new Error("C4A_RESOURCE_LIMIT");
    const captures = job.inputs.flatMap((i) => (i.captureId ? [i.captureId] : []));
    const bindings = captures.length
      ? await database.getAllAsync<Binding>(
          `SELECT * FROM local_capture_source_bindings WHERE account_id=? AND state='ADMITTED' AND capture_id IN (${captures.map(() => "?").join(",")}) ORDER BY id`,
          context.accountId,
          ...captures,
        )
      : [];
    const runs = new Map<string, string>();
    for (const binding of bindings) {
      const rows = await database.getAllAsync<{ id: string }>(
        `SELECT r.id FROM trip_source_runs r
         WHERE r.cache_account_id=? AND r.trip_id=? AND r.actor_account_id=? AND EXISTS (SELECT 1 FROM json_each(r.scope_source_ids) WHERE value=?) ORDER BY r.id LIMIT 65`,
        context.accountId,
        binding.trip_id,
        context.accountId,
        binding.source_id,
      );
      for (const r of rows) runs.set(r.id, binding.trip_id);
      if (runs.size > BATCH_ASSESSMENT_LIMITS.bindings)
        throw new Error("C4A_RESOURCE_LIMIT");
    }
    const publications = [];
    for (const [runId, tripId] of [...runs].sort(([a], [b]) => a.localeCompare(b))) {
      const scope = { ...context, tripId };
      const publication = await membershipStore.read(scope, runId);
      // The owning readSet contains the validated complete catalog, never caller rows.
      const snapshot = tripImportSnapshotSchema.parse(
        (parseEventJson(publication.readSet, 8388608) as { snapshot: Json }).snapshot,
      ) as z.infer<typeof tripImportSnapshotSchema> & {
        trip_source_representations: z.infer<
          typeof tripImportCatalogSchemas.trip_source_representations
        >[];
        trip_source_inputs: z.infer<typeof tripImportCatalogSchemas.trip_source_inputs>[];
        trip_source_candidates: z.infer<
          typeof tripImportCatalogSchemas.trip_source_candidates
        >[];
      };
      const pins = snapshot.trip_source_inputs
        .filter((i) => i.run_id === runId)
        .map((i) =>
          flightInputSchema.parse(
            Object.fromEntries(
              Object.keys(flightInputSchema.shape).map((k) => [
                k,
                i[k as keyof typeof i],
              ]),
            ),
          ),
        );
      const supports = [];
      for (const pin of pins) {
        const roots = publication.roots[pin.id];
        if (roots.length !== 1) throw new Error("CAPTURE_SOURCE_AMBIGUOUS_ORIGINAL");
        const owners = bindings.filter(
          (b) =>
            b.trip_id === tripId &&
            b.source_id === pin.source_id &&
            b.material_revision <= pin.material_revision &&
            b.representation_id === roots[0],
        );
        if (owners.length !== 1) fail();
        const binding = owners[0];
        const input = job.inputs.find((i) => i.captureId === binding.capture_id);
        if (!input || input.state !== "ACCEPTED") return fail();
        const support = await membershipStore.readCaptureSupport(
          scope,
          runId,
          pin.id,
          binding.id,
        );
        if (support.publication.readSet !== publication.readSet)
          throw new Error("C4A_STALE_REVISION");
        const original = snapshot.trip_source_representations.find(
          (r) => r.id === roots[0],
        )!;
        supports.push({
          inputId: input.id,
          pin,
          original: {
            id: original.id,
            sha256: original.payload_sha256,
            byteCount: original.byte_count,
          },
          captureReadSet: support.captureReadSet,
        });
      }
      publications.push({ runId, tripId, publication, snapshot, supports });
    }
    return { job, bindings, publications };
  }
  return {
    async assess(jobId: string) {
      const context = await captureAccountRequestContext("", getAccountId);
      const observed = await scoped(context, () => observe(context, jobId));
      const { job } = observed;
      const c2 = {
        requestSha256: await sha256(
          new TextEncoder().encode(canonicalSubmission(job.batch)),
        ),
        manifestSha256: await sha256(
          new TextEncoder().encode(boundedSubmissionJson(job.batch.inputs)),
        ),
      };
      const manifest = captureIntakeManifestSchema.parse({
        version: 1,
        accountId: context.accountId,
        batchId: job.batch.batchId,
        jobId: job.batch.jobId,
        submissionKey: job.batch.submissionKey,
        contextSnapshotId: job.batch.context.id,
        contextSha256: await importDigest(
          "otr-capture-context-v1",
          job.batch.context as Json,
          sha256,
        ),
        tripPriorId: job.batch.context.tripPrior?.id ?? null,
        manifestVersion: job.batch.manifestVersion,
        inputs: job.batch.inputs.map((i) => ({
          inputId: i.id,
          replayKey: i.itemKey,
          ordinal: i.ordinal,
          continuesFromInputId: i.continuesFromInputId,
        })),
      });
      const snapshot: CaptureProcessingSnapshot = {
        version: 1,
        accountId: context.accountId,
        batchId: job.batch.batchId,
        jobId,
        manifestVersion: manifest.manifestVersion,
        manifestSha256: await importDigest(
          "otr-capture-intake-manifest-v1",
          manifest as Json,
          sha256,
        ),
        assessmentRevision: 1,
        inputs: job.inputs.map((i) => ({
          inputId: i.id,
          observedRevision: i.revision,
          acquisition:
            i.state === "ACCEPTED"
              ? {
                  state: "ACCEPTED",
                  original: {
                    captureId: i.captureId!,
                    payloadId: i.payloadId!,
                    revision: i.captureRevision!,
                    sha256: i.contentSha256!,
                    byteCount: i.contentByteCount!,
                  },
                }
              : { state: i.pendingReason === "RECOVER_COMMIT" ? "UNKNOWN" : i.state },
          processing: i.state === "ACCEPTED" ? "UNKNOWN" : "NOT_APPLICABLE",
          bindings: [],
        })),
        findings: [],
        decisions: [],
        historicalEvidence: [],
      };
      for (const {
        runId,
        publication,
        snapshot: catalog,
        supports,
      } of observed.publications) {
        const candidates = catalog.trip_source_candidates.filter(
          (c) => c.run_id === runId,
        );
        if (
          snapshot.findings.length + candidates.length >
          BATCH_ASSESSMENT_LIMITS.findings
        )
          throw new Error("C4A_RESOURCE_LIMIT");
        for (const support of supports) {
          const input = snapshot.inputs.find((i) => i.inputId === support.inputId)!;
          if (input.acquisition.state !== "ACCEPTED") return fail();
          input.bindings.push({
            accountId: context.accountId,
            batchId: manifest.batchId,
            runId,
            runGeneration: publication.membership.body.generation,
            runInputSha256: publication.membership.body.input_sha256,
            originalSha256: input.acquisition.original.sha256,
            pin: support.pin,
          });
        }
        for (const candidate of candidates) {
          const fields = Object.values(candidate.proposal!.fields);
          for (const field of fields) {
            if (
              field?.input_ids.some((id) => !supports.some((s) => s.pin.id === id)) ||
              field?.locators?.some((l) => !field.input_ids.includes(l.input_id))
            )
              fail();
          }
          const evidence = [
            ...new Map(
              fields.flatMap((f) => f?.locators ?? []).map((l) => [json(l), l]),
            ).values(),
          ];
          if (!evidence.length) continue;
          for (const support of supports)
            if (evidence.some((l) => l.input_id === support.pin.id))
              snapshot.inputs.find((i) => i.inputId === support.inputId)!.processing =
                "UNDERSTOOD";
          snapshot.findings.push({
            id: candidate.id,
            candidate: {
              id: candidate.id,
              run_id: runId,
              proposal_sha256: candidate.proposal_sha256,
              input_sha256: publication.membership.body.input_sha256,
            },
            evidence,
            question: "NONE",
            dependencies: snapshot.inputs.map((i) => ({
              inputId: i.inputId,
              relation: supports.some(
                (s) =>
                  s.inputId === i.inputId &&
                  evidence.some((l) => l.input_id === s.pin.id),
              )
                ? "DEPENDS_ON"
                : "UNKNOWN",
            })),
          });
        }
      }
      captureProcessingSnapshotSchema.parse(snapshot);
      const request = {
        manifest,
        snapshot,
        current: {
          accountId: context.accountId,
          batchId: manifest.batchId,
          jobId,
          manifestVersion: manifest.manifestVersion,
          manifestSha256: snapshot.manifestSha256,
          assessmentRevision: snapshot.assessmentRevision,
          snapshotSha256: await importDigest(
            "otr-capture-processing-snapshot-v1",
            snapshot as Json,
            sha256,
          ),
          inputRevisions: snapshot.inputs.map((i) => ({
            inputId: i.inputId,
            revision: i.observedRevision,
          })),
        },
      };
      const assessment = await assessCaptureBatch(json(request), sha256);
      // Seal outside the gate, then compare the entire read set at one final admission point.
      const expected = json(observed);
      return scoped(context, async () => {
        if (json(await observe(context, jobId)) !== expected)
          throw new Error("C4A_STALE_REVISION");
        return {
          c2,
          manifest,
          snapshot,
          assessment,
          provenance: observed.publications.flatMap((p) =>
            p.supports.map((s) => ({
              inputId: s.inputId,
              runId: p.runId,
              original: s.original,
              selected: {
                id: s.pin.representation_id,
                sha256: s.pin.payload_sha256,
                byteCount: s.pin.byte_count,
              },
            })),
          ),
        };
      });
    },
  };
}
