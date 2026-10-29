import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { p1SharedParticipantsReady } from "./p1SharedParticipantQualification";
import type { CoreCommand } from "@/domain/trip/tripCoreV2Commands";
import type { TripPerson } from "@/domain/trip/person";
const trip = randomUUID(),
  formal = randomUUID(),
  local = randomUUID();
const persons: TripPerson[] = [
  { tripId: trip, personId: formal, displayName: "Owner", participation: null },
  {
    tripId: trip,
    personId: local,
    displayName: "Private local name",
    participation: null,
    localState: "LOCAL_PENDING",
  },
];
const command = (participation: unknown) =>
  ({
    tripId: trip,
    target: { kind: "ITEM", id: randomUUID() },
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { participation },
  }) as CoreCommand;
it("withholds Whole Group instead of silently dropping local-only named travelers", () => {
  const c = command({ mode: "WHOLE_GROUP", people: [], selfPersonId: null });
  expect(p1SharedParticipantsReady(c, persons)).toBe(false);
  expect(persons[1].displayName).toBe("Private local name");
});
it("requires every selected identity already shared and exact Trip scoped", () => {
  expect(
    p1SharedParticipantsReady(
      command({ mode: "SELECTED_MEMBERS", people: [formal, local], selfPersonId: null }),
      persons,
    ),
  ).toBe(false);
  expect(
    p1SharedParticipantsReady(
      command({ mode: "SELECTED_MEMBERS", people: [formal], selfPersonId: null }),
      persons,
    ),
  ).toBe(true);
  expect(
    p1SharedParticipantsReady(
      command({ mode: "SELF", people: [], selfPersonId: formal }),
      persons.map((p) => ({ ...p, tripId: randomUUID() })),
    ),
  ).toBe(false);
});
