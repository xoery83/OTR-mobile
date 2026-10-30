import { validateCoreCommand, type CoreCommand } from "../trip/tripCoreV2Commands";
import { canonicalCoreJson, type Json } from "../trip/tripCoreV2Json";

// Explicit Person leaves only. Mapping is not Account connection or permission authority.
export function mapGuestAdoptionCommandIdentity(
  original: CoreCommand,
  people: ReadonlyMap<string, string>,
): CoreCommand {
  const command = JSON.parse(canonicalCoreJson(original as Json));
  const person = (id: string) => {
    const target = people.get(id);
    if (!target) throw Error("GUEST_ADOPTION_IDENTITY_PERSON_MISMATCH");
    return target;
  };
  const payload = command.payload as {
    participation?: { people: string[]; selfPersonId: string | null };
    acl?: { people: string[] };
  };
  if (payload.participation) {
    payload.participation.people = payload.participation.people.map(person);
    if (payload.participation.selfPersonId !== null)
      payload.participation.selfPersonId = person(payload.participation.selfPersonId);
  }
  if (payload.acl) payload.acl.people = payload.acl.people.map(person);
  return validateCoreCommand(command);
}
