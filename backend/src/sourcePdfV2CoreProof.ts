import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import {
  sourcePdfV2SealSchema as sourcePdfSealSchema,
  PDF_V2_OPTIONS_SHA as PDF_OPTIONS_SHA,
} from "./sourcePdfV2Contracts";
import { createHash } from "node:crypto";
import { validatePdfExtractionContent } from "../../src/data/interpretation/flightPdfExtraction";
import { SOURCE_PDF_V2_LINUX_PROFILE_SHA as PDF_PROFILE_SHA } from "./sourcePdfV2LinuxVerifier";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import type { CoreSourceCatalogV2 } from "./tripCoreV2Source";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
const pdfHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export async function readSourcePdfV2CoreProof(
  lease: CorePgLease,
  catalog: CoreSourceCatalogV2,
  representationId: string,
  hash: ImportHash,
  historical = false,
  expectedSha?: string,
) {
  if (
    !(
      await lease.query("SELECT to_regclass('public.trip_source_pdf_seals') AS available")
    ).rows[0]?.available
  )
    throw new Error("CONTRACT_UNSUPPORTED");
  const rows = (
    await lease.query(
      "SELECT s.body,s.seal_sha256 FROM public.trip_source_pdf_seals s JOIN public.trip_source_representations original ON original.id=(s.body->'request'->>'originalRepresentationId')::uuid WHERE s.account_id=$1::uuid AND s.trip_id=$2::uuid AND s.source_id=$3::uuid AND s.source_revision=$4 AND s.derived_representation_id=$5::uuid AND ($6::text IS NULL OR s.seal_sha256=$6) AND ($7::boolean OR ((s.body->'request'->>'sourceRowRevision')::bigint=$8 AND (s.body->'request'->>'originalRowRevision')::bigint=original.row_revision)) ORDER BY s.created_at DESC LIMIT 2",
      [
        catalog.actorAccountId,
        catalog.tripId,
        catalog.sourceId,
        catalog.sourceRevision,
        representationId,
        expectedSha ?? null,
        historical,
        (catalog.source as Record<string, unknown>).row_revision,
      ],
    )
  ).rows;
  if (rows.length !== 1) throw new Error("CONTRACT_UNSUPPORTED");
  const body = sourcePdfSealSchema.parse(rows[0].body),
    q = body.request;
  const original = (
    await lease.query(
      "SELECT to_jsonb(r) AS row FROM public.trip_source_representations r WHERE id=$1::uuid AND source_id=$2::uuid",
      [q.originalRepresentationId, catalog.sourceId],
    )
  ).rows[0]?.row as Record<string, unknown>;
  const derived = (
    await lease.query(
      "SELECT to_jsonb(r) AS row FROM public.trip_source_representations r WHERE id=$1::uuid AND source_id=$2::uuid",
      [representationId, catalog.sourceId],
    )
  ).rows[0]?.row as Record<string, unknown>;
  const gate = (
    await lease.query("SELECT enabled FROM public.trip_source_pdf_gate WHERE singleton")
  ).rows[0]?.enabled;
  const source = catalog.source as Record<string, unknown>;
  if (
    (!historical &&
      (!gate ||
        source.row_revision !== q.sourceRowRevision ||
        source.current_material_revision !== q.sourceRevision ||
        original?.row_revision !== q.originalRowRevision)) ||
    body.accountId !== catalog.actorAccountId ||
    body.tripId !== catalog.tripId ||
    q.sourceId !== catalog.sourceId ||
    q.sourceRevision !== catalog.sourceRevision ||
    q.derivedRepresentationId !== representationId ||
    body.profileSha256 !== PDF_PROFILE_SHA ||
    body.transformOptionsSha256 !== PDF_OPTIONS_SHA ||
    !original ||
    original.role !== "ORIGINAL" ||
    original.material_kind !== "BINARY" ||
    original.mime_type !== "application/pdf" ||
    original.remote_state !== "VERIFIED" ||
    original.retention_state !== "RETAINED" ||
    original.payload_sha256 !== body.originalSha256 ||
    original.byte_count !== body.originalByteCount ||
    !derived ||
    derived.role !== "DERIVED" ||
    derived.material_kind !== "TEXT" ||
    derived.retention_state !== "RETAINED" ||
    JSON.stringify(derived.parent_ids) !== JSON.stringify([original.id]) ||
    derived.transform_key !== "otr.pdf.qpdf-poppler" ||
    derived.transform_version !== "2" ||
    derived.transform_options_sha256 !== PDF_OPTIONS_SHA ||
    derived.payload_sha256 !== body.textSha256 ||
    derived.byte_count !== body.textByteCount ||
    typeof derived.text_content !== "string" ||
    pdfHash(derived.text_content) !== body.textSha256 ||
    new TextEncoder().encode(derived.text_content).length !== body.textByteCount ||
    pdfHash(canonicalCoreJson(body.pages)) !== body.pageMapSha256 ||
    (await coreHashValue("otr-source-pdf-seal-v2", body, hash)) !== rows[0].seal_sha256
  )
    throw new Error("CONTRACT_UNSUPPORTED");
  if (
    original.storage_provider !== "supabase_storage" ||
    original.storage_bucket !== "trip-source-material" ||
    original.object_key !==
      `v1/${catalog.tripId}/${catalog.sourceId}/${q.originalRepresentationId}/payload`
  )
    throw new Error("CONTRACT_UNSUPPORTED");
  try {
    await validatePdfExtractionContent(
      {
        engine: "qpdf-poppler",
        version: 1 as const,
        originalSha256: body.originalSha256,
        originalByteCount: body.originalByteCount,
        text: derived.text_content as string,
        pages: body.pages,
      },
      { sha256: body.originalSha256, byteCount: body.originalByteCount },
      hash,
    );
  } catch {
    throw new Error("CONTRACT_UNSUPPORTED");
  }
  return {
    originalRepresentationId: q.originalRepresentationId,
    representationId,
    sealSha256: rows[0].seal_sha256 as string,
  };
}
