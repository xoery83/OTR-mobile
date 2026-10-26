import type { TripPerson } from "@/domain/trip/person";
import type { CoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { coreParticipationSchema } from "@/domain/trip/tripCoreV2";

// A negative dependency check only; this never grants Core/Person permission.
export function p1SharedParticipantsReady(
  command: CoreCommand,
  persons: readonly TripPerson[],
) {
  const payload = command.payload as Record<string, unknown>;
  if (!Object.hasOwn(payload, "participation")) return true;
  const selected = coreParticipationSchema.parse(payload.participation);
  // Source Prepare's PRIVATE/SELF command deliberately leaves the creator implicit.
  // The owning Core resolves/verifies that identity; there are no selected Person dependencies.
  const acl = payload.acl as { visibility?: string; people?: unknown[] } | undefined;
  if (
    command.command === "CREATE_ITEM" &&
    payload.family === "P1" &&
    command.admission.mode === "REVIEWED_SOURCE" &&
    command.admission.sourceIntentId !== null &&
    command.admission.policyVersion === null &&
    selected.mode === "SELF" &&
    selected.selfPersonId === null &&
    selected.people.length === 0 &&
    acl?.visibility === "PRIVATE" &&
    acl.people?.length === 0
  )
    return true;
  if (!persons.length || persons.some((person) => person.tripId !== command.tripId))
    return false;
  if (selected.mode === "WHOLE_GROUP")
    return persons.every((person) => person.localState !== "LOCAL_PENDING");
  const ids = selected.mode === "SELF" ? [selected.selfPersonId] : selected.people;
  return ids.every(
    (id) =>
      !!id &&
      persons.some(
        (person) => person.personId === id && person.localState !== "LOCAL_PENDING",
      ),
  );
}
