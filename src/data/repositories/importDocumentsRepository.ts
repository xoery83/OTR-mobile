import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  captureIdSchema,
  captureKindSchema,
  sha256Schema,
} from "@/domain/capture/localCapture";
import type {
  LocalCaptureDatabase,
  createLocalCaptureInboxRepository,
} from "./localCaptureInboxRepository";

const metadataSchema = z.object({
  captureId: captureIdSchema,
  accountId: captureIdSchema,
  tripId: captureIdSchema.nullable(),
  kind: captureKindSchema,
  originalFilename: z.string().nullable(),
  declaredContentType: z.string().nullable(),
  recordedAt: z.iso.datetime(),
  payloadId: captureIdSchema,
  sha256: sha256Schema.nullable(),
  byteCount: z.number().int().positive().nullable(),
  jobId: z.uuid().nullable(),
  batchId: z.uuid().nullable(),
  inputId: z.uuid().nullable(),
});
export type ImportDocument = z.infer<typeof metadataSchema> & {
  custody: "LOCAL_RECORDED" | "UNAVAILABLE";
  cloudOriginal: "NOT_ASSERTED";
  visibility: "PRIVATE";
};
export type ImportDocumentScope = "PERSONAL_INBOX" | "TRIP";
const select = `SELECT c.id AS captureId,c.account_id AS accountId,c.trip_id AS tripId,
 c.kind,c.original_filename AS originalFilename,c.declared_content_type AS declaredContentType,
 c.created_at AS recordedAt,c.payload_id AS payloadId,p.sha256,p.byte_count AS byteCount,
 h.job_id AS jobId,h.batch_id AS batchId,i.input_id AS inputId
 FROM local_capture_inbox c
 LEFT JOIN local_capture_payloads p ON p.account_id=c.account_id AND p.id=c.payload_id
 LEFT JOIN capture_submission_inputs i ON i.account_id=c.account_id AND i.input_id=(
 SELECT si.input_id FROM capture_submission_inputs si WHERE si.account_id=c.account_id
 AND si.capture_id=c.id AND si.acceptance_state='ACCEPTED' AND si.accepted_payload_id=c.payload_id
 AND (p.id IS NULL OR (si.content_sha256=p.sha256 AND si.content_byte_count=p.byte_count))
 ORDER BY si.input_id LIMIT 1)
 LEFT JOIN capture_submission_batches h ON h.account_id=i.account_id AND h.batch_id=i.batch_id`;

