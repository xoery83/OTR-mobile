import { z } from "zod";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import { coreHash, coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { CoreSourceCatalogV2 } from "./tripCoreV2Source";
import { readSourcePdfV2CoreProof } from "./sourcePdfV2CoreProof";

const originalPin = z.strictObject({
  representationId: coreUuid,
  sha256: coreHash,
  // Keep the current Universal input bound; the decoder's 10MiB limit is not a quota grant.
  byteCount: z.number().int().positive().max(4194304),
});
// Internal only: caller retains its owning Source lease/catalog and locks. No role/transaction change.
export async function readUniversalPdfSourceMaterial(
  lease: CorePgLease,
  catalog: CoreSourceCatalogV2,
  expectedOriginal: z.infer<typeof originalPin>,
  hash: ImportHash,
) {
  const expected = originalPin.parse(expectedOriginal);
  const rows = (
    await lease.query(
      "SELECT to_jsonb(o) AS original,to_jsonb(d) AS derived FROM public.trip_source_revisions m JOIN public.trip_source_representations o ON o.source_id=m.source_id AND o.id=$1::uuid AND o.introduced_revision<=m.material_revision JOIN public.trip_source_representations d ON d.source_id=m.source_id AND d.introduced_revision<=m.material_revision WHERE m.source_id=$2::uuid AND m.material_revision=$3 AND m.retention_state='RETAINED' AND m.original_representation_ids=ARRAY[o.id] AND o.role='ORIGINAL' AND o.retention_state='RETAINED' AND d.role='DERIVED' AND d.material_kind='TEXT' AND d.retention_state='RETAINED' AND d.parent_ids=ARRAY[o.id] AND d.transform_key='otr.pdf.qpdf-poppler' AND d.transform_version='2' ORDER BY d.id LIMIT 2",
      [expected.representationId, catalog.sourceId, catalog.sourceRevision],
    )
  ).rows;
  if (rows.length !== 1) throw Error("UNIVERSAL_PDF_MATERIAL_UNAVAILABLE");
  const original = rows[0].original as Record<string, unknown>;
  const derived = rows[0].derived as Record<string, unknown>;
  if (
    !original ||
    !derived ||
    original.id !== expected.representationId ||
    original.source_id !== catalog.sourceId ||
    original.payload_sha256 !== expected.sha256 ||
    original.byte_count !== expected.byteCount ||
    derived.source_id !== catalog.sourceId ||
    !coreUuid.safeParse(derived.id).success ||
    !Number.isSafeInteger(derived.introduced_revision) ||
    Number(derived.introduced_revision) < 1 ||
    Number(derived.introduced_revision) > catalog.sourceRevision
  )
    throw Error("UNIVERSAL_PDF_MATERIAL_UNAVAILABLE");
  const proof = await readSourcePdfV2CoreProof(
    lease,
    catalog,
    String(derived.id),
    hash,
    false,
    undefined,
    { continuousUniversal: true },
  );
  if (proof.originalRepresentationId !== expected.representationId)
    throw Error("UNIVERSAL_PDF_MATERIAL_UNAVAILABLE");
  const seals = (
    await lease.query(
      "SELECT s.body->>'pageMapSha256' AS page_map_sha256 FROM public.trip_source_pdf_seals s WHERE s.account_id=$1::uuid AND s.trip_id=$2::uuid AND s.source_id=$3::uuid AND s.source_revision=$4 AND s.derived_representation_id=$5::uuid AND s.seal_sha256=$6 LIMIT 2",
      [
        catalog.actorAccountId,
        catalog.tripId,
        catalog.sourceId,
        catalog.sourceRevision,
        derived.id,
        proof.sealSha256,
      ],
    )
  ).rows;
  if (seals.length !== 1) throw Error("UNIVERSAL_PDF_MATERIAL_UNAVAILABLE");
  return {
    actorId: catalog.actorAccountId,
    tripId: catalog.tripId,
    sourceId: catalog.sourceId,
    materialRevision: catalog.sourceRevision,
    original: expected,
    derived: {
      representationId: String(derived.id),
      sha256: coreHash.parse(derived.payload_sha256),
      byteCount: z.number().int().positive().max(262144).parse(derived.byte_count),
      text: z.string().parse(derived.text_content),
    },
    sealSha256: proof.sealSha256,
    pageMapSha256: coreHash.parse(seals[0].page_map_sha256),
  };
}
