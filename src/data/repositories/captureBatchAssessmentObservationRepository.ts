import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { createCaptureSubmissionTransactionStore } from "./captureSubmissionRepository";
import type {
  LocalCaptureDatabase,
  LocalCaptureDependencies,
} from "./localCaptureInboxRepository";
import {
  canonicalSubmission,
  boundedSubmissionJson,
  type SubmissionRequest,
} from "@/domain/capture/captureSubmission";
import { captureIntakeManifestSchema } from "@/domain/capture/batchAssessment";
import {
  AssessmentObservationError,
  validateAssessmentObservation,
  observationJson,
  type AssessmentObservationBody,
} from "@/domain/capture/batchAssessmentObservation";
import { importDigest } from "@/domain/trip/flightImportReview";
import type { Json } from "@/domain/trip/eventIntentJson";
import { LocalCaptureError } from "@/domain/capture/localCapture";

export type AssessmentHead = Readonly<{ revision: number; bodySha256: string | null }>;
type Verified = Awaited<ReturnType<typeof validateAssessmentObservation>>;
type Row = {
  account_id: string;
  batch_id: string;
  job_id: string;
  format_version: number;
  assessment_revision: number;
  c2_manifest_sha256: string;
  c4_manifest_sha256: string;
  snapshot_sha256: string;
  body_sha256: string;
  parent_body_sha256: string | null;
  body_json: string;
  revision_type: string;
  format_type: string;
};
type Chain = {
  status: "EMPTY" | "HEALTHY" | "INTEGRITY_BLOCKED";
  head: AssessmentHead;
  rows: Map<number, Verified>;
};
const select = `SELECT *,typeof(assessment_revision) AS revision_type,typeof(format_version) AS format_type FROM capture_batch_assessment_observations WHERE account_id=? AND batch_id=? ORDER BY assessment_revision`;
const fail = (
  code: ConstructorParameters<typeof AssessmentObservationError>[0],
): never => {
  throw new AssessmentObservationError(code);
};