// Projection of existing private local originals. No Document/Source/ACL or upload writer.
export function createImportDocumentsRepository(
  db: LocalCaptureDatabase,
  getAccountId: () => Promise<string>,
  captures: Pick<
    ReturnType<typeof createLocalCaptureInboxRepository>,
    "getForSourceHandoff"
  >,
) {
  async function authorize(context: AccountRequestContext, scope: ImportDocumentScope) {
    z.enum(["PERSONAL_INBOX", "TRIP"]).parse(scope);
    await assertAccountRequestContext(context, getAccountId);
    if (scope === "TRIP") {
      z.uuid().parse(context.tripId);
      const actor = await db.getFirstAsync(
        "SELECT 1 FROM ledger_actor_context WHERE user_id=? AND journey_id=?",
        context.accountId,
        context.tripId,
      );
      if (!actor) throw Error("DOCUMENTS_TRIP_ACCESS");
      await assertAccountRequestContext(context, getAccountId);
    }
  }
  const scopedWhere = (scope: ImportDocumentScope) =>
    scope === "TRIP" ? "c.trip_id=?" : "c.trip_id IS NULL";
  const params = (context: AccountRequestContext, scope: ImportDocumentScope) =>
    scope === "TRIP" ? [context.accountId, context.tripId] : [context.accountId];
  function project(
    raw: unknown,
    context: AccountRequestContext,
    scope: ImportDocumentScope,
  ): ImportDocument {
    const row = metadataSchema.parse(raw);
    if (
      row.accountId !== context.accountId ||
      row.tripId !== (scope === "TRIP" ? context.tripId : null)
    )
      throw Error("DOCUMENTS_SCOPE_MISMATCH");
    return {
      ...row,
      custody: row.sha256 && row.byteCount ? "LOCAL_RECORDED" : "UNAVAILABLE",
      cloudOriginal: "NOT_ASSERTED",
      visibility: "PRIVATE",
    };
  }
  async function read(
    context: AccountRequestContext,
    scope: ImportDocumentScope,
    captureId: string,
  ) {
    captureIdSchema.parse(captureId);
    await authorize(context, scope);
    const row = await db.getFirstAsync(
      `${select} WHERE c.account_id=? AND ${scopedWhere(scope)} AND c.id=?`,
      ...params(context, scope),
      captureId,
    );
    if (!row) throw Error("DOCUMENTS_NOT_FOUND");
    const document = project(row, context, scope);
    await authorize(context, scope);
    return document;
  }
  return {
    read,
    async list(
      context: AccountRequestContext,
      scope: ImportDocumentScope,
      options: {
        limit?: number;
        before?: { recordedAt: string; captureId: string };
      } = {},
    ) {
      const limit = z
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(options.limit ?? 30);
      const before =
        options.before &&
        z
          .object({ recordedAt: z.iso.datetime(), captureId: captureIdSchema })
          .parse(options.before);
      await authorize(context, scope);
      const rows = await db.getAllAsync(
        `${select} WHERE c.account_id=? AND ${scopedWhere(scope)}
       ${before ? "AND (c.created_at<? OR (c.created_at=? AND c.id<?))" : ""}
       ORDER BY c.created_at DESC,c.id DESC LIMIT ?`,
        ...params(context, scope),
        ...(before ? [before.recordedAt, before.recordedAt, before.captureId] : []),
        limit,
      );
      const documents = rows.map((row) => project(row, context, scope));
      await authorize(context, scope);
      return documents;
    },
    async sourceLinks(
      context: AccountRequestContext,
      scope: ImportDocumentScope,
      captureId: string,
    ) {
      const document = await read(context, scope, captureId);
      const rows = await db.getAllAsync(
        `SELECT DISTINCT b.source_id AS sourceId,b.representation_id AS representationId,b.material_revision AS sourceRevision,b.trip_id AS tripId
       FROM local_capture_source_bindings b JOIN trip_sources s ON s.cache_account_id=b.account_id AND s.trip_id=b.trip_id AND s.id=b.source_id
       JOIN trip_source_representations r ON r.cache_account_id=b.account_id AND r.source_id=b.source_id AND r.id=b.representation_id
       JOIN ledger_actor_context a ON a.user_id=b.account_id AND a.journey_id=b.trip_id
       WHERE b.account_id=? ${scope === "TRIP" ? "AND b.trip_id=?" : ""} AND b.capture_id=? AND b.capture_payload_id=? AND b.state='ADMITTED'
       AND b.material_sha256=? AND b.byte_count=? AND s.acquired_by=b.account_id
       AND s.registration_state='REGISTERED' AND s.lifecycle='ACTIVE' AND s.retention_state='RETAINED' AND s.current_material_revision=b.material_revision
       AND r.registration_state='REGISTERED' AND r.role='ORIGINAL' AND r.retention_state='RETAINED' AND r.introduced_revision=b.material_revision
       AND r.payload_sha256=b.material_sha256 AND r.byte_count=b.byte_count ORDER BY b.source_id,b.representation_id LIMIT 65`,
        context.accountId,
        ...(scope === "TRIP" ? [context.tripId] : []),
        captureId,
        document.payloadId,
        document.sha256,
        document.byteCount,
      );
      if (rows.length > 64) throw Error("DOCUMENTS_SOURCE_LIMIT");
      const links = rows.map((row) =>
        z
          .strictObject({
            sourceId: z.uuid(),
            representationId: z.uuid(),
            sourceRevision: z.number().int().positive(),
            tripId: z.uuid(),
          })
          .parse(row),
      );
      const after = await read(context, scope, captureId);
      if (JSON.stringify(after) !== JSON.stringify(document))
        throw Error("DOCUMENTS_ORIGINAL_CHANGED");
      return links;
    },
    async original(
      context: AccountRequestContext,
      scope: ImportDocumentScope,
      captureId: string,
    ) {
      const before = await read(context, scope, captureId);
      const original = await captures.getForSourceHandoff(captureId);
      const after = await read(context, scope, captureId);
      if (
        JSON.stringify(before) !== JSON.stringify(after) ||
        original.capture.accountId !== context.accountId ||
        original.capture.id !== captureId ||
        original.capture.payloadId !== before.payloadId ||
        original.capture.sha256 !== before.sha256 ||
        original.capture.byteCount !== before.byteCount ||
        original.capture.tripId !== before.tripId
      )
        throw Error("DOCUMENTS_ORIGINAL_CHANGED");
      return { document: after, bytes: original.bytes };
    },
  };
}
