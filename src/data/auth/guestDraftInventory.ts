import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { coreUuid } from "@/domain/trip/tripCoreV2";
export type GuestDraftScope = Readonly<{
  kind: "GUEST";
  localId: string;
  generation: number;
}>;
export type GuestDraftParticipant<Snapshot> = {
  freeze(): { snapshot: Snapshot; isCurrent(): boolean; resume(): void };
};

export function createGuestDraftInventory<
  Snapshot extends { tripId: string },
  const Schema extends string,
>(
  assertScope: (scope: GuestDraftScope) => Promise<void>,
  schemaId: Schema,
  entryId: (snapshot: Snapshot) => string,
) {
  const participants = new Set<GuestDraftParticipant<Snapshot>>();
  let revision = 0;
  let active = false;
  return {
    register(participant: GuestDraftParticipant<Snapshot>) {
      if (participants.has(participant)) throw Error("GUEST_DRAFT_DUPLICATE_PARTICIPANT");
      participants.add(participant);
      revision++;
      return () => {
        if (participants.delete(participant)) revision++;
      };
    },
    async freeze(scope: GuestDraftScope) {
      scope = Object.freeze({ ...scope, localId: coreUuid.parse(scope.localId) });
      if (active) throw Error("GUEST_DRAFT_HANDOFF_ACTIVE");
      active = true;
      let released = false;
      const frozen: ReturnType<GuestDraftParticipant<Snapshot>["freeze"]>[] = [];
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
            const id = coreUuid.parse(entryId(snapshot));
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
          schemaId,
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
