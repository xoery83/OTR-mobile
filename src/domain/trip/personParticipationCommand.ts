import { z } from "zod";
import { participationObservationTimeSchema } from "./participationSnapshot";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .refine((n) => !Object.is(n, -0));
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const pair = z.strictObject({ isParticipating: z.boolean(), revision });
const reason = z
  .string()
  .refine(
    (s) =>
      [...s].length >= 1 &&
      [...s].length <= 2000 &&
      s === s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "") &&
      !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        s,
      ),
  )
  .nullable();
export const participationCommandSchema = z.strictObject({
  contractVersion: z.literal(1),
  command: z.literal("SET_PARTICIPATION"),
  operationId: uuid,
  actorUserId: uuid,
  actorMemberId: uuid.nullable(),
  tripId: uuid,
  personId: uuid,
  expectedParticipation: pair,
  isParticipating: z.boolean(),
  reason,
  intentDigest: digest,
});
export type ParticipationCommand = z.infer<typeof participationCommandSchema>;
export const participationReceiptSchema = z
  .strictObject({
    receiptVersion: z.literal(1),
    receiptId: uuid,
    contractVersion: z.literal(1),
    command: z.literal("SET_PARTICIPATION"),
    operationId: uuid,
    actorUserId: uuid,
    actorMemberId: uuid,
    tripId: uuid,
    personId: uuid,
    intentDigest: digest,
    expectedParticipation: pair,
    desiredParticipation: z.boolean(),
    outcome: z.enum(["APPLIED", "UNCHANGED", "REVISION_CONFLICT"]),
    priorParticipation: pair,
    resultingParticipation: pair,
    errorCode: z.literal("PARTICIPATION_REVISION_CONFLICT").nullable(),
    observedAt: participationObservationTimeSchema,
  })
  .superRefine((r, ctx) => {
    const prior = r.priorParticipation,
      result = r.resultingParticipation,
      expected = r.expectedParticipation;
    const conflict = r.outcome === "REVISION_CONFLICT";
    if (
      conflict !== (r.errorCode !== null) ||
      conflict !== (expected.revision !== prior.revision) ||
      (!conflict && expected.isParticipating !== prior.isParticipating) ||
      (r.outcome === "APPLIED"
        ? result.revision !== prior.revision + 1 ||
          result.isParticipating === prior.isParticipating ||
          result.isParticipating !== r.desiredParticipation
        : result.revision !== prior.revision ||
          result.isParticipating !== prior.isParticipating ||
          (!conflict && r.desiredParticipation !== prior.isParticipating))
    )
      ctx.addIssue({ code: "custom", message: "Invalid participation receipt outcome." });
  });
export type ParticipationReceipt = z.infer<typeof participationReceiptSchema>;
export const participationResultSchema = z.strictObject({
  receipt: participationReceiptSchema,
  resultDigest: digest,
  idempotentReplay: z.boolean(),
});
export type ParticipationResult = z.infer<typeof participationResultSchema>;
export const participationCommandsEnabled = false;
export const participationOperationType = "TRIP_PERSON_SET_PARTICIPATION";
export function participationIntentBytes(input: ParticipationCommand) {
  const c = participationCommandSchema.parse(input);
  return (
    "otr-trip-person-intent-v1\n" +
    JSON.stringify([
      1,
      c.command,
      c.operationId,
      c.actorUserId,
      c.actorMemberId,
      c.tripId,
      c.personId,
      c.expectedParticipation.isParticipating,
      String(c.expectedParticipation.revision),
      c.isParticipating,
      c.reason,
    ])
  );
}
export function participationResultBytes(input: ParticipationReceipt) {
  const r = participationReceiptSchema.parse(input);
  const tuple = (p: ParticipationReceipt["priorParticipation"]) => [
    p.isParticipating,
    String(p.revision),
  ];
  return (
    "otr-trip-person-result-v1\n" +
    JSON.stringify([
      r.receiptVersion,
      r.receiptId,
      r.contractVersion,
      r.command,
      r.operationId,
      r.actorUserId,
      r.actorMemberId,
      r.tripId,
      r.personId,
      r.intentDigest,
      tuple(r.expectedParticipation),
      r.desiredParticipation,
      r.outcome,
      tuple(r.priorParticipation),
      tuple(r.resultingParticipation),
      r.errorCode,
      r.observedAt,
    ])
  );
}
