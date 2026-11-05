import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { z } from "zod";

import { coreHash, coreText, coreUuid } from "./tripCoreV2";

/** Pure proposed wire contract. Parsing a context never establishes authority. */
export const selfNicknameContextSchema = z.strictObject({
  accountId: coreUuid,
  tripId: coreUuid,
  personId: coreUuid,
});
export type SelfNicknameContext = z.infer<typeof selfNicknameContextSchema>;
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .refine((value) => !Object.is(value, -0));
const desiredNickname = coreText(256)
  .refine((value) => value.length > 0 && value === value.trim())
  .nullable();
// Existing PostgreSQL names have no historical length/trim CHECK. Never truncate
// or apply SET validation to observations, including original receipt history.
const observedNickname = coreText(Number.MAX_SAFE_INTEGER)
  .refine((value) => value !== "")
  .nullable();
const pair = z.strictObject({ nickname: observedNickname, nicknameRevision: revision });
const intent = z.strictObject({
  contractVersion: z.literal(1),
  command: z.literal("SET_SELF_TRIP_NICKNAME"),
  operationId: coreUuid,
  tripId: coreUuid,
  personId: coreUuid,
  expectedNicknameRevision: revision,
  nickname: desiredNickname,
});
export const selfNicknameCommandSchema = intent.extend({ intentDigest: coreHash });
export type SelfNicknameCommand = z.infer<typeof selfNicknameCommandSchema>;
export type SelfNicknameIntent = z.infer<typeof intent>;

export function selfNicknameIntentBytes(
  input: SelfNicknameIntent,
  trustedActorAccountId: string,
) {
  const c = intent.parse(input);
  const actor = coreUuid.parse(trustedActorAccountId);
  return (
    "otr-self-trip-nickname-intent-v1\n" +
    JSON.stringify([
      1,
      c.command,
      c.operationId,
      actor,
      c.tripId,
      c.personId,
      String(c.expectedNicknameRevision),
      c.nickname,
    ])
  );
}
export function selfNicknameIntentDigest(
  input: SelfNicknameIntent,
  trustedActorAccountId: string,
) {
  return bytesToHex(
    sha256(
      new TextEncoder().encode(selfNicknameIntentBytes(input, trustedActorAccountId)),
    ),
  );
}
function intentOf(c: SelfNicknameCommand): SelfNicknameIntent {
  const { intentDigest: _digest, ...value } = c;
  return value;
}
/** trustedContext must come from the actual authenticated linked-self admission. */
export function parseSelfNicknameCommand(
  raw: unknown,
  trustedContext: SelfNicknameContext,
): SelfNicknameCommand {
  const context = selfNicknameContextSchema.parse(trustedContext);
  const command = selfNicknameCommandSchema.parse(raw);
  if (
    command.tripId !== context.tripId ||
    command.personId !== context.personId ||
    command.intentDigest !==
      selfNicknameIntentDigest(intentOf(command), context.accountId)
  ) {
    throw new Error("SELF_NICKNAME_COMMAND_BINDING");
  }
  return command;
}

export const selfNicknameReceiptSchema = z
  .strictObject({
    receiptVersion: z.literal(1),
    receiptId: coreUuid,
    actorAccountId: coreUuid,
    tripId: coreUuid,
    personId: coreUuid,
    operationId: coreUuid,
    intentDigest: coreHash,
    expectedNicknameRevision: revision,
    desiredNickname,
    outcome: z.enum(["APPLIED", "UNCHANGED", "REVISION_CONFLICT"]),
    prior: pair,
    resulting: pair,
    acceptedAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((r, ctx) => {
    const prior = r.prior,
      result = r.resulting;
    const same =
      prior.nickname === result.nickname &&
      prior.nicknameRevision === result.nicknameRevision;
    const conflict = r.expectedNicknameRevision !== prior.nicknameRevision;
    if (
      r.outcome === "REVISION_CONFLICT"
        ? !conflict || !same
        : conflict ||
          (r.outcome === "APPLIED"
            ? prior.nicknameRevision === Number.MAX_SAFE_INTEGER ||
              result.nicknameRevision !== prior.nicknameRevision + 1 ||
              result.nickname === prior.nickname ||
              result.nickname !== r.desiredNickname
            : !same || r.desiredNickname !== prior.nickname)
    )
      ctx.addIssue({ code: "custom", message: "SELF_NICKNAME_RECEIPT_OUTCOME" });
  });
export type SelfNicknameReceipt = z.infer<typeof selfNicknameReceiptSchema>;
/** Binds historical receipt to the original command, not to today's Person value. */
export function parseSelfNicknameReceipt(
  raw: unknown,
  command: SelfNicknameCommand,
  trustedContext: SelfNicknameContext,
) {
  const c = parseSelfNicknameCommand(command, trustedContext);
  const r = selfNicknameReceiptSchema.parse(raw);
  if (
    r.actorAccountId !== trustedContext.accountId ||
    r.tripId !== c.tripId ||
    r.personId !== c.personId ||
    r.operationId !== c.operationId ||
    r.intentDigest !== c.intentDigest ||
    r.expectedNicknameRevision !== c.expectedNicknameRevision ||
    r.desiredNickname !== c.nickname
  )
    throw new Error("SELF_NICKNAME_RECEIPT_BINDING");
  return r;
}
export const selfNicknameObservationSchema = selfNicknameContextSchema.extend({
  contractVersion: z.literal(1),
  nickname: observedNickname,
  nicknameRevision: revision,
  observedAt: z.iso.datetime({ offset: true }),
});
export function parseSelfNicknameObservation(
  raw: unknown,
  trustedContext: SelfNicknameContext,
) {
  const context = selfNicknameContextSchema.parse(trustedContext);
  const observation = selfNicknameObservationSchema.parse(raw);
  if (
    observation.accountId !== context.accountId ||
    observation.tripId !== context.tripId ||
    observation.personId !== context.personId
  )
    throw new Error("SELF_NICKNAME_READ_BINDING");
  return observation;
}
/** Canonical storage mapping only; neither function is a mutation/authority port. */
export function selfNicknameFromStorage(raw: unknown): string | null {
  const value = coreText(Number.MAX_SAFE_INTEGER).parse(raw);
  return value === "" ? null : value;
}
export function selfNicknameToStorage(raw: unknown): string {
  return desiredNickname.parse(raw) ?? "";
}

export const selfNicknameMutationResponseSchema = z.strictObject({
  receipt: selfNicknameReceiptSchema,
  idempotentReplay: z.boolean(),
});
export const selfNicknameRecoverRequestSchema = z.strictObject({
  intentDigest: coreHash,
});
export const selfNicknameRecoverResponseSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("EXACT_RECEIPT"),
    receipt: selfNicknameReceiptSchema,
  }),
  z.strictObject({ kind: z.literal("ABSENT_UNCONFIRMED") }),
]);
export function parseSelfNicknameMutationResponse(
  raw: unknown,
  command: SelfNicknameCommand,
  trustedContext: SelfNicknameContext,
) {
  const result = selfNicknameMutationResponseSchema.parse(raw);
  parseSelfNicknameReceipt(result.receipt, command, trustedContext);
  return result;
}
export function parseSelfNicknameRecoverResponse(
  raw: unknown,
  command: SelfNicknameCommand,
  trustedContext: SelfNicknameContext,
) {
  parseSelfNicknameCommand(command, trustedContext);
  const result = selfNicknameRecoverResponseSchema.parse(raw);
  if (result.kind === "EXACT_RECEIPT")
    parseSelfNicknameReceipt(result.receipt, command, trustedContext);
  return result;
}
