import { z } from "zod";
import {
  importImageBytes,
  importImageMaterialSchema,
} from "../../src/domain/trip/importImageEvidence";
import {
  flightInputSchema,
  type ImportHash,
} from "../../src/domain/trip/flightImportReview";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { CoreSourceCatalogV2 } from "./tripCoreV2Source";

export type UniversalBinaryReader = (scope: {
  accountId: string;
  tripId: string;
  sourceId: string;
  representationId: string;
  sha256: string;
  byteCount: number;
}) => Promise<Uint8Array>;
const proofSchema = z.strictObject({
  actorAccountId: z.uuid(),
  tripId: z.uuid(),
  sourceId: z.uuid(),
  representationId: z.uuid(),
  sourceRevision: z.number().int().positive(),
  sourceRowRevision: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z.number().int().positive().max(1048576),
  verification: importImageMaterialSchema.shape.verification,
});
// Existing owning Source locks must remain held. The protected proof RPC is default closed until its exact Gate is installed.
export async function readUniversalPngSourceMaterial(
  lease: CorePgLease,
  catalog: Pick<
    CoreSourceCatalogV2,
    "actorAccountId" | "tripId" | "sourceId" | "sourceRevision"
  >,
  rawPin: unknown,
  hash: ImportHash,
  readBinary?: UniversalBinaryReader,
) {
  const pin = flightInputSchema.parse(rawPin);
  if (
    !readBinary ||
    pin.source_id !== catalog.sourceId ||
    pin.material_revision !== catalog.sourceRevision
  )
    throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
  const readProof = async () =>
    proofSchema.parse(
      (
        await lease.query(
          "SELECT public.trip_source_read_sustained_png_proof($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint) AS proof",
          [
            catalog.actorAccountId,
            catalog.tripId,
            pin.source_id,
            pin.representation_id,
            pin.material_revision,
          ],
        )
      ).rows[0]?.proof,
    );
  const proof = await readProof();
  if (
    proof.actorAccountId !== catalog.actorAccountId ||
    proof.tripId !== catalog.tripId ||
    proof.sourceId !== pin.source_id ||
    proof.representationId !== pin.representation_id ||
    proof.sourceRevision !== pin.material_revision ||
    proof.sourceRowRevision !== pin.observed_source_row_revision ||
    proof.sha256 !== pin.payload_sha256 ||
    proof.byteCount !== pin.byte_count
  )
    throw Error("SOURCE_INTEGRITY_FAILURE");
  const bytes = await readBinary({
    accountId: catalog.actorAccountId,
    tripId: catalog.tripId,
    sourceId: pin.source_id,
    representationId: pin.representation_id,
    sha256: pin.payload_sha256,
    byteCount: pin.byte_count,
  });
  if (bytes.length < 24) throw Error("SOURCE_INTEGRITY_FAILURE");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const material = importImageMaterialSchema.parse({
    pin,
    form: "IMAGE",
    media_type: "image/png",
    originalBase64: Buffer.from(bytes).toString("base64"),
    width: view.getUint32(16),
    height: view.getUint32(20),
    verification: proof.verification,
  });
  await importImageBytes(material, hash);
  if (JSON.stringify(await readProof()) !== JSON.stringify(proof))
    throw Error("SOURCE_INTEGRITY_FAILURE");
  return material;
}
