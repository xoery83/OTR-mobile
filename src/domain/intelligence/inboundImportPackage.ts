import { z } from "zod";
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const label = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const material = z.strictObject({
  id: uuid,
  reference: uuid,
  sha256: digest,
  byte_count: z.number().int().positive().safe().max(4194304),
  kind: z.literal("MATERIAL"),
});
export const inboundPackageSchema = z
  .strictObject({
    contract_version: z.literal("otr-inbound-import-v1"),
    package_version: z.literal(1),
    package_id: uuid,
    idempotency_key: uuid,
    client_identity_id: uuid,
    account_id: uuid,
    trip_intent: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("KNOWN"), trip_id: uuid }),
      z.strictObject({ kind: z.literal("SELECT") }),
      z.strictObject({ kind: z.literal("PROPOSE") }),
    ]),
    requested_action: z.literal("SUBMIT"),
    materials: z.array(material).min(1).max(64),
    items: z
      .array(
        z.strictObject({
          id: label,
          family: z.enum(["FLIGHT", "OTHER"]),
          material_ids: z.array(uuid).min(1).max(64),
        }),
      )
      .max(64),
    summaries: z
      .array(
        z.strictObject({
          id: uuid,
          kind: z.enum(["SUMMARY", "INTERPRETATION"]),
          reference: uuid,
          sha256: digest,
          byte_count: z.number().int().positive().safe().max(262144),
          material_ids: z.array(uuid).min(1).max(64),
        }),
      )
      .max(64),
  })
  .superRefine((p, c) => {
    const ids = new Set(p.materials.map((m) => m.id));
    if (
      ids.size !== p.materials.length ||
      new Set(p.materials.map((m) => m.reference)).size !== p.materials.length ||
      new Set(p.items.map((i) => i.id)).size !== p.items.length ||
      new Set(p.summaries.map((s) => s.id)).size !== p.summaries.length ||
      [...p.materials, ...p.summaries].reduce((n, m) => n + m.byte_count, 0) > 4194304 ||
      [...p.items, ...p.summaries].some(
        (i) =>
          new Set(i.material_ids).size !== i.material_ids.length ||
          i.material_ids.some((id) => !ids.has(id)),
      ) ||
      p.summaries.some(
        (s) => ids.has(s.id) || p.materials.some((m) => m.reference === s.reference),
      )
    )
      c.addIssue({ code: "custom", message: "INVALID_PACKAGE" });
  });
export const inboundScopeSchema = z.strictObject({
  integration_id: label,
  account_id: uuid,
  client_identity_id: uuid,
  grant_id: uuid,
  grant_revision: z.number().int().positive().safe(),
  trip_id: uuid.nullable(),
  package_id: uuid,
});
const header = {
  version: z.literal(1),
  environment: z.literal("TEST"),
  request_id: uuid,
  request_sha256: digest,
  scope: inboundScopeSchema,
};
export const inboundSubmitSchema = z.strictObject({
  ...header,
  package: inboundPackageSchema,
  expected_review_version: z.number().int().nonnegative().safe(),
});
export const inboundStatusSchema = z.strictObject(header);
export const inboundDecisionSchema = z.strictObject({
  ...header,
  review_key: uuid,
  review_version: z.number().int().positive().safe(),
  proposal_sha256: digest,
  candidate_id: uuid,
  candidate_sha256: digest,
  run_id: uuid,
  run_generation: z.number().int().positive().safe(),
  input_sha256: digest,
  event_id: uuid.nullable(),
  base_revision: z.number().int().positive().safe().nullable(),
  disposition: z.enum(["ACCEPT", "REJECT", "DEFER"]),
});
export type InboundPackage = z.infer<typeof inboundPackageSchema>;
export type InboundScope = z.infer<typeof inboundScopeSchema>;
export type InboundDecision = z.infer<typeof inboundDecisionSchema>;
