import { z } from "zod";
import { coreUuid, coreHash } from "../../src/domain/trip/tripCoreV2";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "../../src/domain/trip/eventIntentJson";
import { importDigest, type ImportHash } from "../../src/domain/trip/flightImportReview";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

const acquisition = z.strictObject({
  contract_version: z.literal(1),
  command: z.literal("ACQUIRE_SOURCE"),
  operation_id: coreUuid,
  operation_key: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  actor_account_id: coreUuid,
  trip_id: coreUuid,
  source_id: coreUuid,
  operation_sha256: coreHash,
  payload: z.strictObject({
    acquisition_key: z.string(),
    acquisition_sha256: coreHash,
    source_input: z.strictObject({
      source_kind: z.literal("TEXT"),
      acquisition_channel: z.literal("PASTE"),
      captured_at: z.null(),
      capture_time_basis: z.literal("UNKNOWN"),
    }),
    capture: z.strictObject({
      completeness: z.enum(["AS_SUPPLIED", "PARTIAL_CAPTURE"]),
      capture_sha256: coreHash,
    }),
    original: z.strictObject({
      id: coreUuid,
      material_kind: z.literal("TEXT"),
      original_filename: z.null(),
      part_key: z.null(),
      mime_type: z.null(),
      encoding: z.literal("UTF-8"),
      payload_sha256: coreHash,
      byte_count: z.number().int().min(0).max(262144),
      text_content: z.string(),
      locator_uri: z.null(),
    }),
  }),
});
export type FlightTextSourceConnection = ReturnType<
  typeof createFlightTextSourceConnection
>;
// The SQL entrypoints retain sole ownership of admission, hashes, originals and receipts.
export function createFlightTextSourceConnection(
  connection: CorePgConnection,
  hash: ImportHash,
) {
  async function execute(sql: string, parameters: unknown[]) {
    return connection.withLease(async (lease) => {
      await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      try {
        const rows = (await lease.query(sql, parameters)).rows;
        if (rows.length !== 1 || !rows[0].result)
          throw new Error("SOURCE_IO_UNAVAILABLE");
        await lease.query("COMMIT");
        return rows[0].result;
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
  return {
    async acquire(actor: string, trip: string, input: unknown) {
      const q = acquisition.parse(input);
      if (q.actor_account_id !== actor || q.trip_id !== trip)
        throw new Error("SOURCE_ACCESS_DENIED");
      const bytes = new TextEncoder().encode(q.payload.original.text_content);
      if (
        bytes.length !== q.payload.original.byte_count ||
        (await hash(bytes)) !== q.payload.original.payload_sha256
      )
        throw new Error("MATERIAL_INTEGRITY_MISMATCH");
      const r = (await execute(
        "SELECT public.trip_source_acquire_source($1::uuid,$2) AS result",
        [actor, canonicalEventJson(q as Json)],
      )) as Record<string, Json>;
      if (
        r.operation_id !== q.operation_id ||
        r.operation_key !== q.operation_key ||
        r.operation_sha256 !== q.operation_sha256 ||
        r.source_id !== q.source_id ||
        r.representation_id !== q.payload.original.id ||
        r.command !== "ACQUIRE_SOURCE" ||
        r.outcome !== "APPLIED" ||
        r.result_material_revision !== 1 ||
        r.result_remote_state !== "NOT_APPLICABLE" ||
        r.result_retention_state !== "RETAINED" ||
        r.result_sha256 !==
          (await importDigest(
            "otr-source-result-v1",
            [
              1,
              r.operation_id,
              r.command,
              r.operation_sha256,
              r.outcome,
              r.error_code,
              r.completed_at,
              r.result_source_row_revision,
              r.result_material_revision,
              r.result_representation_row_revision,
              r.result_remote_state,
              r.result_retention_state,
              r.result_action_id,
              r.result_verified_at,
            ],
            hash,
          ))
      )
        throw new Error("REPLAY_UNAVAILABLE");
      return r;
    },
    async publishRun(actor: string, trip: string, input: unknown) {
      // SQL validates the complete existing Run/Input/Candidate/lineage envelope.
      const q = z.object({ id: coreUuid }).passthrough().parse(input);
      const r = (await execute(
        "SELECT public.trip_source_publish_flight_run($1::uuid,$2::uuid,$3) AS result",
        [actor, trip, canonicalEventJson(q as Json)],
      )) as Record<string, Json>;
      if (
        r.id !== q.id ||
        r.actor_account_id !== actor ||
        r.trip_id !== trip ||
        r.state !== "READY"
      )
        throw new Error("REPLAY_UNAVAILABLE");
      return r;
    },
  };
}
export async function flightTextSourceBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  connection?: FlightTextSourceConnection,
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
  const failure = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url),
    match = /^\/v2\/trips\/([^/]+)\/sources\/(acquire|runs\/publish)$/.exec(url.pathname);
  if (!match || !coreUuid.safeParse(match[1]).success || url.search)
    return failure(400, "INVALID_SOURCE_COMMAND");
  if (request.method !== "POST") return failure(405, "METHOD_NOT_ALLOWED");
  try {
    if (!(await canReadTrip(actor, match[1])))
      return failure(403, "SOURCE_ACCESS_DENIED");
    if (!connection) return failure(503, "SOURCE_CAPABILITY_CLOSED");
    const boundary = createRequestBoundary(15000, request.signal);
    let input: unknown;
    try {
      input = await readBoundedJson(
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
        ? await connection.acquire(actor, match[1], input)
        : await connection.publishRun(actor, match[1], input),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "SOURCE_IO_UNAVAILABLE";
    if (error instanceof RequestBoundaryError)
      return failure(error.code === "BODY_LIMIT" ? 413 : 400, "INVALID_SOURCE_COMMAND");
    if (
      error instanceof z.ZodError ||
      [
        "INVALID_COMMAND",
        "INVALID_SOURCE_COMMAND",
        "INVALID_IMPORT_INTENT",
        "INVALID_IMPORT_INPUT",
        "INVALID_FLIGHT_PROPOSAL",
        "INVALID_FLIGHT_SUPPORT",
        "UNSUPPORTED_FLIGHT_DIMENSION",
        "INVALID_RUN_LINEAGE",
        "INVALID_CANDIDATE_LINEAGE",
      ].includes(code)
    )
      return failure(422, "INVALID_SOURCE_COMMAND");
    if (["SOURCE_ACCESS_DENIED", "FORBIDDEN"].includes(code))
      return failure(403, "SOURCE_ACCESS_DENIED");
    if (code === "SOURCE_NOT_AVAILABLE") return failure(404, code);
    if ((error as { code?: string })?.code === "23505")
      return failure(409, "OPERATION_ID_REUSED");
    if (["OPERATION_KEY_REUSED", "OPERATION_ID_REUSED", "INPUT_STALE"].includes(code))
      return failure(409, code);
    if (code === "MATERIAL_INTEGRITY_MISMATCH") return failure(422, code);
    return failure(503, "SOURCE_IO_UNAVAILABLE");
  }
}
