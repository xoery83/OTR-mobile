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
