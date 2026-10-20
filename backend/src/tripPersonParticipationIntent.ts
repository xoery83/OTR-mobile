import { createHash } from "node:crypto";
import { parseEventJson } from "./tripEventIntent";
import {
  participationCommandSchema,
  participationResultSchema,
  type ParticipationCommand,
} from "../../src/domain/trip/personParticipationCommand";
const hash = (bytes: string) => createHash("sha256").update(bytes, "utf8").digest("hex");
// Backend encodes independently of Mobile byte serializers; shared schemas only.
export function participationIntentCodec(raw: string) {
  const command = participationCommandSchema.parse(parseEventJson(raw));
  const c = command;
  const bytes =
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
    ]);
  const digest = hash(bytes);
  if (command.intentDigest !== digest) throw new Error("INVALID_PARTICIPATION_COMMAND");
  return { command, bytes, digest };
}
export function participationResultCodec(
  raw: unknown,
  actor: string,
  trip: string,
  operation: string,
  command?: ParticipationCommand,
) {
  const result = participationResultSchema.parse(raw),
    r = result.receipt;
  const pair = (p: typeof r.priorParticipation) => [
    p.isParticipating,
    String(p.revision),
  ];
  const bytes =
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
      pair(r.expectedParticipation),
      r.desiredParticipation,
      r.outcome,
      pair(r.priorParticipation),
      pair(r.resultingParticipation),
      r.errorCode,
      r.observedAt,
    ]);
  if (
    hash(bytes) !== result.resultDigest ||
    r.actorUserId !== actor ||
    r.tripId !== trip ||
    r.operationId !== operation ||
    (command &&
      (r.personId !== command.personId ||
        r.intentDigest !== command.intentDigest ||
        r.desiredParticipation !== command.isParticipating ||
        r.expectedParticipation.revision !== command.expectedParticipation.revision ||
        r.expectedParticipation.isParticipating !==
          command.expectedParticipation.isParticipating ||
        (command.actorMemberId !== null && r.actorMemberId !== command.actorMemberId)))
  )
    throw new Error("INVALID_PARTICIPATION_RESULT");
  return { result, bytes, digest: hash(bytes) };
}
