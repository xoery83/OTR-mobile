import { CAPTURE_CUSTODY_MAX_BYTES } from "../../src/domain/capture/captureCustody";
import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "../../src/domain/trip/eventIntentJson";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import { verifyUtf8TextFile } from "../../src/domain/capture/utf8TextFile";
import {
  flightTextAcquisitionSchema,
  verifySourceAcquisitionResult,
} from "./flightTextSource";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

const fileAcquisition = flightTextAcquisitionSchema.extend({
  payload: flightTextAcquisitionSchema.shape.payload.extend({
    source_input: flightTextAcquisitionSchema.shape.payload.shape.source_input.extend({
      source_kind: z.literal("FILE"),
      acquisition_channel: z.literal("FILES"),
    }),
    original: flightTextAcquisitionSchema.shape.payload.shape.original.extend({
      original_filename: z.string().min(1).max(255),
      byte_count: z.number().int().min(1).max(262144),
    }),
  }),
});
const pendingPdfAcquisition = fileAcquisition.extend({
  payload: fileAcquisition.shape.payload.extend({
    original: fileAcquisition.shape.payload.shape.original.extend({
      material_kind: z.literal("BINARY"),
      original_filename: z
        .string()
        .min(1)
        .max(255)
        .regex(/\.pdf$/i),
      mime_type: z.literal("application/pdf"),
      encoding: z.null(),
      text_content: z.null(),
      byte_count: z.number().int().positive().max(CAPTURE_CUSTODY_MAX_BYTES),
    }),
  }),
});
const pendingPngAcquisition = pendingPdfAcquisition.extend({
  payload: pendingPdfAcquisition.shape.payload.extend({
    source_input: pendingPdfAcquisition.shape.payload.shape.source_input.extend({
      source_kind: z.literal("IMAGE"),
    }),
    original: pendingPdfAcquisition.shape.payload.shape.original.extend({
      original_filename: z.string().min(1).max(255).nullable(),
      mime_type: z.literal("image/png"),
    }),
  }),
});
export const universalOriginalAcquisitionSchema = z.union([
  flightTextAcquisitionSchema,
  fileAcquisition,
  pendingPdfAcquisition,
  pendingPngAcquisition,
]);
// Explicit optional candidate: no instance is installed by default startup.
export function createUniversalOriginalSourceConnection(
  connection: CorePgConnection,
  hash: ImportHash,
  options: { pendingPdf?: boolean; pendingPng?: boolean } = {},
) {
  async function execute(query: string, params: unknown[]) {
    return connection.withLease(async (lease) => {
      await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      try {
        const result = (await lease.query(query, params)).rows;
        if (result.length !== 1) throw new Error("SOURCE_IO_UNAVAILABLE");
        await lease.query("COMMIT");
        return result[0].result;
      } catch (error) {
        try {
          await lease.query("ROLLBACK");
        } catch {
          lease.retire();
        }
        throw error;
      }
    });
  }
  async function input(actor: string, trip: string, raw: unknown) {
    coreUuid.parse(actor);
    coreUuid.parse(trip);
    const q = universalOriginalAcquisitionSchema.parse(raw);
    if (q.actor_account_id !== actor || q.trip_id !== trip)
      throw new Error("SOURCE_ACCESS_DENIED");
    if (q.payload.original.material_kind === "BINARY") {
      const allowed =
        q.payload.original.mime_type === "image/png"
          ? options.pendingPng === true
          : options.pendingPdf === true;
      if (!allowed) throw Error("UNIVERSAL_SOURCE_SCOPE_CLOSED");
      // Metadata only. Actual bytes must pass the existing Stage/upload/verify/seal path.
      return q;
    }
    const bytes = new TextEncoder().encode(q.payload.original.text_content);
    if (
      bytes.length !== q.payload.original.byte_count ||
      (await hash(bytes)) !== q.payload.original.payload_sha256
    )
      throw new Error("MATERIAL_INTEGRITY_MISMATCH");
    if (q.payload.source_input.source_kind === "FILE")
      verifyUtf8TextFile(bytes, q.payload.original.original_filename, "text/plain");
    return q;
  }
  return {
    async acquire(actor: string, trip: string, raw: unknown) {
      const q = await input(actor, trip, raw);
      const r = (await execute(
        "SELECT public.trip_source_acquire_universal_original($1::uuid,$2) AS result",
        [actor, canonicalEventJson(q as Json)],
      )) as Record<string, Json>;
      await verifySourceAcquisitionResult(
        q,
        r,
        hash,
        q.payload.original.material_kind === "BINARY" ? "PENDING" : "NOT_APPLICABLE",
      );
      return r;
    },
    async lookup(actor: string, trip: string, raw: unknown) {
      const q = await input(actor, trip, raw);
      const r = (await execute(
        "SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
        [actor, canonicalEventJson(q as Json)],
      )) as Record<string, Json> | null;
      if (r !== null)
        await verifySourceAcquisitionResult(
          q,
          r,
          hash,
          q.payload.original.material_kind === "BINARY" ? "PENDING" : "NOT_APPLICABLE",
        );
      return r;
    },
  };
}

export async function universalOriginalSourceBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  connection?: ReturnType<typeof createUniversalOriginalSourceConnection>,
) {
  const reply = (status: number, value: unknown) =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    });
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url);
  const match =
    /^\/v2\/trips\/([^/]+)\/universal-source-originals\/(acquire|result)$/.exec(
      url.pathname,
    );
  if (!match || !coreUuid.safeParse(match[1]).success || url.search)
    return fail(400, "INVALID_SOURCE_COMMAND");
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  try {
    if (!(await canReadTrip(actor, match[1]))) return fail(403, "SOURCE_ACCESS_DENIED");
    if (!connection) return fail(503, "SOURCE_CAPABILITY_CLOSED");
    const boundary = createRequestBoundary(15000, request.signal);
    let value: unknown;
    try {
      value = await readBoundedJson(
        new Response(request.body),
        2097152,
        boundary,
        (raw) => parseEventJson(raw, 2097152),
      );
    } finally {
      boundary.close();
    }
    return reply(
      200,
      match[2] === "acquire"
        ? await connection.acquire(actor, match[1], value)
        : await connection.lookup(actor, match[1], value),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "SOURCE_IO_UNAVAILABLE";
    if (error instanceof RequestBoundaryError)
      return fail(error.code === "BODY_LIMIT" ? 413 : 400, "INVALID_SOURCE_COMMAND");
    if (
      error instanceof z.ZodError ||
      [
        "INVALID_SOURCE_COMMAND",
        "UTF8_TEXT_FILE_UNSUPPORTED",
        "UTF8_FILE_PROFILE_UNSUPPORTED",
        "UTF8_FILE_CONTENT_UNSUPPORTED",
        "MATERIAL_INTEGRITY_MISMATCH",
      ].includes(code)
    )
      return fail(422, "INVALID_SOURCE_COMMAND");
    if (code === "SOURCE_ACCESS_DENIED") return fail(403, code);
    if (code === "UNIVERSAL_SOURCE_SCOPE_CLOSED")
      return fail(503, "SOURCE_CAPABILITY_CLOSED");
    if (["OPERATION_ID_REUSED", "OPERATION_KEY_REUSED", "INPUT_STALE"].includes(code))
      return fail(409, code);
    return fail(503, "SOURCE_IO_UNAVAILABLE");
  }
}
