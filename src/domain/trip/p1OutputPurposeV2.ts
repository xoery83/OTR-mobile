import { z } from "zod";
import { importDigest, type ImportHash } from "./flightImportReview";
import { validateCoreCommand, type CoreCommand } from "./tripCoreV2Commands";
import { canonicalCoreJson, type Json } from "./tripCoreV2Json";
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/),
  hash = z.string().regex(/^[0-9a-f]{64}$/);
export const p1SourceFieldSchema = z.enum([
  "ROOT.title",
  "ROOT.description",
  "START.local_date",
  "START.local_time",
  "END.local_date",
  "END.local_time",
  "PLACE.authored_label",
  "PLACE.authored_text",
]);
const ref = z
  .string()
  .max(512)
  .regex(/^track-c\/field-evidence\/[0-9a-f-]{36}\/[A-Za-z0-9._:-]{1,128}$/);
export const p1PurposeBindingV2Schema = z.strictObject({
  version: z.literal(2),
  accountId: uuid,
  tripId: uuid,
  sourceId: uuid,
  sourceRevision: z.number().int().positive().safe(),
  runId: uuid,
  candidateId: uuid,
  inputCatalogSha256: hash,
  candidateSha256: hash,
  planId: uuid,
  slotId: uuid,
  targetKind: z.literal("ITEM"),
  targetId: uuid,
  operationId: uuid,
  purposeKind: z.literal("P1_ITEM"),
});
const selected = z
  .array(p1SourceFieldSchema)
  .min(2)
  .max(8)
  .refine((v) => new Set(v).size === v.length);
const refs = z.partialRecord(p1SourceFieldSchema, z.array(ref).min(1).max(16));
export const p1OutputPurposeV2Schema = p1PurposeBindingV2Schema.extend({
  payloadSha256: hash,
  selectedFields: selected,
  evidenceRefs: refs,
  purposeSha256: hash,
});
export type P1PurposeBindingV2 = z.infer<typeof p1PurposeBindingV2Schema>;
export type P1OutputPurposeV2 = z.infer<typeof p1OutputPurposeV2Schema>;
export type CertifiedP1PurposeV2 = { purpose: P1OutputPurposeV2; identitySha256: string };
export type P1PurposeVerification = {
  binding: P1PurposeBindingV2;
  command: CoreCommand;
  selectedFields: P1OutputPurposeV2["selectedFields"];
  evidenceRefs: P1OutputPurposeV2["evidenceRefs"];
};
function checked(input: P1PurposeVerification): P1PurposeVerification {
  const v = structuredClone(input);
  v.binding = p1PurposeBindingV2Schema.parse(v.binding);
  v.command = validateCoreCommand(v.command);
  v.selectedFields = selected.parse(v.selectedFields).sort();
  v.evidenceRefs = refs.parse(v.evidenceRefs);
  const c = v.command,
    b = v.binding;
  if (
    c.command !== "CREATE_ITEM" ||
    (c.payload as { family?: string }).family !== "P1" ||
    c.admission.mode !== "REVIEWED_SOURCE" ||
    c.admission.policyVersion !== null ||
    c.admission.sourceIntentId !== b.slotId ||
    c.tripId !== b.tripId ||
    c.operationId !== b.operationId ||
    c.target.kind !== "ITEM" ||
    c.target.id !== b.targetId ||
    c.baseVector.length !== 1 ||
    c.baseVector[0].kind !== "ITEM" ||
    c.baseVector[0].id !== b.targetId ||
    c.baseVector[0].revision !== null
  )
    throw Error("INVALID_PROVENANCE");
  const p = c.payload as {
    core?: { title?: string };
    schedule?: { start?: { local_date?: string | null } };
  };
  if (
    !p.core?.title?.trim() ||
    !p.schedule?.start?.local_date ||
    !v.selectedFields.includes("ROOT.title") ||
    !v.selectedFields.includes("START.local_date") ||
    Object.keys(v.evidenceRefs).sort().join("|") !== v.selectedFields.join("|")
  )
    throw Error("INCOMPLETE_SOURCE_EVIDENCE");
  for (const a of Object.values(v.evidenceRefs)) {
    if (!a || new Set(a).size !== a.length) throw Error("INVALID_PROVENANCE");
    a.sort();
  }
  return v;
}
export async function mintP1OutputPurposeV2(
  input: P1PurposeVerification,
  verify: (v: P1PurposeVerification) => Promise<void>,
  sha256: ImportHash,
): Promise<CertifiedP1PurposeV2> {
  const v = checked(input);
  await verify(structuredClone(v));
  const unsigned = {
    ...v.binding,
    payloadSha256: await importDigest(
      "otr-core-p1-source-payload-v2",
      v.command.payload as Json,
      sha256,
    ),
    selectedFields: v.selectedFields,
    evidenceRefs: v.evidenceRefs,
  };
  const { accountId, tripId, sourceId, sourceRevision, runId, candidateId } = v.binding;
  return {
    purpose: {
      ...unsigned,
      purposeSha256: await importDigest(
        "otr-core-p1-output-purpose-v2",
        unsigned as Json,
        sha256,
      ),
    },
    identitySha256: await importDigest(
      "otr-core-p1-source-claim-v2",
      { accountId, tripId, sourceId, sourceRevision, runId, candidateId },
      sha256,
    ),
  };
}
// Integrity check only. Owning current Source/Actor/graph verification is mandatory at admission.
export async function assertP1OutputPurposeV2(
  certified: CertifiedP1PurposeV2,
  input: P1PurposeVerification,
  sha256: ImportHash,
) {
  const expected = await mintP1OutputPurposeV2(input, async () => {}, sha256);
  if (
    canonicalCoreJson(p1OutputPurposeV2Schema.parse(certified.purpose) as Json) !==
      canonicalCoreJson(expected.purpose as Json) ||
    certified.identitySha256 !== expected.identitySha256
  )
    throw Error("INVALID_OUTPUT_PURPOSE");
}
