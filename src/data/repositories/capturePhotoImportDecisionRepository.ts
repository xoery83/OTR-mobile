import { z } from "zod";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  createLocalCaptureTransactionStore,
  type LocalCaptureDatabase,
  type LocalCaptureDependencies,
} from "./localCaptureInboxRepository";
import { createCaptureSubmissionTransactionStore } from "./captureSubmissionRepository";
import {
  photoImportDecisionSchema,
  photoImportPinSchema,
  resolvePhotoImportDecision,
  type PhotoImportDecision,
} from "@/domain/capture/photoImportRelevance";

const fail = (code: string): never => {
  throw new Error(code);
};
type Row = {
  decision_revision: number;
  revision_type: string;
  body_json: string;
  recorded_at: string;
};
export type StoredPhotoImportDecision = {
  revision: number;
  decision: PhotoImportDecision;
  recordedAt: string;
  status: "CURRENT" | "ORIGINAL_CHANGED";
};

// Local Capture child state only. No default factory, queue, Source or paid-call authority.
export function createCapturePhotoImportDecisionRepository(
  database: LocalCaptureDatabase,
  getAccountId: () => Promise<string>,
  dependencies: LocalCaptureDependencies,
) {
  const submissions = createCaptureSubmissionTransactionStore(database, dependencies);
  const captures = createLocalCaptureTransactionStore(database, dependencies);
  async function scoped<T>(
    context: AccountRequestContext,
    signal: AbortSignal | undefined,
    work: () => Promise<T>,
  ) {
    const current = async () => {
      await assertAccountRequestContext(context, getAccountId);
      if (signal?.aborted) fail("PHOTO_IMPORT_CANCELLED");
    };
    await current();
    return withAccountApplyGate(async () => {
      let result!: T;
      await database.withTransactionAsync(async () => {
        await current();
        result = await work();
        await current();
      });
      await current();
      return result;
    });
  }
  async function pin(context: AccountRequestContext, jobId: string, inputId: string) {
    const job = await submissions.load(context, jobId);
    const input = job.inputs.find((i) => i.id === inputId);
    if (
      !input ||
      input.kind !== "IMAGE" ||
      input.state !== "ACCEPTED" ||
      !input.captureId
    )
      return fail("PHOTO_IMPORT_INPUT_UNAVAILABLE");
    const { capture } = await captures.load(context.accountId, input.captureId);
    if (
      capture.kind !== "IMAGE" ||
      capture.payloadId !== input.payloadId ||
      capture.sha256 !== input.contentSha256 ||
      capture.byteCount !== input.contentByteCount ||
      capture.declaredContentType !== input.declaredContentType
    )
      return fail("PHOTO_IMPORT_ORIGINAL_CHANGED");
    return photoImportPinSchema.parse({
      accountId: context.accountId,
      batchId: job.batch.batchId,
      inputId,
      ordinal: input.ordinal,
      captureId: capture.id,
      captureRevision: capture.revision,
      payloadId: capture.payloadId,
      sha256: capture.sha256,
      byteCount: capture.byteCount,
      mediaType: input.declaredContentType,
    });
  }
  async function stored(context: AccountRequestContext, inputId: string) {
    const row = await database.getFirstAsync<Row>(
      "SELECT decision_revision,typeof(decision_revision) AS revision_type,body_json,recorded_at FROM capture_photo_import_decisions WHERE account_id=? AND input_id=?",
      context.accountId,
      inputId,
    );
    if (!row) return null;
    try {
      const decision = photoImportDecisionSchema.parse(JSON.parse(row.body_json));
      if (
        row.revision_type !== "integer" ||
        !Number.isSafeInteger(row.decision_revision) ||
        row.decision_revision < 1 ||
        decision.pin.accountId !== context.accountId ||
        decision.pin.inputId !== inputId ||
        JSON.stringify(decision) !== row.body_json ||
        new TextEncoder().encode(row.body_json).length > 4096
      )
        fail("PHOTO_IMPORT_DECISION_INTEGRITY");
      return {
        revision: row.decision_revision,
        decision,
        recordedAt: z.iso.datetime().parse(row.recorded_at),
      };
    } catch {
      return fail("PHOTO_IMPORT_DECISION_INTEGRITY");
    }
  }
  return {
    async read(
      context: AccountRequestContext,
      jobId: string,
      inputId: string,
    ): Promise<StoredPhotoImportDecision | null> {
      return scoped(context, undefined, async () => {
        const current = await pin(context, jobId, inputId);
        const prior = await stored(context, inputId);
        if (!prior) return null;
        let status: StoredPhotoImportDecision["status"] = "CURRENT";
        try {
          resolvePhotoImportDecision(prior.decision, current);
        } catch {
          status = "ORIGINAL_CHANGED";
        }
        return { ...prior, status };
      });
    },
    async save(
      context: AccountRequestContext,
      jobId: string,
      expectedRevision: number,
      raw: unknown,
      signal?: AbortSignal,
    ): Promise<StoredPhotoImportDecision> {
      if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 ||
        expectedRevision >= Number.MAX_SAFE_INTEGER
      )
        return fail("PHOTO_IMPORT_DECISION_CONFLICT");
      const decision = photoImportDecisionSchema.parse(raw);
      if (decision.pin.accountId !== context.accountId)
        return fail("PHOTO_IMPORT_DECISION_SCOPE");
      const body = JSON.stringify(decision);
      if (new TextEncoder().encode(body).length > 4096)
        return fail("PHOTO_IMPORT_DECISION_LIMIT");
      return scoped(context, signal, async () => {
        const current = await pin(context, jobId, decision.pin.inputId);
        resolvePhotoImportDecision(decision, current);
        const prior = await stored(context, decision.pin.inputId);
        if (prior && JSON.stringify(prior.decision) === body)
          return { ...prior, status: "CURRENT" };
        if ((prior?.revision ?? 0) !== expectedRevision)
          return fail("PHOTO_IMPORT_DECISION_CONFLICT");
        if (
          prior &&
          prior.decision.choice !== "UNDECIDED" &&
          decision.choice === "UNDECIDED"
        ) {
          // Re-screening never overwrites explicit intent or silently binds it to another original.
          resolvePhotoImportDecision(prior.decision, current);
          return { ...prior, status: "CURRENT" };
        }
        const revision = expectedRevision + 1;
        const recordedAt = z.iso.datetime().parse(dependencies.now());
        const write = prior
          ? await database.runAsync(
              "UPDATE capture_photo_import_decisions SET decision_revision=CAST(? AS INTEGER),body_json=?,recorded_at=? WHERE account_id=? AND input_id=? AND decision_revision=?",
              revision,
              body,
              recordedAt,
              context.accountId,
              decision.pin.inputId,
              expectedRevision,
            )
          : await database.runAsync(
              "INSERT INTO capture_photo_import_decisions(account_id,input_id,decision_revision,body_json,recorded_at) VALUES(?,?,CAST(? AS INTEGER),?,?)",
              context.accountId,
              decision.pin.inputId,
              revision,
              body,
              recordedAt,
            );
        if (write.changes !== 1) return fail("PHOTO_IMPORT_DECISION_CONFLICT");
        return { revision, decision, recordedAt, status: "CURRENT" };
      });
    },
  };
}