/** Dormant factory. No default current owning-data validator or runtime composition. */
export function createCaptureBatchAssessmentObservationRepository(
  database: LocalCaptureDatabase,
  getActiveUserId: () => Promise<string>,
  dependencies: LocalCaptureDependencies & {
    assertAppendActive?: () => void;
    assertCurrentOwningData: (
      context: AccountRequestContext,
      body: AssessmentObservationBody,
    ) => Promise<void>;
  },
) {
  const c2 = createCaptureSubmissionTransactionStore(database, dependencies);
  const hashText = (raw: string) => dependencies.sha256(new TextEncoder().encode(raw));
  async function scoped<T>(
    context: AccountRequestContext,
    work: () => Promise<T>,
    beforeCommit?: () => void,
  ) {
    return withAccountApplyGate(async () => {
      let result!: T;
      await database.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, getActiveUserId);
        result = await work();
        await assertAccountRequestContext(context, getActiveUserId);
        beforeCommit?.();
      });
      await assertAccountRequestContext(context, getActiveUserId);
      return result;
    });
  }
  async function header(context: AccountRequestContext, batchId: string) {
    const row = await database.getFirstAsync<{ jobId: string }>(
      "SELECT job_id AS jobId FROM capture_submission_batches WHERE account_id=? AND batch_id=?",
      context.accountId,
      batchId,
    );
    if (!row) return fail("INTEGRITY");
    return (await c2.load(context, row.jobId)).batch;
  }
  async function verifyC2(request: SubmissionRequest, body: AssessmentObservationBody) {
    const contextSha256 = await importDigest(
      "otr-capture-context-v1",
      request.context as Json,
      dependencies.sha256,
    );
    const expected = captureIntakeManifestSchema.parse({
      version: 1,
      accountId: request.accountId,
      batchId: request.batchId,
      jobId: request.jobId,
      submissionKey: request.submissionKey,
      contextSnapshotId: request.context.id,
      contextSha256,
      tripPriorId: request.context.tripPrior?.id ?? null,
      manifestVersion: request.manifestVersion,
      inputs: request.inputs.map((i) => ({
        inputId: i.id,
        replayKey: i.itemKey,
        ordinal: i.ordinal,
        continuesFromInputId: i.continuesFromInputId,
      })),
    });
    if (
      observationJson(expected) !== observationJson(body.manifest) ||
      (await hashText(canonicalSubmission(request))) !== body.c2RequestSha256 ||
      (await hashText(boundedSubmissionJson(request.inputs))) !== body.c2ManifestSha256 ||
      contextSha256 !== body.contextSha256
    )
      fail("INTEGRITY");
  }
  async function chain(context: AccountRequestContext, batchId: string): Promise<Chain> {
    const request = await header(context, batchId);
    const raw = await database.getAllAsync<Row>(select, context.accountId, batchId);
    const rows = new Map<number, Verified>();
    let head: AssessmentHead = { revision: 0, bodySha256: null };
    for (const row of raw) {
      try {
        if (
          row.revision_type !== "integer" ||
          row.format_type !== "integer" ||
          row.format_version !== 1 ||
          row.assessment_revision !== head.revision + 1 ||
          row.parent_body_sha256 !== head.bodySha256
        )
          fail("INTEGRITY");
        const verified = await validateAssessmentObservation(
          row.body_json,
          dependencies.sha256,
        );
        const { body } = verified;
        await verifyC2(request, body);
        if (
          row.account_id !== context.accountId ||
          row.batch_id !== batchId ||
          row.job_id !== body.manifest.jobId ||
          row.assessment_revision !== body.snapshot.assessmentRevision ||
          row.parent_body_sha256 !== body.parentBodySha256 ||
          row.c2_manifest_sha256 !== body.c2ManifestSha256 ||
          row.c4_manifest_sha256 !== body.snapshot.manifestSha256 ||
          row.snapshot_sha256 !== body.envelope.snapshotSha256 ||
          row.body_sha256 !== verified.bodySha256
        )
          fail("INTEGRITY");
        rows.set(row.assessment_revision, verified);
        head = { revision: row.assessment_revision, bodySha256: verified.bodySha256 };
      } catch {
        return { status: "INTEGRITY_BLOCKED", head, rows };
      }
    }
    return { status: rows.size ? "HEALTHY" : "EMPTY", head, rows };
  }
  return {
    async readHead(context: AccountRequestContext, batchId: string) {
      try {
        return await scoped(context, async () => {
          const c = await chain(context, batchId);
          return {
            status: c.status,
            head: c.head,
            // Chain integrity never certifies current owning-data freshness.
            historicalOnly: true as const,
          };
        });
      } catch {
        return { status: "UNAVAILABLE" as const };
      }
    },
    async readExact(context: AccountRequestContext, batchId: string, revision: number) {
      try {
        return await scoped(context, async () => {
          if (!Number.isSafeInteger(revision) || revision < 1) fail("INTEGRITY");
          const c = await chain(context, batchId),
            found = c.rows.get(revision);
          if (found)
            return {
              status: "FOUND" as const,
              ...found,
              chainStatus: c.status,
              historicalOnly: true as const,
            };
          return {
            status:
              c.status === "INTEGRITY_BLOCKED"
                ? ("INTEGRITY_BLOCKED" as const)
                : ("ABSENT" as const),
          };
        });
      } catch {
        return { status: "UNAVAILABLE" as const };
      }
    },
    async append(
      context: AccountRequestContext,
      expectedHead: AssessmentHead,
      raw: string,
    ) {
      try {
        await assertAccountRequestContext(context, getActiveUserId);
        if (
          !Number.isSafeInteger(expectedHead.revision) ||
          expectedHead.revision < 0 ||
          expectedHead.revision >= Number.MAX_SAFE_INTEGER
        )
          fail("HEAD_CONFLICT");
        const proposed = await validateAssessmentObservation(raw, dependencies.sha256);
        const { body } = proposed,
          batchId = body.manifest.batchId;
        if (body.manifest.accountId !== context.accountId) fail("INTEGRITY");
        if (
          body.snapshot.assessmentRevision !== expectedHead.revision + 1 ||
          body.parentBodySha256 !== expectedHead.bodySha256
        )
          fail("HEAD_CONFLICT");
        let isNew = false;
        return await scoped(
          context,
          async () => {
            const c = await chain(context, batchId),
              revision = body.snapshot.assessmentRevision;
            const prior = c.rows.get(revision);
            if (prior) {
              if (
                prior.bodySha256 !== proposed.bodySha256 ||
                observationJson(prior.body) !== raw
              )
                fail("REVISION_CONFLICT");
              return {
                status: "EXACT_REPLAY" as const,
                revision,
                bodySha256: prior.bodySha256,
                chainStatus: c.status,
                historicalOnly: true as const,
              };
            }
            if (c.status === "INTEGRITY_BLOCKED")
              return { status: "INTEGRITY_BLOCKED" as const };
            if (
              c.head.revision !== expectedHead.revision ||
              c.head.bodySha256 !== expectedHead.bodySha256
            )
              fail("HEAD_CONFLICT");
            await verifyC2(await header(context, batchId), body);
            if (typeof dependencies.assertCurrentOwningData !== "function")
              fail("STALE_OBSERVATION");
            try {
              await dependencies.assertCurrentOwningData(context, body);
            } catch {
              fail("STALE_OBSERVATION");
            }
            const current = await c2.load(context, body.manifest.jobId);
            for (const input of body.snapshot.inputs) {
              const owned = current.inputs.find((i) => i.id === input.inputId);
              if (
                !owned ||
                owned.revision !== input.observedRevision ||
                (input.acquisition.state === "ACCEPTED"
                  ? owned.state !== "ACCEPTED" ||
                    owned.captureId !== input.acquisition.original.captureId ||
                    owned.payloadId !== input.acquisition.original.payloadId ||
                    owned.captureRevision !== input.acquisition.original.revision ||
                    owned.contentSha256 !== input.acquisition.original.sha256 ||
                    owned.contentByteCount !== input.acquisition.original.byteCount
                  : owned.state !==
                    (input.acquisition.state === "FAILED" ? "FAILED" : "PENDING"))
              )
                fail("STALE_OBSERVATION");
            }
            await assertAccountRequestContext(context, getActiveUserId);
            dependencies.assertAppendActive?.();
            isNew = true;
            const inserted = await database.runAsync(
              `INSERT INTO capture_batch_assessment_observations(account_id,batch_id,job_id,format_version,assessment_revision,c2_manifest_sha256,c4_manifest_sha256,snapshot_sha256,body_sha256,parent_body_sha256,body_json) VALUES(?,?,?,1,CAST(? AS INTEGER),?,?,?,?,?,?)`,
              context.accountId,
              batchId,
              body.manifest.jobId,
              revision,
              body.c2ManifestSha256,
              body.snapshot.manifestSha256,
              body.envelope.snapshotSha256,
              proposed.bodySha256,
              body.parentBodySha256,
              raw,
            );
            if (inserted.changes !== 1) fail("INTEGRITY");
            const retained = await chain(context, batchId);
            if (
              retained.status !== "HEALTHY" ||
              retained.head.bodySha256 !== proposed.bodySha256
            )
              fail("INTEGRITY");
            return {
              status: "APPENDED" as const,
              revision,
              bodySha256: proposed.bodySha256,
            };
          },
          () => {
            if (isNew) dependencies.assertAppendActive?.();
          },
        );
      } catch (error) {
        if (error instanceof LocalCaptureError && error.code === "INTEGRITY")
          return { status: "INTEGRITY_BLOCKED" as const };
        return {
          status:
            error instanceof AssessmentObservationError
              ? error.code
              : ("OUTCOME_UNKNOWN" as const),
        };
      }
    },
  };
}
