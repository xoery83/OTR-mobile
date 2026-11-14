import { z } from "zod";
import type { SecureSessionStorage } from "@/data/auth/authSessionRepository";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { coreText, coreUuid } from "@/domain/trip/tripCoreV2";
import { personCloudCreateSchema } from "@/domain/trip/tripPersonCloudCreate";

const attemptSchema = personCloudCreateSchema.pick({
  operationId: true,
  personId: true,
  displayName: true,
});
const draftSchema = z
  .strictObject({
    version: z.literal(1),
    accountId: coreUuid,
    tripId: coreUuid,
    displayName: coreText(256),
    attempt: attemptSchema.nullable(),
  })
  .refine((v) => !v.attempt || v.displayName === v.attempt.displayName);
export type TripPersonEditorDraft = z.infer<typeof draftSchema>;
export type TripPersonDraftStorage = Pick<
  SecureSessionStorage,
  "getItem" | "setItem" | "deleteItem"
>;
export type TripPersonEditorDraftPort = Readonly<{
  context: AccountRequestContext;
  read(): Promise<TripPersonEditorDraft | null>;
  saveName(name: string): Promise<TripPersonEditorDraft>;
  retainAttempt(input: z.input<typeof attemptSchema>): Promise<TripPersonEditorDraft>;
  complete(operationId: string): Promise<void>;
  discard(): Promise<void>;
}>;

export function bindTripPersonEditorDraft(
  store: ReturnType<typeof createTripPersonEditorDraft>,
  input: AccountRequestContext,
): TripPersonEditorDraftPort {
  const context = Object.freeze({ ...input });
  return {
    context,
    read: () => store.read(context),
    saveName: (name) => store.saveName(context, name),
    retainAttempt: (attempt) => store.retainAttempt(context, attempt),
    complete: (operationId) => store.complete(context, operationId),
    discard: () => store.discard(context),
  };
}

// Private editor data source for the existing Person repository, never a create/Sync authority.
export function createTripPersonEditorDraft(
  storage: TripPersonDraftStorage,
  account: () => Promise<string>,
) {
  const key = (scope: AccountRequestContext) =>
    `otr.people-editor.v1.${scope.accountId}.${scope.tripId}`;
  async function scoped<T>(
    input: AccountRequestContext,
    work: (scope: AccountRequestContext) => Promise<T>,
  ) {
    const scope = Object.freeze({ ...input });
    coreUuid.parse(scope.accountId);
    coreUuid.parse(scope.tripId);
    const result = await withAccountApplyGate(async () => {
      await assertAccountRequestContext(scope, account);
      const result = await work(scope);
      await assertAccountRequestContext(scope, account);
      return result;
    });
    await assertAccountRequestContext(scope, account);
    return result;
  }
  async function read(scope: AccountRequestContext) {
    const raw = await storage.getItem(key(scope));
    if (raw === null) return null;
    const draft = draftSchema.parse(JSON.parse(raw));
    if (draft.accountId !== scope.accountId || draft.tripId !== scope.tripId)
      throw Error("PERSON_DRAFT_CONTEXT_MISMATCH");
    return draft;
  }
  async function write(scope: AccountRequestContext, draft: TripPersonEditorDraft) {
    const parsed = draftSchema.parse(draft);
    await storage.setItem(key(scope), JSON.stringify(parsed));
    return parsed;
  }
  return {
    read(input: AccountRequestContext) {
      return scoped(input, read);
    },
    saveName(input: AccountRequestContext, name: string) {
      const displayName = coreText(256).parse(name);
      return scoped(input, async (scope) => {
        const prior = await read(scope);
        if (prior?.attempt) {
          if (prior.displayName !== displayName)
            throw Error("PERSON_DRAFT_ATTEMPT_FROZEN");
          return prior;
        }
        return write(scope, {
          version: 1,
          accountId: scope.accountId,
          tripId: scope.tripId,
          displayName,
          attempt: null,
        });
      });
    },
    retainAttempt(input: AccountRequestContext, raw: z.input<typeof attemptSchema>) {
      const attempt = attemptSchema.parse(raw);
      return scoped(input, async (scope) => {
        const prior = await read(scope);
        if (!prior || prior.displayName.trim() !== attempt.displayName)
          throw Error("PERSON_DRAFT_NAME_CHANGED");
        if (prior.attempt) {
          if (JSON.stringify(prior.attempt) !== JSON.stringify(attempt))
            throw Error("PERSON_DRAFT_ATTEMPT_COLLISION");
          return prior;
        }
        return write(scope, { ...prior, displayName: attempt.displayName, attempt });
      });
    },
    complete(input: AccountRequestContext, operationId: string) {
      const operation = coreUuid.parse(operationId);
      return scoped(input, async (scope) => {
        const prior = await read(scope);
        if (!prior) return;
        if (prior.attempt?.operationId !== operation)
          throw Error("PERSON_DRAFT_OPERATION_MISMATCH");
        await storage.deleteItem(key(scope));
      });
    },
    discard(input: AccountRequestContext) {
      return scoped(input, async (scope) => {
        const prior = await read(scope);
        if (prior?.attempt) throw Error("PERSON_DRAFT_PENDING_REQUIRES_RECOVERY");
        if (prior) await storage.deleteItem(key(scope));
      });
    },
  };
}
