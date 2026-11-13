import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import type { CoreAcceptedCertificate } from "@/data/repositories/tripCoreV2Repository";
import type { TripPerson } from "@/domain/trip/person";
import { coreUuid } from "@/domain/trip/tripCoreV2";

const bindingSchema = z.strictObject({
  personId: coreUuid,
  connected: z.boolean(),
  isCurrentActor: z.boolean(),
});
export type AcceptedPeopleConnections = Readonly<{
  certificate: CoreAcceptedCertificate;
  people: readonly z.infer<typeof bindingSchema>[];
}>;
export type PeopleConnectionReader = (
  context: AccountRequestContext,
) => Promise<AcceptedPeopleConnections | null>;
type Connection =
  | Readonly<{ status: "UNKNOWN" }>
  | Readonly<{
      status: "OBSERVED_CACHE";
      connected: boolean;
      isCurrentActor: boolean;
    }>;

// Display projection only. Native's owning reader qualifies the accepted certificate; no access is granted here.
export async function readPeopleConnectionProjection(
  input: AccountRequestContext,
  sources: {
    account(): Promise<string>;
    listTripPersons(tripId: string): Promise<TripPerson[]>;
    connections?: PeopleConnectionReader;
  },
) {
  const context = Object.freeze({ ...input });
  coreUuid.parse(context.accountId);
  coreUuid.parse(context.tripId);
  await assertAccountRequestContext(context, sources.account);
  const people = (await sources.listTripPersons(context.tripId)).map((person) => ({
    ...person,
    participation: person.participation ? { ...person.participation } : null,
  }));
  await assertAccountRequestContext(context, sources.account);
  const ids = new Set<string>();
  for (const person of people) {
    coreUuid.parse(person.personId);
    if (person.tripId !== context.tripId || ids.has(person.personId))
      throw Error("PEOPLE_ROSTER_SCOPE_MISMATCH");
    ids.add(person.personId);
  }
  const incoming = (await sources.connections?.(context)) ?? null;
  const observation = incoming
    ? {
        epoch: incoming.certificate.epoch,
        coreAccessRevision: incoming.certificate.access_revision,
        people: incoming.people.map((raw) => bindingSchema.parse(raw)),
      }
    : null;
  await assertAccountRequestContext(context, sources.account);
  const bindings = new Map<string, z.infer<typeof bindingSchema>>();
  let own = 0;
  for (const raw of observation?.people ?? []) {
    const binding = bindingSchema.parse(raw);
    if (
      bindings.has(binding.personId) ||
      (binding.isCurrentActor && (!binding.connected || ++own > 1))
    )
      throw Error("PEOPLE_CONNECTION_BINDING_INVALID");
    bindings.set(binding.personId, binding);
  }
  return Object.freeze({
    context,
    // Only non-private Core observation metadata reaches the display consumer.
    observation: observation
      ? Object.freeze({
          epoch: observation.epoch,
          coreAccessRevision: observation.coreAccessRevision,
        })
      : null,
    people: Object.freeze(
      people.map((person) => {
        const binding =
          person.localState === "LOCAL_PENDING"
            ? undefined
            : bindings.get(person.personId);
        const connection: Connection = binding
          ? Object.freeze({
              status: "OBSERVED_CACHE",
              connected: binding.connected,
              isCurrentActor: binding.isCurrentActor,
            })
          : Object.freeze({ status: "UNKNOWN" });
        return Object.freeze({
          tripId: person.tripId,
          personId: person.personId,
          displayName: person.displayName,
          participation: person.participation
            ? Object.freeze({ ...person.participation })
            : null,
          ...(person.localState ? { localState: person.localState } : {}),
          connection,
        });
      }),
    ),
  });
}
