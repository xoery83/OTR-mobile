import { z } from "zod";
import { flightOutputPurposeV2Schema } from "./flightOutputPurposeV2";
import { coreCommandSchema, coreVectorEntrySchema } from "./tripCoreV2Commands";
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/),
  hash = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.number().int().positive().safe();
const key = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const ids = z
  .array(uuid)
  .max(64)
  .refine((a) => new Set(a).size === a.length);
const refs = z
  .record(key, z.array(z.string().min(1).max(512)).min(1).max(16))
  .refine((a) => Object.keys(a).length <= 256);
const targetKind = z.enum([
  "ITEM",
  "BOOKING",
  "ENTITLEMENT",
  "DOCUMENT",
  "INSTRUCTION",
  "RELATION",
]);
const proposedSlotSchema = z.strictObject({
  slotId: uuid,
  slotKey: z.string().regex(/^[A-Za-z0-9._:-]{1,32}$/),
  candidateId: uuid,
  targetKind,
  target: z.strictObject({ kind: targetKind, id: uuid }),
  command: coreCommandSchema.shape.command,
  operationId: uuid,
  dependsOn: ids,
  selectedFields: z
    .array(key)
    .min(1)
    .max(256)
    .refine((a) => new Set(a).size === a.length),
  evidenceRefs: refs,
  baseVector: z.array(coreVectorEntrySchema).min(1).max(32).nullable(),
  payload: z.json(),
});
export const coreSourcePrepareV2Schema = z
  .strictObject({
    captureVersion: z.literal(2),
    planId: uuid,
    sourceId: uuid,
    sourceRevision: revision,
    mode: z.enum(["REVIEWED_SOURCE", "AUTO_SOURCE"]),
    policyVersion: z.literal("otr.trip.auto-admit/1").nullable(),
    candidateIds: ids,
    slots: z.array(proposedSlotSchema).min(1).max(64),
  })
  .superRefine((p, c) => {
    const fail = () => c.addIssue({ code: "custom", message: "INVALID_SOURCE_PLAN" });
    if (
      (p.mode === "AUTO_SOURCE") !== (p.policyVersion !== null) ||
      new Set(p.slots.map((s) => s.slotId)).size !== p.slots.length ||
      new Set(p.slots.map((s) => s.operationId)).size !== p.slots.length ||
      new Set(p.slots.map((s) => `${s.candidateId}:${s.slotKey}:${s.targetKind}`))
        .size !== p.slots.length ||
      p.slots.some(
        (s) => !p.candidateIds.includes(s.candidateId) || s.target.kind !== s.targetKind,
      ) ||
      p.candidateIds.some((id) => !p.slots.some((s) => s.candidateId === id))
    )
      fail();
    const byId = new Map(p.slots.map((s) => [s.slotId, s]));
    const visited = new Set<string>(),
      active = new Set<string>();
    function visit(id: string) {
      if (active.has(id)) return fail();
      if (visited.has(id)) return;
      const slot = byId.get(id);
      if (!slot) return fail();
      active.add(id);
      for (const dependency of slot.dependsOn) visit(dependency);
      active.delete(id);
      visited.add(id);
    }
    for (const s of p.slots) visit(s.slotId);
  });
export const coreSourceFinalizeV2Schema = z.strictObject({
  captureVersion: z.literal(2),
  slotId: uuid,
  operationId: uuid,
  intentSha256: hash,
  domainReceiptId: uuid,
  receiptSha256: hash,
});
export type CoreSourcePrepareV2 = z.infer<typeof coreSourcePrepareV2Schema>;
export type CoreSourceProposedSlotV2 = z.infer<typeof proposedSlotSchema>;

// Exact existing public preparation DTO; shared so Capture never imports backend code.
export const coreSourcePreparationResultV2Schema = z.strictObject({
  captureVersion: z.literal(2),
  plan: z.strictObject({
    proposalVersion: z.literal(2),
    intentVersion: z.literal(2),
    planId: uuid,
    accountId: uuid,
    tripId: uuid,
    sourceId: uuid,
    sourceRevision: revision,
    candidateIds: ids,
    mode: coreSourcePrepareV2Schema.shape.mode,
    policyVersion: coreSourcePrepareV2Schema.shape.policyVersion,
    slots: z
      .array(
        proposedSlotSchema
          .omit({ payload: true, target: true, operationId: true })
          .extend({
            adapterKey: z.literal("otr.trip.core/2"),
            operationId: uuid,
            target: z.strictObject({
              kind: targetKind,
              candidateSlotId: z.null(),
              existingId: uuid,
            }),
            intentSha256: hash.nullable(),
            outputPurpose: flightOutputPurposeV2Schema,
            state: z.enum([
              "READY",
              "BLOCKED",
              "REVIEW",
              "DOMAIN_SUCCEEDED",
              "EVIDENCE_PENDING",
              "COMPLETE",
            ]),
          }),
      )
      .max(64),
  }),
  readyCommands: z.array(coreCommandSchema).max(64),
  reviewSlots: z
    .array(z.strictObject({ slotId: uuid, errorCode: z.string().min(1).max(128) }))
    .max(64),
});
export type CoreSourcePreparationResultV2 = z.infer<
  typeof coreSourcePreparationResultV2Schema
>;
export type CoreSourceFinalizeV2 = z.infer<typeof coreSourceFinalizeV2Schema>;
export const coreSourceFinalizeResultV2Schema = z.strictObject({
  captureVersion: z.literal(2),
  slotId: uuid,
  state: z.enum(["COMPLETE", "EVIDENCE_PENDING"]),
  errorCode: z.string().max(128).nullable(),
});
