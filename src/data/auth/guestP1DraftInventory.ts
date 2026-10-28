import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { ManualPlanFields } from "../repositories/manualPlanRepository";
import { requireCommittedGuestPrincipal } from "./authRepository";
import { getAccountGeneration } from "./accountGeneration";

type Scope = Readonly<{ kind: "GUEST"; localId: string; generation: number }>;
export type GuestP1DraftParticipant = {
  freeze(): {
    snapshot: {
      schemaId: "otr.auth.guest-p1-draft/1";
      tripId: string;
      itemId: string;
      mode: "CREATE" | "EDIT";
      fields: ManualPlanFields;
      initialFields: ManualPlanFields;
      firstAttempt: null;
      placeSelection: null;
    };
    isCurrent(): boolean;
    resume(): void;
  };
};

export function createGuestP1DraftInventory(
  assertScope: (scope: Scope) => Promise<void>,
) {
  const participants = new Set<GuestP1DraftParticipant>();
  let revision = 0;
  let active = false;
  return {
    register(participant: GuestP1DraftParticipant) {
      if (participants.has(participant)) throw Error("GUEST_DRAFT_DUPLICATE_PARTICIPANT");
      participants.add(participant);
      revision++;
      return () => {
        if (participants.delete(participant)) revision++;
      };
    },
    async freeze(scope: Scope) {
      scope = Object.freeze({ ...scope, localId: coreUuid.parse(scope.localId) });
      if (active) throw Error("GUEST_DRAFT_HANDOFF_ACTIVE");
      active = true;
      let released = false;
      const frozen: ReturnType<GuestP1DraftParticipant["freeze"]>[] = [];
      const resumeAll = () => {
        if (released) return;
        released = true;
        let failure: unknown;
        for (const participant of frozen) {
          try {
            participant.resume();
          } catch (error) {
            failure ??= error;
          }
        }
        active = false;
        if (failure) throw failure;
      };
      try {
        await assertScope(scope);
        const version = revision;
        for (const participant of participants) frozen.push(participant.freeze());
        const assertCurrent = async () => {
          await assertScope(scope);
          if (
            released ||
            version !== revision ||
            frozen.some((participant) => !participant.isCurrent())
          )
            throw Error("GUEST_DRAFT_HANDOFF_CHANGED");
        };
        const entries = await Promise.all(
          frozen.map(async ({ snapshot }) => {
            const id = coreUuid.parse(snapshot.itemId);
            coreUuid.parse(snapshot.tripId);
            const canonicalText = canonicalCoreJson(snapshot as unknown as Json);
            const bytes = new TextEncoder().encode(canonicalText);
            return {
              id,
              canonicalText,
              sha256: await tripCoreSha256Hex(bytes),
              bytes: bytes.byteLength,
            };
          }),
        );
        if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
          throw Error("GUEST_DRAFT_DUPLICATE_ITEM");
        await assertCurrent();
        return {
          schemaId: "otr.auth.guest-p1-drafts/1" as const,
          scope,
          entries,
          assertCurrent,
          async resume() {
            if (released) return;
            try {
              await assertCurrent();
            } finally {
              resumeAll();
            }
          },
        };
      } catch (error) {
        resumeAll();
        throw error;
      }
    },
  };
}

export const guestP1DraftInventory = createGuestP1DraftInventory(async (scope) => {
  const generation = getAccountGeneration();
  const principal = await requireCommittedGuestPrincipal();
  if (
    scope.kind !== "GUEST" ||
    scope.localId !== principal.localId ||
    scope.generation !== generation ||
    generation !== getAccountGeneration()
  )
    throw Error("GUEST_DRAFT_SCOPE_CHANGED");
});
