import { z } from "zod";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { createCaptureBatchAssessmentAdapter } from "@/data/repositories/captureBatchAssessmentAdapter";
import {
  createCaptureBatchAssessmentObservationRepository,
  type AssessmentHead,
} from "@/data/repositories/captureBatchAssessmentObservationRepository";
import { createCaptureSubmissionTransactionStore } from "@/data/repositories/captureSubmissionRepository";
import type { LocalCaptureDependencies } from "@/data/repositories/localCaptureInboxRepository";
import type { createTripImportAdmissionRepository } from "@/data/repositories/tripImportAdmissionRepository";
import type { PublicationMembershipDatabase } from "@/data/repositories/tripPublicationMembershipRepository";
import {
  assessCaptureBatch,
  type CaptureBatchAssessment,
} from "@/domain/capture/batchAssessment";
import {
  AssessmentObservationError,
  observationJson,
  validateAssessmentObservation,
  type AssessmentObservationBody,
} from "@/domain/capture/batchAssessmentObservation";
import { LocalCaptureError } from "@/domain/capture/localCapture";
import { importDigest } from "@/domain/trip/flightImportReview";
import type { Json } from "@/domain/trip/eventIntentJson";

const receiptSchema = z
  .strictObject({
    accountId: z.uuid(),
    batchId: z.uuid(),
    jobId: z.uuid(),
    revision: z.number().int().positive().safe(),
    bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine((r) => r.batchId !== r.jobId);
export type AssessmentReceipt = Readonly<z.infer<typeof receiptSchema>>;
type Summary = Readonly<{
  barrier: CaptureBatchAssessment["barrier"];
  inputCount: number;
  findingCount: number;
  blockedFindingCount: number;
  supportedFindingCount: number;
  matureActionableAttention: false;
  preparation: "NOT_AUTHORIZED";
  domainAdmission: "NOT_AUTHORIZED";
}>;
type Historical = {
  historicalOnly: true;
  currentAuthority: "NOT_ASSERTED";
};
export type AssessmentProjection = Historical &
  (
    | { status: "OBSERVED"; receipt: AssessmentReceipt; summary: Summary }
    | { status: "UNASSESSED" | "INTEGRITY_BLOCKED" | "UNAVAILABLE"; receipt: null }
  );
export type ComposerResult =
  | (Historical & {
      status: "APPENDED" | "EXACT_REPLAY" | "UNCHANGED";
      receipt: AssessmentReceipt;
      summary: Summary;
    })
  | {
      status: "REASSESS_REQUIRED";
      code:
        | "C4A_STALE_REVISION"
        | "STALE_OBSERVATION"
        | "HEAD_CONFLICT"
        | "REVISION_CONFLICT";
    }
  | {
      status: "REJECTED";
      code:
        "INVALID_INPUT" | "C4A_RESOURCE_LIMIT" | "RECORD_TOO_LARGE" | "OWNING_ADMISSION";
    }
  | { status: "INTEGRITY_BLOCKED" | "UNAVAILABLE" | "CANCELED" }
  | { status: "OUTCOME_UNKNOWN"; receipt: AssessmentReceipt };
export type RecoveryResult =
  | (Historical & { status: "FOUND"; receipt: AssessmentReceipt; summary: Summary })
  | { status: "ABSENT" | "REVISION_CONFLICT" | "INTEGRITY_BLOCKED" | "UNAVAILABLE" };
const historical = { historicalOnly: true, currentAuthority: "NOT_ASSERTED" } as const;
const summary = (e: CaptureBatchAssessment): Summary => ({
  barrier: e.barrier,
  inputCount: e.coverage.length,
  findingCount: e.findings.length,
  blockedFindingCount: e.findings.filter((f) => f.dependencyState === "BLOCKED").length,
  supportedFindingCount: e.findings.filter(
    (f) => f.dependencyState === "SUPPORTED_READ_ONLY",
  ).length,
  matureActionableAttention: false,
  preparation: "NOT_AUTHORIZED",
  domainAdmission: "NOT_AUTHORIZED",
});
const logicalContent = (
  body: Pick<
    AssessmentObservationBody,
    "c2RequestSha256" | "c2ManifestSha256" | "contextSha256" | "manifest" | "snapshot"
  >,
) =>
  observationJson([
    body.c2RequestSha256,
    body.c2ManifestSha256,
    body.contextSha256,
    body.manifest,
    { ...body.snapshot, assessmentRevision: 1 },
  ]);
const receiptFor = (
  body: AssessmentObservationBody,
  bodySha256: string,
): AssessmentReceipt =>
  Object.freeze({
    accountId: body.manifest.accountId,
    batchId: body.manifest.batchId,
    jobId: body.manifest.jobId,
    revision: body.snapshot.assessmentRevision,
    bodySha256,
  });

/** Explicit dormant local composition; no runtime factory, Transport or lifecycle owner. */
export function createCaptureBatchAssessmentComposer(
  database: PublicationMembershipDatabase,
  importStore: ReturnType<typeof createTripImportAdmissionRepository>["transactionStore"],
  getAccountId: () => Promise<string>,
  dependencies: LocalCaptureDependencies,
) {
  if (importStore.database !== database)
    throw new Error("PUBLICATION_MEMBERSHIP_DATABASE_MISMATCH");
  const adapter = createCaptureBatchAssessmentAdapter(
    database,
    importStore,
    getAccountId,
    dependencies,
  );
  const c2 = createCaptureSubmissionTransactionStore(database, dependencies);
  const history = createCaptureBatchAssessmentObservationRepository(
    database,
    getAccountId,
    {
      ...dependencies,
      assertCurrentOwningData: async () => {
        throw new Error("C4_COMPOSER_ADMISSION_REQUIRED");
      },
    },
  );
  // Transient exact attempts only; restart rediscovers immutable history, never resumes unidentified intent.
  const uncertain = new Map<
    string,
    { receipt: AssessmentReceipt; raw: string; head: AssessmentHead }
  >();
  const key = (r: AssessmentReceipt) => observationJson(r);
  async function admit(context: AccountRequestContext) {
    if (context.tripId !== "") throw new Error("C4_COMPOSER_ACCOUNT_SCOPE");
    await assertAccountRequestContext(context, getAccountId);
    const tables = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(trip_source_runs)",
    );
    if (
      !tables.some((t) => t.name === "publication_membership") ||
      !(await database.getFirstAsync(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='capture_batch_assessment_observations'",
      ))
    )
      throw new Error("C4_COMPOSER_SCHEMA_UNAVAILABLE");
    await assertAccountRequestContext(context, getAccountId);
  }
  async function finish<T>(
    context: AccountRequestContext,
    value: T,
    signal?: AbortSignal,
  ) {
    await assertAccountRequestContext(context, getAccountId);
    assertAccountRequestGeneration(context);
    if (signal?.aborted) throw new Error("C4_COMPOSER_CANCELED");
    return value;
  }
  async function job(context: AccountRequestContext, jobId: string, batchId?: string) {
    z.uuid().parse(jobId);
    return withAccountApplyGate(async () => {
      let value!: Awaited<ReturnType<typeof c2.load>>;
      await database.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, getAccountId);
        if (batchId !== undefined) {
          const header = await database.getFirstAsync<{ jobId: string }>(
            "SELECT job_id AS jobId FROM capture_submission_batches WHERE account_id=? AND batch_id=?",
            context.accountId,
            batchId,
          );
          if (!header || header.jobId !== jobId)
            throw new Error("C4_COMPOSER_RECEIPT_OWNERSHIP");
        }
        value = await c2.load(context, jobId);
        await assertAccountRequestContext(context, getAccountId);
      });
      return finish(context, value);
    });
  }
  async function recover(
    context: AccountRequestContext,
    rawReceipt: AssessmentReceipt,
  ): Promise<RecoveryResult> {
    context = Object.freeze({ ...context });
    try {
      await admit(context);
      const receipt = Object.freeze(receiptSchema.parse(rawReceipt));
      if (receipt.accountId !== context.accountId) return { status: "UNAVAILABLE" };
      await job(context, receipt.jobId, receipt.batchId);
      const exact = await history.readExact(context, receipt.batchId, receipt.revision);
      let result: RecoveryResult;
      if (exact.status === "FOUND") {
        if (exact.body.manifest.jobId !== receipt.jobId) return { status: "UNAVAILABLE" };
        result =
          exact.bodySha256 !== receipt.bodySha256
            ? { status: "REVISION_CONFLICT" }
            : exact.chainStatus === "INTEGRITY_BLOCKED"
              ? { status: "INTEGRITY_BLOCKED" }
              : {
                  status: "FOUND",
                  ...historical,
                  receipt,
                  summary: summary(exact.body.envelope),
                };
      } else result = { status: exact.status };
      result = await finish(context, result);
      if (["FOUND", "ABSENT", "REVISION_CONFLICT"].includes(result.status))
        uncertain.delete(key(receipt));
      return result;
    } catch (error) {
      if (error instanceof TypeError || error instanceof ReferenceError) throw error;
      return { status: "UNAVAILABLE" };
    }
  }
  return {
    recover,
    async readAssessment(
      context: AccountRequestContext,
      jobId: string,
    ): Promise<AssessmentProjection> {
      context = Object.freeze({ ...context });
      try {
        await admit(context);
        const owned = await job(context, jobId);
        const head = await history.readHead(context, owned.batch.batchId);
        if (head.status === "EMPTY")
          return await finish(context, {
            status: "UNASSESSED",
            receipt: null,
            ...historical,
          } as const);
        if (head.status !== "HEALTHY")
          return await finish(context, {
            status: head.status,
            receipt: null,
            ...historical,
          } as const);
        const exact = await history.readExact(
          context,
          owned.batch.batchId,
          head.head.revision,
        );
        if (exact.status !== "FOUND" || exact.bodySha256 !== head.head.bodySha256)
          return await finish(context, {
            status:
              exact.status === "INTEGRITY_BLOCKED" ? "INTEGRITY_BLOCKED" : "UNAVAILABLE",
            receipt: null,
            ...historical,
          } as const);
        return await finish(
          context,
          exact.chainStatus === "INTEGRITY_BLOCKED"
            ? ({ status: "INTEGRITY_BLOCKED", receipt: null, ...historical } as const)
            : ({
                status: "OBSERVED",
                ...historical,
                receipt: receiptFor(exact.body, exact.bodySha256),
                summary: summary(exact.body.envelope),
              } as const),
        );
      } catch (error) {
        if (error instanceof TypeError || error instanceof ReferenceError) throw error;
        return {
          status:
            error instanceof LocalCaptureError && error.code === "INTEGRITY"
              ? "INTEGRITY_BLOCKED"
              : "UNAVAILABLE",
          receipt: null,
          ...historical,
        };
      }
    },
    async assess(
      context: AccountRequestContext,
      jobId: string,
      signal?: AbortSignal,
    ): Promise<ComposerResult> {
      context = Object.freeze({ ...context });
      let attempted:
        { receipt: AssessmentReceipt; raw: string; head: AssessmentHead } | undefined;
      let appendStarted = false;
      try {
        z.uuid().parse(jobId);
        await admit(context);
        const active = () => {
          assertAccountRequestGeneration(context);
          if (signal?.aborted) throw new Error("C4_COMPOSER_CANCELED");
        };
        active();
        const unresolved = [...uncertain.values()].find(
          (a) => a.receipt.accountId === context.accountId && a.receipt.jobId === jobId,
        );
        if (unresolved)
          return await finish(context, {
            status: "OUTCOME_UNKNOWN",
            receipt: unresolved.receipt,
          } as const);
        const observed = await adapter.observeForComposer(context, jobId);
        active();
        const head = await history.readHead(context, observed.manifest.batchId);
        if (head.status !== "HEALTHY" && head.status !== "EMPTY")
          return await finish(context, { status: head.status } as const, signal);
        const content = {
          c2RequestSha256: observed.c2.requestSha256,
          c2ManifestSha256: observed.c2.manifestSha256,
          contextSha256: observed.manifest.contextSha256,
          manifest: observed.manifest,
          snapshot: observed.snapshot,
        };
        if (head.status === "HEALTHY") {
          const latest = await history.readExact(
            context,
            observed.manifest.batchId,
            head.head.revision,
          );
          if (
            latest.status !== "FOUND" ||
            latest.chainStatus !== "HEALTHY" ||
            latest.bodySha256 !== head.head.bodySha256
          )
            return await finish(
              context,
              {
                status:
                  latest.status === "INTEGRITY_BLOCKED" ||
                  (latest.status === "FOUND" &&
                    latest.chainStatus === "INTEGRITY_BLOCKED")
                    ? "INTEGRITY_BLOCKED"
                    : "UNAVAILABLE",
              } as const,
              signal,
            );
          if (logicalContent(content) === logicalContent(latest.body))
            return await finish(
              context,
              {
                status: "UNCHANGED",
                ...historical,
                receipt: receiptFor(latest.body, latest.bodySha256),
                summary: summary(latest.body.envelope),
              } as const,
              signal,
            );
        }
        if (head.head.revision >= Number.MAX_SAFE_INTEGER)
          return { status: "REASSESS_REQUIRED", code: "HEAD_CONFLICT" };
        const snapshot = {
          ...observed.snapshot,
          assessmentRevision: head.head.revision + 1,
        };
        const snapshotSha256 = await importDigest(
          "otr-capture-processing-snapshot-v1",
          snapshot as Json,
          dependencies.sha256,
        );
        const envelope = await assessCaptureBatch(
          observationJson({
            manifest: observed.manifest,
            snapshot,
            current: {
              accountId: context.accountId,
              batchId: observed.manifest.batchId,
              jobId,
              manifestVersion: observed.manifest.manifestVersion,
              manifestSha256: snapshot.manifestSha256,
              assessmentRevision: snapshot.assessmentRevision,
              snapshotSha256,
              inputRevisions: snapshot.inputs.map((i) => ({
                inputId: i.inputId,
                revision: i.observedRevision,
              })),
            },
          }),
          dependencies.sha256,
        );
        const raw = observationJson({
          version: 1,
          ...content,
          snapshot,
          envelope,
          parentBodySha256: head.head.bodySha256,
        });
        const verified = await validateAssessmentObservation(raw, dependencies.sha256);
        attempted = {
          receipt: receiptFor(verified.body, verified.bodySha256),
          raw,
          head: head.head,
        };
        await assertAccountRequestContext(context, getAccountId);
        active();
        const repo = createCaptureBatchAssessmentObservationRepository(
          database,
          getAccountId,
          {
            ...dependencies,
            assertCurrentOwningData: (c, body) =>
              adapter.assertCurrentForAppend(c, observed.seal, body),
            assertAppendActive: () => {
              active();
              if (
                [...uncertain.values()].some(
                  (a) =>
                    a.receipt.accountId === context.accountId &&
                    a.receipt.jobId === jobId,
                )
              )
                throw new Error("C4_COMPOSER_UNRESOLVED");
            },
          },
        );
        appendStarted = true;
        const appended = await repo.append(context, attempted.head, attempted.raw);
        if (appended.status === "OUTCOME_UNKNOWN") {
          uncertain.set(key(attempted.receipt), attempted);
          return { status: "OUTCOME_UNKNOWN", receipt: attempted.receipt };
        }
        if (appended.status === "APPENDED" || appended.status === "EXACT_REPLAY") {
          // Disclosure failure after possible COMMIT retains the exact attempt for recovery.
          if (
            appended.status === "EXACT_REPLAY" &&
            appended.chainStatus === "INTEGRITY_BLOCKED"
          )
            return await finish(
              context,
              { status: "INTEGRITY_BLOCKED" } as const,
              signal,
            );
          return await finish(
            context,
            {
              status: appended.status,
              ...historical,
              receipt: attempted.receipt,
              summary: summary(verified.body.envelope),
            } as const,
            signal,
          );
        }
        appendStarted = false;
        if (
          ["HEAD_CONFLICT", "REVISION_CONFLICT", "STALE_OBSERVATION"].includes(
            appended.status,
          )
        )
          return await finish(
            context,
            {
              status: "REASSESS_REQUIRED",
              code: appended.status as
                "HEAD_CONFLICT" | "REVISION_CONFLICT" | "STALE_OBSERVATION",
            } as const,
            signal,
          );
        if (appended.status === "INTEGRITY_BLOCKED" || appended.status === "INTEGRITY")
          return await finish(context, { status: "INTEGRITY_BLOCKED" } as const, signal);
        return await finish(
          context,
          {
            status: "REJECTED",
            code:
              appended.status === "RECORD_TOO_LARGE"
                ? "RECORD_TOO_LARGE"
                : "OWNING_ADMISSION",
          } as const,
          signal,
        );
      } catch (error) {
        if (appendStarted && attempted) {
          uncertain.set(key(attempted.receipt), attempted);
          return { status: "OUTCOME_UNKNOWN", receipt: attempted.receipt };
        }
        if (error instanceof TypeError || error instanceof ReferenceError) throw error;
        if (error instanceof LocalCaptureError && error.code === "INTEGRITY")
          return { status: "INTEGRITY_BLOCKED" };
        if (signal?.aborted) return { status: "CANCELED" };
        if (error instanceof z.ZodError)
          return { status: "REJECTED", code: "INVALID_INPUT" };
        if (error instanceof AssessmentObservationError)
          return error.code === "RECORD_TOO_LARGE"
            ? { status: "REJECTED", code: "RECORD_TOO_LARGE" }
            : { status: "INTEGRITY_BLOCKED" };
        if (error instanceof Error && error.message === "C4A_STALE_REVISION")
          return { status: "REASSESS_REQUIRED", code: "C4A_STALE_REVISION" };
        if (
          error instanceof Error &&
          /^(C4A|PUBLICATION_MEMBERSHIP|IMPORT)_RESOURCE_LIMIT$/.test(error.message)
        )
          return { status: "REJECTED", code: "C4A_RESOURCE_LIMIT" };
        if (
          error instanceof Error &&
          /^(C4A_ADAPTER_|CAPTURE_SOURCE_|INPUT_STALE|IMPORT_TRIP_ACCESS|PUBLICATION_MEMBERSHIP_INTEGRITY)/.test(
            error.message,
          )
        )
          return { status: "REJECTED", code: "OWNING_ADMISSION" };
        return { status: "UNAVAILABLE" };
      }
    },
  };
}
