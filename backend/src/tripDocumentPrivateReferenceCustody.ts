import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { coreHash, coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import {
  createTripDocumentOriginalRead,
  type OriginalReadPorts,
  type OriginalCustodyScope,
  type RetainedOriginal,
} from "./tripDocumentOriginalRead";

const stageSchema = z.strictObject({
  actorAccountId: coreUuid,
  tripId: coreUuid,
  documentId: coreUuid,
  representationId: coreUuid,
  sha256: coreHash,
  byteSize: z.number().int().min(1).max(10485760),
  mediaType: z.enum(["application/pdf", "image/jpeg", "image/png", "text/plain"]),
});
type Representation = {
  source_id: string;
  source_revision: string | number;
  row_revision: string | number;
  source_trip_id: string;
  acquired_by: string;
  lifecycle: string;
  source_retention: string;
  role: string;
  retention_state: string;
  material_kind: string;
  remote_state: string;
  payload_sha256: string;
  byte_count: number;
  mime_type: string | null;
  text_content: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  object_key: string | null;
};
const representationSql = `SELECT r.*,s.trip_id AS source_trip_id,s.acquired_by,s.lifecycle,s.retention_state AS source_retention,s.row_revision AS source_revision FROM public.trip_source_representations r JOIN public.trip_sources s ON s.id=r.source_id WHERE r.id=$1::uuid`;
function currentReference(
  r: Representation | undefined,
  actor: string,
  trip: string,
  sha: string,
  size: number,
  media: string,
) {
  return (
    !!r &&
    r.source_trip_id === trip &&
    r.acquired_by === actor &&
    r.lifecycle === "ACTIVE" &&
    r.source_retention === "RETAINED" &&
    r.role === "ORIGINAL" &&
    r.retention_state === "RETAINED" &&
    r.payload_sha256 === sha &&
    Number(r.byte_count) === size &&
    (r.material_kind === "TEXT"
      ? media === "text/plain" && r.remote_state === "NOT_APPLICABLE"
      : r.material_kind === "BINARY" &&
        r.remote_state === "VERIFIED" &&
        r.mime_type === media &&
        r.storage_provider === "supabase_storage" &&
        r.storage_bucket === "trip-source-material" &&
        !!r.object_key)
  );
}
function exactBytes(bytes: Uint8Array, sha: string, size: number, max: number) {
  if (
    bytes.byteLength !== size ||
    bytes.byteLength > max ||
    createHash("sha256").update(bytes).digest("hex") !== sha
  )
    throw new Error("ORIGINAL_BYTES_UNAVAILABLE");
  return bytes;
}
// Concrete private Source storage producer; no caller URL/key or receipt permission.
export function createTripDocumentPrivateReferenceCustody(
  connection: CorePgConnection,
  storage: SupabaseClient["storage"],
  currentAccess: OriginalReadPorts["currentAccess"],
) {
  async function transaction<T>(
    actor: string,
    trip: string,
    work: (lease: CorePgLease) => Promise<T>,
  ) {
    return connection.withLease(async (lease) => {
      let began = false;
      try {
        await lease.query("BEGIN");
        began = true;
        const identity = (await lease.query("SELECT current_user AS role")).rows[0];
        if (identity?.role !== "otr_trip_core_v2_gateway")
          throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
        await lease.query(
          "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
          [actor, trip],
        );
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
        if (
          (
            await lease.query(
              "SELECT runtime_enabled FROM public.trip_core_activation_gate WHERE singleton",
            )
          ).rows[0]?.runtime_enabled !== true
        )
          throw new Error("CORE_CAPABILITY_CLOSED");
        const result = await work(lease);
        await lease.query("COMMIT");
        began = false;
        return result;
      } catch (error) {
        if (began)
          try {
            await lease.query("ROLLBACK");
          } catch {
            lease.retire();
          }
        throw error;
      }
    });
  }
  async function bytes(r: Representation, sha: string, size: number, max: number) {
    if (r.material_kind === "TEXT")
      return exactBytes(
        new Uint8Array(Buffer.from(r.text_content ?? "", "utf8")),
        sha,
        size,
        max,
      );
    const signed = await storage
      .from("trip-source-material")
      .createSignedUrl(r.object_key!, 60);
    if (signed.error || !signed.data?.signedUrl)
      throw new Error("ORIGINAL_BYTES_UNAVAILABLE");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(signed.data.signedUrl, {
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok || !response.body) throw new Error("ORIGINAL_BYTES_UNAVAILABLE");
      const length = response.headers.get("content-length");
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) > max || Number(length) !== size)
      )
        throw new Error("ORIGINAL_BYTES_UNAVAILABLE");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let count = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          count += next.value.byteLength;
          if (count > max || count > size) throw new Error("ORIGINAL_BYTES_UNAVAILABLE");
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return exactBytes(new Uint8Array(Buffer.concat(chunks)), sha, size, max);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async function context(lease: CorePgLease, scope: OriginalCustodyScope) {
    const rows = (
      await lease.query(
        `SELECT d.media_type,d.source_representation_id,d.revision,c.state,c.actor_account_id,c.document_id,c.trip_id,c.sha256,c.byte_size,c.custody,c.bound_at FROM public.trip_operational_documents d JOIN public.trip_operational_document_custody c ON c.id=d.custody_receipt_id AND c.trip_id=d.trip_id WHERE d.id=$1::uuid AND d.trip_id=$2::uuid AND d.custody_receipt_id=$3::uuid AND d.content_version=$4 AND d.sha256=$5 AND d.byte_size=$6 AND d.custody='PRIVATE_SOURCE_REFERENCE' AND d.storage_object_key IS NULL AND d.hidden_at IS NULL AND c.source_representation_id=d.source_representation_id`,
        [
          scope.documentId,
          scope.tripId,
          scope.custodyReceiptId,
          scope.contentVersion,
          scope.sha256,
          scope.byteSize,
        ],
      )
    ).rows;
    if (rows.length !== 1) return null;
    const c = rows[0];
    if (
      c.state !== "BOUND" ||
      c.custody !== "PRIVATE_SOURCE_REFERENCE" ||
      c.actor_account_id !== scope.actorAccountId ||
      c.document_id !== scope.documentId ||
      c.trip_id !== scope.tripId ||
      c.sha256 !== scope.sha256 ||
      Number(c.byte_size) !== scope.byteSize
    )
      return null;
    const r = (await lease.query(representationSql, [c.source_representation_id]))
      .rows[0] as unknown as Representation | undefined;
    if (
      !currentReference(
        r,
        scope.actorAccountId,
        scope.tripId,
        scope.sha256,
        scope.byteSize,
        c.media_type as string,
      )
    )
      return null;
    const generation = createHash("sha256")
      .update(
        JSON.stringify([
          c.revision,
          c.bound_at,
          r!.source_revision,
          r!.row_revision,
          r!.source_id,
        ]),
      )
      .digest("hex");
    const retention: RetainedOriginal = {
      ...scope,
      custody: "PRIVATE_SOURCE_REFERENCE",
      state: "BOUND",
      right: "CURRENT_SOURCE_RIGHT",
      generation,
    };
    return { r: r!, retention };
  }
  const ports: OriginalReadPorts = {
    currentAccess,
    currentRetention: (scope) =>
      transaction(
        scope.actorAccountId,
        scope.tripId,
        async (lease) => (await context(lease, scope))?.retention ?? null,
      ),
    readRetained: (scope) =>
      transaction(scope.actorAccountId, scope.tripId, async (lease) => {
        const first = await context(lease, scope);
        if (!first) return null;
        const content = await bytes(
          first.r,
          scope.sha256,
          scope.byteSize,
          scope.maxBytes,
        );
        const last = await context(lease, scope);
        if (last?.retention.generation !== first.retention.generation) return null;
        return { ...first.retention, bytes: content };
      }),
  };
  return {
    original: createTripDocumentOriginalRead(ports),
    // Server custody staging, not CREATE_DOCUMENT or a client upload endpoint.
    async verifyReference(authenticatedActor: string, input: unknown) {
      const request = stageSchema.parse(input);
      if (request.actorAccountId !== authenticatedActor)
        throw new Error("CURRENT_SOURCE_CUSTODY_UNAVAILABLE");
      return transaction(authenticatedActor, request.tripId, async (lease) => {
        const r = (await lease.query(representationSql, [request.representationId]))
          .rows[0] as unknown as Representation | undefined;
        if (
          !currentReference(
            r,
            authenticatedActor,
            request.tripId,
            request.sha256,
            request.byteSize,
            request.mediaType,
          )
        )
          throw new Error("CURRENT_SOURCE_CUSTODY_UNAVAILABLE");
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
        if (
          (
            await lease.query(
              "SELECT public.trip_core_lock_source_scope($1::uuid,$2::uuid,$3::uuid) AS allowed",
              [authenticatedActor, request.tripId, r!.source_id],
            )
          ).rows[0]?.allowed !== true
        )
          throw new Error("CURRENT_SOURCE_CUSTODY_UNAVAILABLE");
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
        const locked = (await lease.query(representationSql, [request.representationId]))
          .rows[0] as unknown as Representation | undefined;
        if (
          !currentReference(
            locked,
            authenticatedActor,
            request.tripId,
            request.sha256,
            request.byteSize,
            request.mediaType,
          )
        )
          throw new Error("CURRENT_SOURCE_CUSTODY_UNAVAILABLE");
        await bytes(
          locked!,
          request.sha256,
          request.byteSize,
          request.mediaType === "text/plain" ? 1048576 : 10485760,
        );
        const existing = (
          await lease.query(
            "SELECT id,custody,actor_account_id,source_representation_id,sha256,byte_size,media_type FROM public.trip_operational_document_custody WHERE document_id=$1::uuid AND trip_id=$2::uuid AND state IN ('VERIFIED','BOUND') FOR UPDATE",
            [request.documentId, request.tripId],
          )
        ).rows;
        if (existing.length) {
          const p = existing[0];
          if (
            existing.length !== 1 ||
            p.custody !== "PRIVATE_SOURCE_REFERENCE" ||
            p.actor_account_id !== authenticatedActor ||
            p.source_representation_id !== request.representationId ||
            p.sha256 !== request.sha256 ||
            Number(p.byte_size) !== request.byteSize ||
            p.media_type !== request.mediaType
          )
            throw new Error("CUSTODY_REPLAY_MISMATCH");
          return { custodyProofId: p.id as string };
        }
        const id = randomUUID();
        await lease.query(
          "INSERT INTO public.trip_operational_document_custody(id,document_id,trip_id,actor_account_id,source_representation_id,custody,sha256,byte_size,media_type,state,verified_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'PRIVATE_SOURCE_REFERENCE',$6,$7,$8,'VERIFIED',clock_timestamp())",
          [
            id,
            request.documentId,
            request.tripId,
            authenticatedActor,
            request.representationId,
            request.sha256,
            request.byteSize,
            request.mediaType,
          ],
        );
        return { custodyProofId: id };
      });
    },
  };
}
