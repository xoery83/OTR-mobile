import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { sourcePdfSealSchema } from "../../src/domain/trip/sourcePdfAuthority";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import type { CoreSourceCatalogV2 } from "./tripCoreV2Source";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import {
  PDF_PROFILE_SHA,
  PDF_OPTIONS_SHA,
  pdfHash,
  encodeProfilePdf,
} from "./sourcePdfProfile";
export async function readSourcePdfCoreProof(
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
    derived.transform_key !== "otr.pdf.literal-text" ||
    derived.transform_version !== "1" ||
    derived.transform_options_sha256 !== PDF_OPTIONS_SHA ||
    derived.payload_sha256 !== body.textSha256 ||
    derived.byte_count !== body.textByteCount ||
    typeof derived.text_content !== "string" ||
    pdfHash(derived.text_content) !== body.textSha256 ||
    new TextEncoder().encode(derived.text_content).length !== body.textByteCount ||
    pdfHash(canonicalCoreJson(body.pages)) !== body.pageMapSha256 ||
    (await coreHashValue("otr-source-pdf-seal-v1", body, hash)) !== rows[0].seal_sha256
  )
    throw new Error("CONTRACT_UNSUPPORTED");
  let encoded: Uint8Array;
  try {
    encoded = encodeProfilePdf((derived.text_content as string).split("\n"));
  } catch {
    throw new Error("CONTRACT_UNSUPPORTED");
  }
  if (
    pdfHash(encoded) !== body.originalSha256 ||
    encoded.length !== body.originalByteCount
  )
    throw new Error("CONTRACT_UNSUPPORTED");
  let end = 0;
  for (const [i, p] of body.pages.entries()) {
    if (
      p.pageIndex !== i ||
      p.start !== end ||
      p.end <= p.start ||
      (derived.text_content as string).slice(p.start, p.end).includes("\n") ||
      (i < body.pages.length - 1 && (derived.text_content as string)[p.end] !== "\n")
    )
      throw new Error("CONTRACT_UNSUPPORTED");
    end = p.end + 1;
  }
  if (end - 1 !== body.textByteCount) throw new Error("CONTRACT_UNSUPPORTED");
  return {
    originalRepresentationId: q.originalRepresentationId,
    representationId,
    sealSha256: rows[0].seal_sha256 as string,
  };
}
