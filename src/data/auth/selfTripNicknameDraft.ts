import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  selfNicknameIntentDigest,
  parseSelfNicknameCommand,
  parseSelfNicknameObservation,
  parseSelfNicknameReceipt,
  type SelfNicknameCommand,
  type SelfNicknameReceipt,
} from "@/domain/trip/tripPersonSelfNickname";
import type { SelfTripNicknameRepository } from "@/data/repositories/selfTripNicknameRepository";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "./accountRequestContext";
const patchSchema = z.strictObject({ nickname: z.string().nullable().optional() });

// A parsed self-context is not an authority grant; actual linked-self admission remains on Backend.
export async function createSelfTripNicknameDraft(
  account: () => Promise<string>,
  input: AccountRequestContext,
  personId: string,
  loaded: unknown,
  repository?: Pick<SelfTripNicknameRepository, "execute" | "recover">,
) {
  const scope = Object.freeze({ ...input, personId });
  const context = Object.freeze({
    accountId: scope.accountId,
    tripId: scope.tripId,
    personId,
  });
  const base = Object.freeze(parseSelfNicknameObservation(loaded, context));
  await assertAccountRequestContext(scope, account);
  let patch: z.infer<typeof patchSchema> = {};
  let original: Readonly<SelfNicknameCommand> | undefined;
  let attempted = false;
  const current = () => assertAccountRequestContext(scope, account);
  return Object.freeze({
    async read() {
      await current();
      return { base, patch: Object.freeze({ ...patch }) };
    },
    async edit(value: unknown) {
      const next = patchSchema.parse(value);
      await current();
      patch = next;
    },
    async prepare(operationId: string) {
      const desired = { ...patch };
      await current();
      if (desired.nickname === undefined) return Object.freeze({ kind: "KEEP" as const });
      if (original) throw Error("SELF_TRIP_NICKNAME_ORIGINAL_RETAINED");
      const intent = {
        contractVersion: 1 as const,
        command: "SET_SELF_TRIP_NICKNAME" as const,
        operationId: coreUuid.parse(operationId),
        tripId: base.tripId,
        personId: base.personId,
        expectedNicknameRevision: base.nicknameRevision,
        nickname: desired.nickname,
      };
      original = Object.freeze(
        parseSelfNicknameCommand(
          {
            ...intent,
            intentDigest: selfNicknameIntentDigest(intent, context.accountId),
          },
          context,
        ),
      );
      return Object.freeze({ kind: "COMMAND" as const, original });
    },
    async recoveryInput() {
      await current();
      if (!original) throw Error("SELF_TRIP_NICKNAME_ORIGINAL_REQUIRED");
      return original;
    },
    async checkReceipt(receipt: SelfNicknameReceipt) {
      await current();
      if (!original) throw Error("SELF_TRIP_NICKNAME_ORIGINAL_REQUIRED");
      parseSelfNicknameReceipt(receipt, original, context);
      // Historical receipt never overwrites current draft or becomes fresh readback.
    },
    async submit() {
      await current();
      if (!original || !repository)
        throw Error("SELF_TRIP_NICKNAME_ORIGINAL_OR_PORT_REQUIRED");
      if (attempted) throw Error("SELF_TRIP_NICKNAME_ALREADY_ATTEMPTED_RECOVER_ORIGINAL");
      attempted = true;
      const result = await repository.execute(scope, original);
      await current();
      return result;
    },
    async recover() {
      await current();
      if (!original || !repository || !attempted)
        throw Error("SELF_TRIP_NICKNAME_ORIGINAL_OR_PORT_REQUIRED");
      const result = await repository.recover(scope, original);
      await current();
      return result;
    },
  });
}
