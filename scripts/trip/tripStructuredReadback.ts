/** Fixed-shape independent readback builder. No network or credential access. */
import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { structuredTripMetadataSchema , structuredTripMetadataReceiptSchema } from "../../src/domain/trip/tripStructuredDestinationContract";
export const structuredReadbackTargetSchema = z
  .strictObject({
    actorAccountId: coreUuid,
    tripId: coreUuid,
    createOperationId: coreUuid,
    metadataOperationIds: z.array(coreUuid).max(10),
  })
  .refine((v) => new Set(v.metadataOperationIds).size === v.metadataOperationIds.length);
export type StructuredReadbackTarget = z.infer<typeof structuredReadbackTargetSchema>;
export function buildStructuredTripReadbackSql(input: StructuredReadbackTarget) {
  const t = structuredReadbackTargetSchema.parse(input),
    ids = t.metadataOperationIds.map((id) => `'${id}'::uuid`).join(",") || "NULL::uuid";
  return `BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
'actorAccountId','${t.actorAccountId}','tripId','${t.tripId}',
'metadata',(SELECT jsonb_build_object('name',name,'destination',destination,'startDate',start_date,'endDate',end_date,'destinations',destinations) FROM public.trips WHERE id='${t.tripId}'::uuid AND created_by='${t.actorAccountId}'::uuid),
'metadataRevision',(SELECT metadata_revision FROM public.trips WHERE id='${t.tripId}'::uuid AND created_by='${t.actorAccountId}'::uuid),
'ownerPersonId',(SELECT id FROM public.journey_members WHERE trip_id='${t.tripId}'::uuid AND user_id='${t.actorAccountId}'::uuid AND role='owner' AND status='linked'),
'ledger',(SELECT jsonb_build_object('tripId',journey_id,'settlementCurrency',settlement_currency,'revision',revision) FROM public.ledger_settings WHERE journey_id='${t.tripId}'::uuid),
'createOriginal',(SELECT request_payload FROM public.trip_create_receipts WHERE operation_id='${t.createOperationId}'::uuid AND actor_account_id='${t.actorAccountId}'::uuid AND trip_id='${t.tripId}'::uuid),
'editReceipts',(SELECT coalesce(jsonb_agg(result_payload ORDER BY after_revision,operation_id),'[]'::jsonb) FROM public.trip_metadata_update_receipts WHERE actor_account_id='${t.actorAccountId}'::uuid AND trip_id='${t.tripId}'::uuid AND operation_id IN (${ids}))) AS qa;
ROLLBACK;`;
}
export const structuredTripReadbackSchema = z.strictObject({
  actorAccountId: coreUuid,
  tripId: coreUuid,
  metadata: structuredTripMetadataSchema,
  metadataRevision: z.number().int().nonnegative().safe(),
  ownerPersonId: coreUuid,
  ledger: z.strictObject({
    tripId: coreUuid,
    settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
    revision: z.number().int().positive().safe(),
  }),
  createOriginal: z.unknown(),
  editReceipts: z.array(structuredTripMetadataReceiptSchema),
});
export function qualifyStructuredTripReadback(
  value: unknown,
  target: StructuredReadbackTarget,
) {
  const t = structuredReadbackTargetSchema.parse(target),
    v = structuredTripReadbackSchema.parse(value);
  if (
    v.editReceipts.length !== t.metadataOperationIds.length ||
    new Set(v.editReceipts.map((r) => r.operationId)).size !== v.editReceipts.length ||
    v.actorAccountId !== t.actorAccountId ||
    v.tripId !== t.tripId ||
    v.ledger.tripId !== t.tripId ||
    v.editReceipts.some(
      (r) =>
        r.actorAccountId !== t.actorAccountId ||
        r.tripId !== t.tripId ||
        !t.metadataOperationIds.includes(r.operationId),
    )
  )
    throw Error("TRIP_STRUCTURED_READBACK_SCOPE_MISMATCH");
  // Original request is versioned and independent of current Trip metadata.
  const original = z
    .strictObject({
      formatVersion: z.literal(2),
      tripId: coreUuid,
      ...structuredTripMetadataSchema.shape,
    })
    .parse(v.createOriginal);
  if (original.tripId !== t.tripId)
    throw Error("TRIP_STRUCTURED_READBACK_SCOPE_MISMATCH");
  return { ...v, createOriginal: original };
}
